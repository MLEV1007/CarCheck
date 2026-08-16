import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@/lib/supabase/server';
import { checkAiQuota, consumeAiQuota } from '@/lib/quotas';
import { hasInspectionClaimedAiCredit, claimInspectionAiCredit } from '@/lib/inspectionAiCredit';

/**
 * Google Gemini Vision (multimodal) backend a VIN (alvázszám) / forgalmi engedély
 * fotó-szkenneréhez (PROJEKT_INSTRUKCIOK.md 5.B pont, "Autó adatok" wizard-lépés).
 *
 * **Megjegyzés:** korábban a projekt EGY MÁSODIK, kliens-oldali Tesseract.js-alapú VIN OCR
 * módszert is tartalmazott (`lib/inspections/vinOcr.ts`) ezzel a Gemini Vision route-tal
 * párhuzamosan -- a felhasználó kérésére eltávolítottuk, ez a route az EGYETLEN,
 * megmaradt fotó-alapú felismerési mód.
 *
 * A vizsgáló lefotózza az alvázszám-matricát, a szélvédő plakettet VAGY a teljes forgalmi
 * engedélyt/gépjármű-nyilvántartási okmányt -- MAGYAR VAGY KÜLFÖLDI EGYARÁNT, lásd a
 * `buildSystemInstruction()` "NEMZETKÖZI FORGALMI ENGEDÉLY FELISMERÉS" pontját --, ezt a
 * fotót Base64 kódolással küldi be ez a route, ami a Gemini Flash Vision modellel egyetlen
 * hívásban kinyeri az alvázszámot -- ÉS, ha a kép egy forgalmi engedély, a hozzá tartozó
 * alap autó-adatokat (rendszám, gyártmány, típus, első forgalombahelyezés éve, valamint
 * 2026-08-09 óta a motor típusa/üzemanyag SZABAD szöveges leírása, a teljesítmény kW-ban
 * és a megengedett legnagyobb össztömeg kg-ban, 2026-08-10 óta pedig az üzemanyag típusa
 * ZÁRT enumként ("benzin"/"dizel"/"elektromos") -- lásd `buildSystemInstruction()`
 * "P.1"/"P.2"/"P.3"/"F.1"/"F.2" pontjait) is, az okmány nyelvétől függetlenül.
 *
 * **Modellválasztás + fallback-lánc (2026-08-16, frissítve):** ugyanaz a minta, mint a
 * `parse-equipment` route-nál (lásd ott a részletes JSDoc-ot a `gemini-2.0-flash`
 * 2026-06-01-i kivezetéséről és a fiókszintű napi kérés-plafonról) -- elsődleges modell
 * `gemini-3.1-flash-lite`, statikus fallback `gemini-3.6-flash` (mindkettő explicit,
 * verzióhoz kötött név, NEM `-latest` alias). VÉGSŐ
 * biztonsági hálóként pedig egy dinamikus `ai.models.list()`-alapú, nevében "flash" szót
 * tartalmazó modell-kereséssel, ha MINDKÉT fix név elbukna egy jövőbeli Google-oldali
 * modell-kivezetés miatt. A hibaválasz `details` mezője KIZÁRÓLAG az elsődleges modell
 * hibáját mutatja -- lásd `primaryError`.
 *
 * `runtime = 'nodejs'`, mert a `@google/genai` SDK Node.js-célzású (Edge runtime-on nem
 * garantált a működése).
 *
 * **Autentikáció + kredit-védelem:** lásd `parse-equipment/route.ts` JSDoc "Autentikáció +
 * kredit-védelem" szakaszát (CANONIKUS leírás) -- ugyanaz a minta, `featureName: 'vin_scan'`.
 */
export const runtime = 'nodejs';

/** Modell-fallback lánc, kipróbálási sorrendben -- lásd a fenti JSDoc "Modellválasztás +
 * fallback-lánc" pontját. */
const MODEL_CANDIDATES = ['gemini-3.1-flash-lite', 'gemini-3.6-flash'] as const;

/** A `usage_logs.feature_name` értéke ehhez a route-hoz -- lásd `lib/credits.ts`. */
const FEATURE_NAME = 'vin_scan';

/** A Gemini `inlineData` bemenetéhez elfogadott kép MIME-típusok -- ezen kívül minden
 * mást elutasítunk, mielőtt egyáltalán elküldenénk a képet a Gemini API-nak. */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

