import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

/**
 * Google Gemini Vision (multimodal) backend a VIN (alvázszám) / forgalmi engedély
 * fotó-szkenneréhez (PROJEKT_INSTRUKCIOK.md 5.B pont, "Autó adatok" wizard-lépés --
 * a kliens-oldali, 100%-ig ingyenes `lib/inspections/vinOcr.ts` (Tesseract.js) OCR MELLETT,
 * attól függetlenül, egy pontosabb, AI-alapú alternatívaként).
 *
 * A vizsgáló lefotózza az alvázszám-matricát, a szélvédő plakettet VAGY a teljes magyar
 * Forgalmi Engedélyt, ezt a fotót Base64 kódolással küldi be ez a route, ami a Gemini Flash
 * Vision modellel egyetlen hívásban kinyeri az alvázszámot -- ÉS, ha a kép egy Forgalmi
 * Engedély, a hozzá tartozó alap autó-adatokat (rendszám, gyártmány, típus, első
 * forgalombahelyezés éve) is.
 *
 * **Modellválasztás + fallback-lánc:** ugyanaz a minta, mint a `parse-equipment` route-nál
 * (lásd ott a részletes JSDoc-ot) -- elsődleges modell `gemini-2.0-flash`, statikus fallback
 * `gemini-flash-latest` (a Google mindenkori legújabb, stabil "flash" alias-a), VÉGSŐ
 * biztonsági hálóként pedig egy dinamikus `ai.models.list()`-alapú, nevében "flash" szót
 * tartalmazó modell-kereséssel, ha MINDKÉT fix név elbukna egy jövőbeli Google-oldali
 * modell-kivezetés miatt. A hibaválasz `details` mezője KIZÁRÓLAG az elsődleges modell
 * hibáját mutatja -- lásd `primaryError`.
 *
 * `runtime = 'nodejs'`, mert a `@google/genai` SDK Node.js-célzású (Edge runtime-on nem
 * garantált a működése).
 */
export const runtime = 'nodejs';

/** Modell-fallback lánc, kipróbálási sorrendben -- lásd a fenti JSDoc "Modellválasztás +
 * fallback-lánc" pontját. */
const MODEL_CANDIDATES = ['gemini-2.0-flash', 'gemini-flash-latest'] as const;

/** A Gemini `inlineData` bemenetéhez elfogadott kép MIME-típusok -- ezen kívül minden
 * mást elutasítunk, mielőtt egyáltalán elküldenénk a képet a Gemini API-nak. */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

/** A beküldött kép max. mérete (nyers, dekódolt bájtokban) -- a Gemini `inlineData`
 * (Base64-beágyazott) bemenetnek kb. 20 MB-os a gyakorlati felső korlátja kérésenként;
 * ennél jóval szűkebb, 15 MB-os limitet szabunk, hogy egy tipikus telefonos fotónál bőven
 * maradjon tartalék, de egy véletlenül/rosszindulatúan túlméretezett kérést elutasítsunk,
 * mielőtt a Gemini API-t egyáltalán meghívnánk. */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
type ScanVinConfidence = (typeof CONFIDENCE_VALUES)[number];

const DOCUMENT_TYPE_VALUES = ['vin_plate', 'registration_certificate', 'other'] as const;
type ScanVinDocumentType = (typeof DOCUMENT_TYPE_VALUES)[number];

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
}

interface ScanVinExtractedDetails {
  plateNumber?: unknown;
  make?: unknown;
  model?: unknown;
  registrationYear?: unknown;
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

  return Object.keys(clean).length > 0 ? clean : undefined;
}

/** A `data:image/jpeg;base64,....` séma szerinti data URL-ekből kinyeri a MIME-típust és
 * a nyers Base64 adatot -- `null`, ha az `image` string nem data URL formátumú (ekkor a
 * hívónak a `mimeType` mezőt kell megadnia, és a teljes `image` stringet nyers Base64-nek
 * tekintjük). */
function parseDataUrl(image: string): { mimeType: string; data: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(image.trim());
  if (!match) return null;
  return { mimeType: match[1].trim().toLowerCase(), data: match[2].trim() };
}