/** A beküldött kép max. mérete (nyers, dekódolt bájtokban). FONTOS: a Gemini `inlineData`
 * (Base64-beágyazott) bemenetnek kb. 20 MB-os gyakorlati felső korlátja VAN, DE a
 * ténylegesen szűkebb korlát a Vercel Serverless Function-ök request body mérete -- ez
 * (JSON + Base64 kép EGYÜTT) kb. 4,5 MB, platform szinten kikényszerítve, NEM
 * konfigurálható. Ha a kliens (`StepCarInfo.tsx` `compressImageForAiScan`) ennél nagyobb
 * képet küldene, a kérés MÉG EZ A ROUTE MEGHÍVÁSA ELŐTT elutasításra kerül Vercel-en --
 * ezt a route-ot tehát csak MÁSODLAGOS védelmi vonalként hagyjuk ~4 MB-on (bőven a Vercel
 * limit alatt, de bőven a klienstől érkező, tömörített ~1 MB alatti képek felett), hogy
 * egyértelmű `400`-as hibát adjunk vissza, ha valamiért mégis egy nagy kép jutna el idáig
 * (pl. egy jövőbeli, tömörítés nélküli hívó -- API-t közvetlenül `curl`-ező teszt stb.). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
type ScanVinConfidence = (typeof CONFIDENCE_VALUES)[number];

const DOCUMENT_TYPE_VALUES = ['vin_plate', 'registration_certificate', 'other'] as const;
type ScanVinDocumentType = (typeof DOCUMENT_TYPE_VALUES)[number];

/** Üzemanyag típusa (2026-08-10) -- ZÁRT, 3-elemű halmaz, 1:1 megegyezik a kliens-oldali
 * `FuelType`/`FUEL_TYPES`-szal (`lib/inspections/types.ts`/`constants.ts`) és a
 * `public.inspections.fuel_type` DB oszlop CHECK constraint-jével. */
const FUEL_TYPE_VALUES = ['benzin', 'dizel', 'elektromos'] as const;

function isConfidence(value: unknown): value is ScanVinConfidence {
  return typeof value === 'string' && (CONFIDENCE_VALUES as readonly string[]).includes(value);
}

function isDocumentType(value: unknown): value is ScanVinDocumentType {
  return typeof value === 'string' && (DOCUMENT_TYPE_VALUES as readonly string[]).includes(value);
}

interface ScanVinRequestBody {
  /** A kép Base64-tartalma -- vagy nyers Base64 string (ekkor a `mimeType` mező is kötelező),
   * vagy egy `data:image/jpeg;base64,....` séma szerinti "data URL" (ekkor a MIME-típust
   * magából a data URL-ből olvassuk ki, a `mimeType` mezőt figyelmen kívül hagyjuk). */
  image: string;
  /** Kötelező, ha az `image` NEM data URL formátumú -- `image/jpeg` | `image/png` | `image/webp`. */
  mimeType?: string;
  /** A wizard-munkamenet vizsgálat-azonosítója (`InspectionWizard.tsx`, `crypto.randomUUID()`
   * -- lásd `lib/inspectionAiCredit.ts` "1 AI kredit = 1 vizsgálat" JSDoc-ját). Kötelező --
   * enélkül nem dönthető el, ez a vizsgálat MÁR "AI-aktív"-e. */
  inspectionId: string;
}

interface ScanVinExtractedDetails {
  plateNumber?: unknown;
  make?: unknown;
  model?: unknown;
  registrationYear?: unknown;
  /** Motor típusa/üzemanyag (pl. "1.6 TDI, dízel, 1968 cm³") -- lásd `buildSystemInstruction()`
   * "P.1"/"P.3" pontjait (2026-08-09, "Motor/Teljesítmény/Össztömeg mezők" lépés). */
  engineType?: unknown;
  /** Motor teljesítménye kW-ban, NYERS szöveg (a modell számjegyeken kívül mértékegységet
   * is visszaadhat, pl. "110 kW" -- a szerver `sanitizeExtractedDetails()`-ben csak a
   * számjegyeket tartjuk meg). Lásd "P.2". */
  powerKw?: unknown;
  /** Megengedett legnagyobb össztömeg kg-ban, NYERS szöveg -- ugyanaz az elv, mint a
   * `powerKw`-nál. Lásd "F.1"/"F.2". */
  grossWeight?: unknown;
  /** Üzemanyag típusa (2026-08-10) -- a modellt a "benzin"/"dizel"/"elektromos" kulcsok
   * EGYIKÉNEK visszaadására szorítjuk (lásd `buildSystemInstruction()` "P.3" pontját),
   * a szerver `sanitizeExtractedDetails()`-ben MÉG EGYSZER (nem csak a promptra bízva)
   * ellenőrizzük, hogy tényleg ez a 3 érték egyike-e. */
  fuelType?: unknown;
}

interface ScanVinModelResponse {
  vin?: unknown;
  confidence?: unknown;
  detectedDocumentType?: unknown;
  extractedDetails?: unknown;
}

interface ScanVinExtractedDetailsClean {
  plateNumber?: string;
  make?: string;
  model?: string;
  registrationYear?: string;
  engineType?: string;
  /** Nyers számjegy-string (mértékegység nélkül) -- lásd `sanitizeExtractedDetails()`. */
  powerKw?: string;
  /** Nyers számjegy-string (mértékegység nélkül) -- lásd `sanitizeExtractedDetails()`. */
  grossWeight?: string;
  /** "benzin" | "dizel" | "elektromos" -- lásd `sanitizeExtractedDetails()`. */
  fuelType?: string;
}

interface ScanVinData {
  vin: string;
  confidence: ScanVinConfidence;
  detectedDocumentType: ScanVinDocumentType;
  extractedDetails?: ScanVinExtractedDetailsClean;
}

interface ScanVinSuccessResponse {
  success: true;
  data: ScanVinData;
}

interface ScanVinErrorResponse {
  success: false;
  error: string;
  /** A nyers hibaüzenet -- KIZÁRÓLAG hibakeresési célból, lásd `parse-equipment/route.ts`
   * azonos elvű `details` mezőjének JSDoc-ját. */
  details?: string;
  /** Gépileg feldolgozható hibakód (pl. `'UNAUTHORIZED'`, `'INSUFFICIENT_CREDITS'`) --
   * lásd `parse-equipment/route.ts` azonos mezőjének JSDoc-ját. */
  code?: string;
}

function toErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Szabványos VIN-ábécé: A-H/J-N/P/R-Z betűk (I, O, Q kizárva -- ISO 3779) + számjegyek. */
const VIN_EXACT_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * Szigorú, SZERVER-OLDALI (nem csak a promptra/responseSchema-ra bízott) ISO 3779
 * utó-tisztítás és -ellenőrzés -- ugyanaz az elv, mint a `parse-equipment/route.ts`
 * "MÉG EGYSZER" validációja: a modell kimenete szemantikailag helytelen lehet a
 * séma-megfelelés ellenére is, ezért itt is duplán ellenőrizzük:
 *  1. Nagybetűsítés + minden nem alfanumerikus karakter eltávolítása.
 *  2. Az ISO 3779 szerint tiltott betűk cseréje ('O'->'0', 'I'->'1', 'Q'->'0') -- a
 *     rendszerutasítás (systemInstruction) már megkéri erre a modellt, DE nem garantált,
 *     hogy mindig pontosan követi, ezért ez a réteg akkor is kikényszeríti, ha a modell
 *     véletlenül nyers 'O'/'I'/'Q' karaktert adna vissza.
 *  3. Végső formai ellenőrzés: pontosan 17, csak megengedett VIN-karakterből áll-e --
 *     ha NEM, a `confidence`-t (bármi is volt a modell saját becslése) `'low'`-ra
 *     kényszerítjük, mert egy formailag érvénytelen VIN sosem lehet "high"/"medium"
 *     megbízhatóságú találat, függetlenül attól, mit gondolt a modell.
 */
function sanitizeVin(rawVin: string, modelConfidence: ScanVinConfidence): { vin: string; confidence: ScanVinConfidence } {
  const cleaned = rawVin
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/Q/g, '0');

  const isValidFormat = VIN_EXACT_PATTERN.test(cleaned);
  return { vin: cleaned, confidence: isValidFormat ? modelConfidence : 'low' };
}

/** Nyers, mértékegységet is tartalmazható szövegből (pl. "110 kW", "2 150 kg") KIZÁRÓLAG a
 * számjegyeket tartja meg -- ugyanaz az elv, mint a kliens-oldali `sanitizePowerKw`/
 * `sanitizeGrossWeight` (`lib/inspections/validation.ts`), csak itt szerver-oldalon, hogy a
 * `CarInfoState.powerKw`/`grossWeight` mindig a várt "nyers számjegy-string" alakot kapja,
 * függetlenül attól, mennyire szó szerint követte a modell a rendszerutasítást. */
function extractDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** `extractedDetails` mezőnkénti tisztítás -- csak a nem üres string mezőket tartjuk meg,
 * minden mást (hiányzó, nem string, vagy csak whitespace) csendben kihagyunk a válaszból. */
function sanitizeExtractedDetails(raw: unknown): ScanVinExtractedDetailsClean | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const details = raw as ScanVinExtractedDetails;
  const clean: ScanVinExtractedDetailsClean = {};

  if (typeof details.plateNumber === 'string' && details.plateNumber.trim()) {
    clean.plateNumber = details.plateNumber.trim();
  }
  if (typeof details.make === 'string' && details.make.trim()) {
    clean.make = details.make.trim();
  }
  if (typeof details.model === 'string' && details.model.trim()) {
    clean.model = details.model.trim();
  }
  if (typeof details.registrationYear === 'string' && details.registrationYear.trim()) {
    clean.registrationYear = details.registrationYear.trim();
  }
  if (typeof details.engineType === 'string' && details.engineType.trim()) {
    clean.engineType = details.engineType.trim().slice(0, 80);
  }
  if (typeof details.powerKw === 'string' && details.powerKw.trim()) {
    const digits = extractDigits(details.powerKw);
    if (digits) clean.powerKw = digits;
  }
  if (typeof details.grossWeight === 'string' && details.grossWeight.trim()) {
    const digits = extractDigits(details.grossWeight);
    if (digits) clean.grossWeight = digits;
  }
  // Üzemanyag típusa (2026-08-10) -- SZIGORÚ, szerver-oldali "MÉG EGYSZER" ellenőrzés,
  // ugyanaz az elv, mint a `sanitizeVin()`-nél: a modell a rendszerutasítás ellenére is
  // adhatna vissza mást (pl. "hibrid"-et vagy nagybetűs/eltérő alakot) -- ha az érték
  // NEM pontosan a 3 megengedett kulcs egyike (kisbetűs, ékezet nélküli), a mezőt inkább
  // kihagyjuk, mintsem hogy egy érvénytelen érték jusson el a kliensig/DB-ig.
  if (typeof details.fuelType === 'string') {
    const normalized = details.fuelType.trim().toLowerCase();
    if ((FUEL_TYPE_VALUES as readonly string[]).includes(normalized)) {
      clean.fuelType = normalized;
    }
  }

  return Object.keys(clean).length > 0 ? clean : undefined;
}