/** A Gemini modellt szigorú ISO 3779 szabályokra és a magyar Forgalmi Engedély
 * mezőkiosztására szorítjuk -- lásd a részletes szabályokat a system instructionben. */
function buildSystemInstruction(): string {
  return `Te egy autóipari OCR & VIN elemző asszisztens vagy. A feladatod, hogy a felhasználó által feltöltött fotóról (alvázszám-matrica, szélvédő plakett, vagy magyar Forgalmi Engedély) kinyerd az alvázszámot (VIN) és -- ha releváns -- az autó alapadatait.

SZIGORÚ ISO 3779 SZABÁLYOK A VIN-RE:
1. Az alvázszám PONTOSAN 17 karakter.
2. Az alvázszám SOHA nem tartalmazhatja az 'I', 'O', 'Q' betűket.
3. Ha a képen 'O' betűt látsz a VIN-ben, azt MINDIG '0' (nulla) számjegyként értelmezd.
4. Ha a képen 'I' betűt látsz a VIN-ben, azt MINDIG '1' (egyes) számjegyként értelmezd.
5. Ha a képen 'Q' betűt látsz a VIN-ben, azt MINDIG '0' (nulla) számjegyként értelmezd.
6. A végleges "vin" mező kizárólag nagybetűket és számjegyeket tartalmazhat, PONTOSAN 17 karakter hosszan, és SOHA nem tartalmazhatja az I/O/Q betűket.

DOKUMENTUMTÍPUS FELISMERÉS ("detectedDocumentType"):
- "vin_plate" -- ha a kép egy alvázszám-matricát vagy szélvédőbe/karosszériába vésett/nyomtatott VIN plakettet mutat (nincs rajta más hivatalos dokumentum-mező).
- "registration_certificate" -- ha a kép egy magyar Forgalmi Engedélyt (vagy annak egy oldalát/részletét) mutat.
- "other" -- ha egyik kategóriába sem sorolható egyértelműen, vagy nem sikerült VIN-t azonosítani.

HA A KÉP EGY MAGYAR FORGALMI ENGEDÉLY, nyerd ki az "extractedDetails" objektumba is az alábbi mezőket (amit nem találsz vagy nem olvasható biztonsággal, hagyd ki az objektumból):
- "plateNumber": Rendszám (A. mező).
- "make": Gyártmány (D.1 mező).
- "model": Típus (D.3 mező).
- "registrationYear": Első nyilvántartásba vétel éve (B. mező, csak az évszám).
- "vin" mezőként ilyenkor az E. mezőben (Alvázszám) szereplő értéket add vissza, a fenti ISO 3779 szabályok szerint tisztítva.

A "confidence" mező a SAJÁT bizonyosságod a kinyert "vin" értékre vonatkozóan:
- "high" -- a VIN minden karaktere tisztán, egyértelműen olvasható volt.
- "medium" -- a VIN nagy része olvasható volt, de 1-2 karakternél bizonytalan voltál (pl. elmosódott, tükröződik, résben van).
- "low" -- a kép rossz minőségű, a VIN nagy része nehezen olvasható, vagy csak találgatással sikerült kiegészíteni.

HA EGYÁLTALÁN NEM TALÁLSZ 17 KARAKTERES VIN-MINTÁT A KÉPEN, a "vin" mezőbe add vissza a legjobb, legvalószínűbb részleges/teljes olvasatodat (akkor is, ha nem pontosan 17 karakter), és a "confidence" mezőt állítsd "low"-ra.

Kizárólag a megadott JSON séma szerinti választ add -- semmi mást, se magyarázatot, se markdown jelölést, se kódblokkot.`;
}

export async function POST(request: NextRequest): Promise<NextResponse<ScanVinSuccessResponse | ScanVinErrorResponse>> {
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
          },
          propertyOrdering: ['plateNumber', 'make', 'model', 'registrationYear'],
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
        { text: 'Elemezd a képet a rendszerutasítás szabályai szerint, és add vissza a kinyert VIN-t (és, ha releváns, a Forgalmi Engedély mezőit) a megadott JSON sémában.' },
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

  return NextResponse.json({ success: true, data });
}