/** A `data:image/jpeg;base64,....` séma szerinti data URL-ekből kinyeri a MIME-típust és
 * a nyers Base64 adatot -- `null`, ha az `image` string nem data URL formátumú (ekkor a
 * hívónak a `mimeType` mezőt kell megadnia, és a teljes `image` stringet nyers Base64-nek
 * tekintjük). */
function parseDataUrl(image: string): { mimeType: string; data: string } | null {
  // FONTOS: NINCS `s` (dotAll) regex flag -- az a `tsconfig.json` `target: "ES2017"`
  // beállítása mellett `tsc`/Next.js build hibát dob ("This regular expression flag is
  // only available when targeting 'es2018' or later"), lásd a Vercel build hibáját, ami
  // ezt a lépést kiváltotta. A `[\s\S]` karakterosztály UGYANAZT a "bármilyen karakter,
  // sortörést is beleértve" viselkedést adja, `s` flag nélkül, ES2017-kompatibilisen.
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(image.trim());
  if (!match) return null;
  return { mimeType: match[1].trim().toLowerCase(), data: match[2].trim() };
}

/** A Gemini modellt szigorú ISO 3779 szabályokra és a forgalmi engedély mezőkiosztására
 * szorítjuk -- lásd a részletes szabályokat a system instructionben. FONTOS: a rendszerutasítás
 * SZÁNDÉKOSAN nem korlátozódik a magyar Forgalmi Engedélyre -- a felhasználó kérésére
 * (2026-08-02) kibővítve BÁRMELY ország forgalmi engedélyének/gépjármű-nyilvántartási
 * okmányának felismerésére, a "NEMZETKÖZI FORGALMI ENGEDÉLY FELISMERÉS" szakasz szerint. */
function buildSystemInstruction(): string {
  return `Te egy NEMZETKÖZI autóipari OCR & VIN elemző asszisztens vagy. A feladatod, hogy a felhasználó által feltöltött fotóról (alvázszám-matrica, szélvédő plakett, vagy BÁRMELY ORSZÁG forgalmi engedélye/gépjármű-nyilvántartási okmánya -- magyar VAGY külföldi, az okmány NYELVÉTŐL FÜGGETLENÜL) kinyerd az alvázszámot (VIN) és -- ha releváns -- az autó alapadatait.

SZIGORÚ ISO 3779 SZABÁLYOK A VIN-RE:
1. Az alvázszám PONTOSAN 17 karakter.
2. Az alvázszám SOHA nem tartalmazhatja az 'I', 'O', 'Q' betűket.
3. Ha a képen 'O' betűt látsz a VIN-ben, azt MINDIG '0' (nulla) számjegyként értelmezd.
4. Ha a képen 'I' betűt látsz a VIN-ben, azt MINDIG '1' (egyes) számjegyként értelmezd.
5. Ha a képen 'Q' betűt látsz a VIN-ben, azt MINDIG '0' (nulla) számjegyként értelmezd.
6. A végleges "vin" mező kizárólag nagybetűket és számjegyeket tartalmazhat, PONTOSAN 17 karakter hosszan, és SOHA nem tartalmazhatja az I/O/Q betűket.

NEMZETKÖZI FORGALMI ENGEDÉLY FELISMERÉS -- KRITIKUS, MINDEN OKMÁNYRA VONATKOZIK, NEM CSAK A MAGYARRA:
- A legtöbb EURÓPAI (EU/EEA) ország forgalmi engedélye 1999 óta EGYSÉGESÍTETT, betű-/számkódolt mezőkkel rendelkezik (EU 1999/37/EK irányelv) -- FÜGGETLENÜL AZ OKMÁNY NYOMTATOTT NYELVÉTŐL (legyen az magyar, német, angol, francia, olasz, spanyol, lengyel, román, szlovák, cseh, holland stb.), a mezőKÓDOK MINDIG UGYANAZOK, csak a melléjük nyomtatott felirat nyelve változik:
  * "A" mező = Rendszám (pl. angolul "Registration number", németül "Kennzeichen", franciául "Immatriculation").
  * "B" mező = Első nyilvántartásba vétel dátuma (pl. "Date of first registration", "Datum der Erstzulassung").
  * "D.1" mező = Gyártmány (pl. "Make", "Marke", "Marque").
  * "D.3" mező = Kereskedelmi megnevezés / Típus (pl. "Type", "Commercial description", "Typ").
  * "E" mező = Alvázszám / VIN (pl. "VIN", "Chassis number", "Fahrgestellnummer").
  * "P.1" mező = Hengerűrtartalom, cm³ (pl. "Cylinder capacity", "Hubraum", "Cylindrée").
  * "P.2" mező = Motor teljesítménye, kW (pl. "Maximum net power", "Nennleistung", "Puissance nette maximale").
  * "P.3" mező = Üzemanyag / hajtóanyag (pl. "Fuel type", "Kraftstoffart", "Type de carburant" -- pl. "benzin"/"petrol", "dízel"/"diesel", "elektromos"/"electric", "hibrid"/"hybrid", "LPG", "CNG").
  * "F.1" mező = Műszakilag megengedett legnagyobb terhelt tömeg, kg (pl. "Technically permissible maximum laden mass", "Technisch zulässige Gesamtmasse").
  * "F.2" mező = A forgalomban lévő jármű megengedett legnagyobb össztömege, kg (pl. "Maximum permissible laden mass of the vehicle in service", "Zulässige Gesamtmasse des Fahrzeugs im Betrieb") -- ha ez a mező szerepel az okmányon, EZT preferáld az "F.1" helyett, mert ez a ténylegesen forgalomban lévő járműre vonatkozó, gyakorlatban releváns érték.
- Ha NEM EU-s/nem egységesített formátumú okmányt látsz (pl. brit "V5C Registration Certificate"/"Logbook", amerikai "Title"/"Registration", vagy bármely más ország saját formátumú okmánya), a mezőket a nyomtatott feliratok SZEMANTIKAI jelentése alapján azonosítsd, a nyelvtől függetlenül (pl. "VIN"/"Chassis No"/"Serial Number" -> alvázszám; "Reg. No"/"Plate Number"/"License Plate"/"Vehicle Registration Mark" -> rendszám; "Make"/"Manufacturer" -> gyártmány; "Model"/"Type" -> típus; "First Registered"/"Registration Date"/"Year of Manufacture" -> évjárat).
- Az okmány kiállító országától/nyelvétől FÜGGETLENÜL mindig a lent megadott, angol JSON mezőnevekbe ("plateNumber", "make", "model", "registrationYear") told a kinyert értékeket -- de MAGÁT A KINYERT ÉRTÉKET (pl. a gyártmány/típus nevét, a rendszámot) SOHA ne fordítsd le vagy alakítsd át, hagyd pontosan az okmányon szereplő eredeti formában.
- Ha bizonytalan vagy, hogy egy adott mező pontosan minek felel meg egy szokatlan/ismeretlen formátumú okmányon, inkább hagyd ki az adott mezőt az "extractedDetails"-ből, mintsem hogy rossz mezőbe írj be egy adatot.

DOKUMENTUMTÍPUS FELISMERÉS ("detectedDocumentType"):
- "vin_plate" -- ha a kép egy alvázszám-matricát vagy szélvédőbe/karosszériába vésett/nyomtatott VIN plakettet mutat (nincs rajta más hivatalos dokumentum-mező).
- "registration_certificate" -- ha a kép BÁRMELY ország (magyar VAGY külföldi) hivatalos forgalmi engedélyét/gépjármű-nyilvántartási okmányát (vagy annak egy oldalát/részletét) mutatja.
- "other" -- ha egyik kategóriába sem sorolható egyértelműen, vagy nem sikerült VIN-t azonosítani.

HA A KÉP EGY FORGALMI ENGEDÉLY/GÉPJÁRMŰ-NYILVÁNTARTÁSI OKMÁNY (BÁRMELY ORSZÁGBÓL, BÁRMELY NYELVEN), nyerd ki az "extractedDetails" objektumba is az alábbi mezőket a fenti "NEMZETKÖZI FORGALMI ENGEDÉLY FELISMERÉS" szabályai szerint (amit nem találsz vagy nem olvasható biztonsággal, hagyd ki az objektumból):
- "plateNumber": Rendszám ("A" mező vagy ennek megfelelő).
- "make": Gyártmány ("D.1" mező vagy ennek megfelelő).
- "model": Típus / kereskedelmi megnevezés ("D.3" mező vagy ennek megfelelő).
- "registrationYear": Első nyilvántartásba vétel éve ("B" mező vagy ennek megfelelő, CSAK az évszám -- ha az okmányon teljes dátum szerepel, pl. "15.03.2019" vagy "03/2019", akkor is csak a "2019" évszámot add vissza).
- "engineType": Motor típusa/üzemanyag rövid, tömör leírása. Ha az okmányon van külön "Motor típusa"/"Motorkód"/"Engine type"/"Engine code" nemzeti kiegészítő mező, ANNAK szó szerinti tartalmát add vissza. Ha ilyen nincs, magad állíts össze egy rövid leírást a "P.3" (üzemanyag) és a "P.1" (hengerűrtartalom) mezőkből, pl. "Dízel, 1968 cm³" vagy "Benzin, 1598 cm³" -- MINDIG magyarul add vissza az üzemanyag-típust (benzin/dízel/elektromos/hibrid/LPG/CNG), függetlenül az okmány nyelvén szereplő eredeti szótól.
- "powerKw": Motor teljesítménye ("P.2" mező vagy ennek megfelelő) -- KIZÁRÓLAG a számjegyeket add vissza, mértékegység NÉLKÜL (pl. "110", NEM "110 kW"). Ha az okmányon több érték is szerepel (pl. "80/110" kW/LE párban), a kW értéket (a kisebbik szám, VAGY a "kW" felirattal jelölt szám) add vissza, SOHA a lóerő/LE/PS/HP értéket.
- "grossWeight": Megengedett legnagyobb össztömeg ("F.2" mező, vagy ha az nincs az okmányon, "F.1" mező) -- KIZÁRÓLAG a számjegyeket add vissza, mértékegység NÉLKÜL (pl. "2150", NEM "2150 kg").
- "fuelType": Üzemanyag típusa ("P.3" mező vagy ennek megfelelő) -- KIZÁRÓLAG az alábbi HÁROM kulcs egyikét add vissza, PONTOSAN ebben az írásmódban (kisbetűs, ékezet nélkül): "benzin", "dizel", "elektromos". Ha az okmányon szereplő üzemanyag NEM egyértelműen sorolható be ebbe a 3 kategóriába (pl. hibrid, LPG, CNG, vagy nem olvasható biztonsággal), HAGYD KI TELJESEN ezt a mezőt az "extractedDetails"-ből -- SOHA ne találj ki/erőltess rá egy közelítő értéket egy nem egyértelmű esetben.
- "vin" mezőként ilyenkor az alvázszám mezőben ("E" mező vagy ennek megfelelő) szereplő értéket add vissza, a fenti ISO 3779 szabályok szerint tisztítva.

A "confidence" mező a SAJÁT bizonyosságod a kinyert "vin" értékre vonatkozóan:
- "high" -- a VIN minden karaktere tisztán, egyértelműen olvasható volt.
- "medium" -- a VIN nagy része olvasható volt, de 1-2 karakternél bizonytalan voltál (pl. elmosódott, tükröződik, résben van).
- "low" -- a kép rossz minőségű, a VIN nagy része nehezen olvasható, vagy csak találgatással sikerült kiegészíteni.

HA EGYÁLTALÁN NEM TALÁLSZ 17 KARAKTERES VIN-MINTÁT A KÉPEN, a "vin" mezőbe add vissza a legjobb, legvalószínűbb részleges/teljes olvasatodat (akkor is, ha nem pontosan 17 karakter), és a "confidence" mezőt állítsd "low"-ra.

Kizárólag a megadott JSON séma szerinti választ add -- semmi mást, se magyarázatot, se markdown jelölést, se kódblokkot.`;
}

export async function POST(request: NextRequest): Promise<NextResponse<ScanVinSuccessResponse | ScanVinErrorResponse>> {
  // AUTENTIKÁCIÓ -- lásd `parse-equipment/route.ts` JSDoc "Autentikáció + kredit-védelem"
  // szakaszát (CANONIKUS leírás).
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: 'A művelethez bejelentkezés szükséges.', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  // Környezeti változó megtisztítása -- lásd `parse-equipment/route.ts` azonos elvű
  // kommentjét arról, miért fontos ez (Vercel-en előforduló idézőjel/whitespace szennyeződés).
  const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '');
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'A GEMINI_API_KEY érvénytelen vagy hiányzik.' }, { status: 500 });
  }

  let body: ScanVinRequestBody;
  try {
    body = (await request.json()) as ScanVinRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Érvénytelen JSON kérés törzs.' }, { status: 400 });
  }

  const rawImage = typeof body?.image === 'string' ? body.image : '';
  if (!rawImage.trim()) {
    return NextResponse.json({ success: false, error: 'Az "image" mező kötelező és nem lehet üres.' }, { status: 400 });
  }

  const inspectionId = typeof body?.inspectionId === 'string' ? body.inspectionId.trim() : '';
  if (!inspectionId) {
    return NextResponse.json({ success: false, error: 'Az "inspectionId" mező kötelező.' }, { status: 400 });
  }

  // A kép vagy `data:...;base64,...` data URL, vagy nyers Base64 + külön `mimeType` mező.
  const parsedDataUrl = parseDataUrl(rawImage);
  const mimeType = parsedDataUrl?.mimeType ?? body?.mimeType?.trim().toLowerCase();
  const base64Data = (parsedDataUrl?.data ?? rawImage).replace(/\s/g, '');

  if (!mimeType || !isAllowedMimeType(mimeType)) {
    return NextResponse.json(
      {
        success: false,
        error: `Érvénytelen vagy hiányzó képformátum. Támogatott típusok: ${ALLOWED_MIME_TYPES.join(', ')}.`,
      },
      { status: 400 }
    );
  }

  if (!base64Data) {
    return NextResponse.json({ success: false, error: 'A kép Base64-tartalma üres.' }, { status: 400 });
  }

  // Méret-ellenőrzés a TÉNYLEGES (dekódolt) bájtméret alapján, még a Gemini API hívása
  // előtt -- lásd `MAX_IMAGE_BYTES` JSDoc-ját.
  const approxDecodedBytes = Math.floor((base64Data.length * 3) / 4);
  if (approxDecodedBytes > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { success: false, error: `A kép túl nagy (max ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB).` },
      { status: 400 }
    );
  }

  // "1 AI KREDIT = 1 VIZSGÁLAT" -- lásd `lib/inspectionAiCredit.ts` JSDoc-ját. Ha ez a
  // vizsgálat MÁR "AI-aktív" (volt rajta korábban sikeres AI-hívás), a keret-ellenőrzést
  // átugorjuk -- a vizsgálat AI-hozzáférése a keret aktuális állapotától függetlenül jár.
  const alreadyClaimed = await hasInspectionClaimedAiCredit(user.id, inspectionId);

  if (!alreadyClaimed) {
    // ELŐZETES AI-KVÓTA ELLENŐRZÉS -- lásd `parse-equipment/route.ts` "ELŐZETES AI-KVÓTA
    // ELLENŐRZÉS" JSDoc-kommentjét, ugyanaz a minta. 2026-08-06-tól ez az EGYETLEN kapu --
    // a régi, generikus `hasEnoughCredits` (`lib/credits.ts`) gate-et eltávolítottuk, mert
    // egy ÚJ szervezet `monthly_credits_remaining`/`purchased_credits_remaining` értéke
    // örökre 0 marad (semmi nem tölti fel valódi Stripe-vásárlásból, lásd
    // `lib/inspectionAiCredit.ts` "1 AI kredit = 1 vizsgálat" bevezetésekor felfedezett
    // hibát) -- ez a régi kapu MINDEN AI-hívást tévesen blokkolt volna minden ÚJ,
    // ténylegesen fizető ügyfélnél.
    const hasAiQuota = await checkAiQuota(user.id);
    if (!hasAiQuota) {
      return NextResponse.json(
        {
          success: false,
          error: 'Elfogyott a havi AI keret. A mezőt kézzel is kitöltheted.',
          code: 'INSUFFICIENT_AI_QUOTA',
        },
        { status: 402 }
      );
    }
  }

  const ai = new GoogleGenAI({ apiKey });

  const generationConfig = {
    systemInstruction: buildSystemInstruction(),
    temperature: 0,
    responseMimeType: 'application/json' as const,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        vin: { type: Type.STRING },
        confidence: { type: Type.STRING, enum: [...CONFIDENCE_VALUES] },
        detectedDocumentType: { type: Type.STRING, enum: [...DOCUMENT_TYPE_VALUES] },
        extractedDetails: {
          type: Type.OBJECT,
          properties: {
            plateNumber: { type: Type.STRING },
            make: { type: Type.STRING },
            model: { type: Type.STRING },
            registrationYear: { type: Type.STRING },
            engineType: { type: Type.STRING },
            powerKw: { type: Type.STRING },
            grossWeight: { type: Type.STRING },
            fuelType: { type: Type.STRING, enum: [...FUEL_TYPE_VALUES] },
          },
          propertyOrdering: [
            'plateNumber',
            'make',
            'model',
            'registrationYear',
            'engineType',
            'powerKw',
            'grossWeight',
            'fuelType',
          ],
        },
      },
      propertyOrdering: ['vin', 'confidence', 'detectedDocumentType', 'extractedDetails'],
      required: ['vin', 'confidence', 'detectedDocumentType'],
    },
  };

  const contents = [
    {
      role: 'user' as const,
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        {
          text: 'Elemezd a képet a rendszerutasítás szabályai szerint (az okmány/matrica NYELVÉTŐL és KIÁLLÍTÓ ORSZÁGÁTÓL függetlenül), és add vissza a kinyert VIN-t (és, ha releváns, a forgalmi engedély mezőit) a megadott JSON sémában.',
        },
      ],
    },
  ];

  // Modell-fallback lánc -- ugyanaz a minta, mint a `parse-equipment/route.ts`-ben, lásd ott
  // a részletes JSDoc-ot a `primaryError` szétválasztás indokáról.
  let rawText: string | undefined;
  let succeeded = false;
  let primaryError: unknown;

  for (let i = 0; i < MODEL_CANDIDATES.length; i++) {
    const model = MODEL_CANDIDATES[i];
    try {
      const response = await ai.models.generateContent({ model, contents, config: generationConfig });
      rawText = response.text;
      succeeded = true;
      break;
    } catch (error) {
      console.error(`Gemini API Error details (model: ${model}):`, error);
      if (i === 0) primaryError = error;
    }
  }

  // Dinamikus modell-listázó VÉGSŐ biztonsági háló -- lásd `parse-equipment/route.ts`
  // azonos elvű kommentjét. Csak akkor fut, ha MINDKÉT fix `MODEL_CANDIDATES` elbukott.
  if (!succeeded) {
    try {
      const modelsPager = await ai.models.list({ config: { queryBase: true, pageSize: 50 } });
      let dynamicModelName: string | undefined;

      for await (const candidateModel of modelsPager) {
        const name = candidateModel.name ?? '';
        if (name.toLowerCase().includes('flash')) {
          dynamicModelName = name;
          break;
        }
      }

      if (dynamicModelName) {
        console.error(`[scan-vin] Statikus MODEL_CANDIDATES mind elbuktak -- dinamikus fallback próbálkozás: ${dynamicModelName}`);
        try {
          const response = await ai.models.generateContent({ model: dynamicModelName, contents, config: generationConfig });
          rawText = response.text;
          succeeded = true;
        } catch (error) {
          console.error(`Gemini API Error details (dynamic fallback model: ${dynamicModelName}):`, error);
        }
      } else {
        console.error('[scan-vin] Dinamikus modell-listázás nem talált "flash" nevet tartalmazó modellt.');
      }
    } catch (error) {
      console.error('[scan-vin] Dinamikus modell-listázás (ai.models.list()) hívási hiba:', error);
    }
  }

  if (!succeeded) {
    return NextResponse.json(
      {
        success: false,
        error: 'Hiba történt a Gemini API hívása közben',
        details: toErrorDetails(primaryError),
      },
      { status: 502 }
    );
  }

  if (!rawText) {
    return NextResponse.json({ success: false, error: 'A Gemini API üres választ adott.' }, { status: 502 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    console.error('[scan-vin] A Gemini válasz nem érvényes JSON:', rawText, error);
    return NextResponse.json(
      { success: false, error: 'A Gemini API válasza nem érvényes JSON.', details: toErrorDetails(error) },
      { status: 502 }
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    return NextResponse.json({ success: false, error: 'A Gemini API válasza nem a várt objektum formátumú.' }, { status: 502 });
  }

  const modelResponse = parsed as ScanVinModelResponse;

  if (typeof modelResponse.vin !== 'string' || !modelResponse.vin.trim()) {
    return NextResponse.json({ success: false, error: 'A Gemini API válasza nem tartalmaz felismerhető alvázszámot.' }, { status: 502 });
  }
  if (!isConfidence(modelResponse.confidence)) {
    return NextResponse.json({ success: false, error: 'A Gemini API válasza érvénytelen "confidence" értéket tartalmaz.' }, { status: 502 });
  }
  if (!isDocumentType(modelResponse.detectedDocumentType)) {
    return NextResponse.json({ success: false, error: 'A Gemini API válasza érvénytelen "detectedDocumentType" értéket tartalmaz.' }, { status: 502 });
  }

  const { vin, confidence } = sanitizeVin(modelResponse.vin, modelResponse.confidence);
  const extractedDetails = sanitizeExtractedDetails(modelResponse.extractedDetails);

  const data: ScanVinData = {
    vin,
    confidence,
    detectedDocumentType: modelResponse.detectedDocumentType,
    ...(extractedDetails ? { extractedDetails } : {}),
  };

  // "1 AI KREDIT = 1 VIZSGÁLAT" CLAIM + KREDIT/KVÓTA LEVONÁS -- KIZÁRÓLAG sikeres, érvényes
  // Gemini-válasz UTÁN, és KIZÁRÓLAG ha ez a vizsgálat MÉG nem volt "AI-aktív". Lásd
  // `lib/inspectionAiCredit.ts` JSDoc-ját a race-condition kezelésről.
  if (!alreadyClaimed) {
    let wonClaim = false;
    try {
      wonClaim = await claimInspectionAiCredit(user.id, inspectionId);
    } catch (error) {
      console.error('[scan-vin] Vizsgálat AI-kredit claim sikertelen a sikeres AI hívás után:', error);
    }

    if (wonClaim) {
      try {
        await consumeAiQuota(user.id);
      } catch (error) {
        console.error('[scan-vin] AI-kvóta levonás sikertelen a sikeres AI hívás után:', error);
      }
    }
  }

  return NextResponse.json({ success: true, data });
}
