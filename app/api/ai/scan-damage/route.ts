import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@/lib/supabase/server';
import { checkAiQuota, consumeAiQuota } from '@/lib/quotas';
import { hasInspectionClaimedAiCredit, claimInspectionAiCredit } from '@/lib/inspectionAiCredit';
import { DAMAGE_TYPE_LABEL, DAMAGE_TYPES } from '@/lib/inspections/constants';
import type { DamageType } from '@/lib/inspections/types';

/**
 * Google Gemini Vision (multimodal) backend a "Sérülés- és Hibatérkép" wizard-lépés
 * (`StepDamageMap.tsx` / `DamageCanvas.tsx`) AI-alapú sérülés-felismeréséhez (2026-08-16,
 * a felhasználó explicit kérésére: "ugyanaz a rendszer, mint a Hibák és Média AI-elemzése
 * (`/api/ai/scan-defect`)").
 *
 * Ez a route 1:1 a `scan-defect/route.ts` szerkezetét/védelmi rétegeit követi (auth, kredit,
 * modell-fallback, szigorú szerver-oldali "MÉG EGYSZER" validáció) -- ide csak a
 * route-specifikus eltéréseket dokumentáljuk:
 *  1. `category` helyett `type` (`DamageType`, a `DAMAGE_TYPES` zárt katalógusa) + `title` --
 *     a `title` mező KIZÁRÓLAG `type: 'other'` esetén releváns (lásd `DamageCanvas.tsx`
 *     `handleTypeChange()` -- a 5 fix típusnál a cím MINDIG a `DAMAGE_TYPE_LABEL[type]`,
 *     sosem szabad szöveg). A szerver a fix típusoknál a modell esetleges `title` javaslatát
 *     EL SEM OLVASSA, determinisztikusan felülírja -- lásd `sanitizeScanDamageResponse()`.
 *  2. **2026-08-17 -- a hely-becslés (`locationZone`) eltávolítva (a felhasználó explicit
 *     kérésére: "Nincs szükség az ai-nál arra, hogy elhelyezze és meghatározza a hiba pontos
 *     helyét, majd bejelölje azt"):** a route korábban egy zárt zóna-katalógusból
 *     (`lib/inspections/damageLocationZones.ts`, MOSTANTÓL használaton kívül, de a projekt
 *     "ne töröld jóváhagyás nélkül" konvenciója szerint a fájlban hagyva) egy hely-becslést is
 *     kért/adott a modelltől -- ez TELJESEN megszűnt, a modell KIZÁRÓLAG a kategóriát és a
 *     leírást adja vissza, a rendszerutasítás/`responseSchema` nem is említi a helyet.
 *
 * A hallucináció elleni védelem többi rétege (zárt katalógus MÉG EGYSZER ellenőrizve, kötelező
 * "nem látok egyértelmű sérülést" kimenet, "csak amit látsz" szigorú prompt, NINCS
 * súlyosság-becslés, kötelező emberi jóváhagyás a kliensen, csak explicit felhasználói kérésre
 * fut le, állandó UI-disclaimer) -- lásd `PLAN_ai_scan_defect.md` 3. pontját és
 * `scan-defect/route.ts` fájl-JSDoc-ját, itt SZÓ SZERINT ugyanaz az elv érvényes.
 *
 * **Modellválasztás + fallback-lánc, Autentikáció + kredit-védelem:** UGYANAZ a minta, mint a
 * `scan-defect`/`parse-equipment`/`scan-vin`/`scan-service-doc` route-oknál -- lásd
 * `parse-equipment/route.ts` JSDoc-ját (KANONIKUS leírás).
 *
 * `runtime = 'nodejs'`, mert a `@google/genai` SDK Node.js-célzású.
 */
export const runtime = 'nodejs';

/** Modell-fallback lánc -- lásd `scan-defect/route.ts` azonos elvű kommentjét (ugyanaz a
 * 2026-08-16-i modell-generáció). */
const MODEL_CANDIDATES = ['gemini-3.1-flash-lite', 'gemini-3.6-flash'] as const;

/** A `usage_logs.feature_name` értéke ehhez a route-hoz -- lásd `scan-defect/route.ts`
 * `FEATURE_NAME` azonos elvű kommentjét (jelenleg KIZÁRÓLAG dokumentációs célú, nem
 * befolyásolja a tényleges futásidejű viselkedést). */
const FEATURE_NAME = 'damage_scan';

/** A Gemini `inlineData` bemenetéhez elfogadott kép MIME-típusok -- lásd `scan-defect/route.ts`
 * azonos elvű kommentjét. Videó SZÁNDÉKOSAN nincs a listában. */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

/** A beküldött kép max. mérete -- lásd `scan-defect/route.ts` azonos elvű kommentjét. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
type ScanDamageConfidence = (typeof CONFIDENCE_VALUES)[number];

function isConfidence(value: unknown): value is ScanDamageConfidence {
  return typeof value === 'string' && (CONFIDENCE_VALUES as readonly string[]).includes(value);
}

function isDamageType(value: unknown): value is DamageType {
  return typeof value === 'string' && (DAMAGE_TYPES as readonly string[]).includes(value);
}

/** A `description`/`title` mezők max. hossza -- lásd `scan-defect/route.ts`
 * `MAX_DESCRIPTION_LENGTH` azonos elvű kommentjét. A `title` rövidebb korlátot kap, mert
 * KIZÁRÓLAG egy tömör megnevezés (pl. "Törött hátsó lámpabúra"), sosem egy teljes mondat. */
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_TITLE_LENGTH = 100;

interface ScanDamageRequestBody {
  /** A kép Base64-tartalma -- data URL VAGY nyers Base64 + külön `mimeType` mező, ugyanaz a
   * kontraktus, mint a `scan-defect`/`scan-vin`/`scan-service-doc` route-oknál. */
  image: string;
  mimeType?: string;
  /** A wizard-munkamenet vizsgálat-azonosítója -- lásd `scan-defect/route.ts` azonos mezőjének
   * JSDoc-ját ("1 AI kredit = 1 vizsgálat", `lib/inspectionAiCredit.ts`). */
  inspectionId: string;
}

interface ScanDamageModelResponse {
  damageDetected?: unknown;
  confidence?: unknown;
  type?: unknown;
  title?: unknown;
  description?: unknown;
}

/**
 * A kliens felé visszaadott, MÁR megtisztított javaslat. `damageDetected: false` esetén
 * `type`/`title`/`description` SOSE kerül a válaszba -- a kliens ilyenkor a "nem ismert fel
 * egyértelmű sérülést" üzenetet mutatja, semmilyen mező/jelölő nem tölthető ki (lásd
 * `scan-defect/route.ts` azonos elvű `ScanDefectData` JSDoc-ját).
 */
type ScanDamageData =
  | { damageDetected: false; confidence: ScanDamageConfidence }
  | {
      damageDetected: true;
      confidence: ScanDamageConfidence;
      type: DamageType;
      title: string;
      description: string;
    };

interface ScanDamageSuccessResponse {
  success: true;
  data: ScanDamageData;
}

interface ScanDamageErrorResponse {
  success: false;
  error: string;
  /** KIZÁRÓLAG hibakeresési célból -- lásd `scan-vin/route.ts` `toErrorDetails()` azonos elvű
   * kommentjét. */
  details?: string;
  code?: string;
}

function toErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `data:image/jpeg;base64,....` data URL feldolgozása -- lásd `scan-defect/route.ts`
 * `parseDataUrl()`-jét (ugyanaz a kód, szándékosan duplikálva route-onként, lásd
 * `scan-service-doc/route.ts` azonos elvű kommentjét). FONTOS: NINCS `s` (dotAll) regex
 * flag, lásd az eredeti kommentet a `TS1501` build-hibáról. */
function parseDataUrl(image: string): { mimeType: string; data: string } | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(image.trim());
  if (!match) return null;
  return { mimeType: match[1].trim().toLowerCase(), data: match[2].trim() };
}

/**
 * Szigorú, SZERVER-OLDALI (nem csak a promptra/`responseSchema`-ra bízott) "MÉG EGYSZER"
 * validáció -- lásd `scan-defect/route.ts` `sanitizeScanDefectResponse()` azonos elvű
 * JSDoc-ját és a fájl-JSDoc-ot a teljes indoklásért. Bármilyen bizonytalanság/eltérés esetén
 * a BIZTONSÁGOS, visszafogottabb `{ damageDetected: false }` eredményre esünk vissza.
 *
 * @returns `null`, ha a `confidence` mező érvénytelen -- ez SÉMAHIBA (nem tartalmi
 * bizonytalanság), ilyenkor a hívó `502`-t ad vissza, nem csendes fallback-et.
 */
function sanitizeScanDamageResponse(raw: ScanDamageModelResponse): ScanDamageData | null {
  if (!isConfidence(raw.confidence)) return null;
  const confidence = raw.confidence;

  if (raw.damageDetected !== true) {
    return { damageDetected: false, confidence };
  }

  // A `type` KIZÁRÓLAG a zárt `DAMAGE_TYPES` katalógus egyik értéke lehet -- lásd a
  // fájl-JSDoc 1. pontját. Nincs "legközelebbi találat" kerekítés, ugyanaz az elv, mint a
  // `scan-defect` `category`-jénél.
  if (!isDamageType(raw.type)) {
    return { damageDetected: false, confidence };
  }
  const type = raw.type;

  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) : '';
  if (!description) {
    return { damageDetected: false, confidence };
  }

  // A cím KIZÁRÓLAG "other" típusnál jön ténylegesen a modelltől -- a rögzített (5 fix)
  // típusoknál a modell esetleges `title` javaslatát EL SEM OLVASSUK, determinisztikusan a
  // `DAMAGE_TYPE_LABEL`-t használjuk, UGYANÚGY, ahogy a `DamageCanvas.tsx`
  // `handleTypeChange()` teszi kézi kategória-váltásnál -- lásd a fájl-JSDoc 1. pontját.
  let title: string;
  if (type === 'other') {
    const rawTitle = typeof raw.title === 'string' ? raw.title.trim().slice(0, MAX_TITLE_LENGTH) : '';
    if (!rawTitle) return { damageDetected: false, confidence };
    title = rawTitle;
  } else {
    title = DAMAGE_TYPE_LABEL[type];
  }

  return { damageDetected: true, confidence, type, title, description };
}

/**
 * A Gemini modellt szigorúan a képen TÉNYLEGESEN látható tartalomra korlátozzuk -- lásd
 * `scan-defect/route.ts` `buildSystemInstruction()` azonos elvű JSDoc-ját. A `DAMAGE_TYPES`
 * katalógust is explicit felsoroljuk, hogy a modell ne találjon ki új típus-nevet.
 *
 * **2026-08-16 -- JAVÍTÁS:** a felhasználó jelezte, hogy a "description" megfogalmazása legyen
 * pontosabb/szakszerűbb -- ezt a leírásra vonatkozó szabály (6. pont) orvosolja, konkrét
 * karosszéria-elem-neveket és méret-becslést kérve a homályos megfogalmazás helyett.
 *
 * **2026-08-17 -- a hely-becslés eltávolítva (a felhasználó explicit kérésére):** a
 * rendszerutasítás korábban egy zárt zóna-katalógusból ("locationZone" mező, lásd a
 * `lib/inspections/damageLocationZones.ts` fájl-JSDoc-ját, MOSTANTÓL használaton kívül) egy
 * hely-becslést is kért a modelltől, JÁRMŰ-relatív (nem kép-relatív) bal/jobb-levezetési
 * szabályokkal -- ez a teljes szakasz TÖRÖLVE, a modell KIZÁRÓLAG a kategóriát (`type`) és a
 * leírást (`description`) adja vissza.
 */
function buildSystemInstruction(): string {
  const typesJson = JSON.stringify(DAMAGE_TYPES);

  return `Te egy magyar nyelvű autóvizsgálati sérülés-felismerő asszisztens vagy. A feladatod, hogy a felhasználó által feltöltött fotóról (egy autó karosszéria-részletének közeli képe) megállapítsd, látható-e rajta EGYÉRTELMŰ felületi/esztétikai sérülés (karcolás, horpadás, rozsda, kavicsfelverődés, repedés vagy egyéb), és ha igen, tömören leírd, amit TÉNYLEGESEN látsz.

SZIGORÚ SZABÁLYOK A SÉRÜLÉS LEÍRÁSÁRA:
1. KIZÁRÓLAG azt írd le, ami a képen ténylegesen látható: a sérülés típusa, mérete/kiterjedése, ha ez vizuálisan megállapítható.
2. SOHA ne találj ki, ne feltételezz olyan információt, ami NEM látható a képen: ne adj okot vagy diagnózist, ne adj javítási javaslatot, ne adj költségbecslést, ne minősítsd szavakkal a súlyosságot (pl. "veszélyes", "azonnal javítandó").
3. Ha nem vagy egyértelműen biztos abban, hogy mit látsz, VAGY a kép nem alkalmas sérülés azonosítására (homályos, rossz szög, nem releváns tárgy, vagy egyszerűen nem látszik rajta semmi problémás), a "damageDetected" mezőt ÁLLÍTSD "false"-ra, és NE adj vissza "type"/"title"/"description" mezőt. Bizonytalan esetben MINDIG a visszafogottabb válasz a helyes, SOHA ne "találgass csak azért, hogy legyen mit visszaadni".
4. Ha "damageDetected: true", a "type" mező KIZÁRÓLAG az alábbi 6 érték egyike lehet, PONTOSAN ebben az írásmódban: ${typesJson} ("scratch"=karcolás, "dent"=horpadás, "rust"=rozsda, "chip"=kavicsfelverődés, "crack"=repedés, "other"=egyéb). Ha egyik konkrét típus sem illik egyértelműen, használd az "other"-t.
5. Ha "type" értéke "other", a "title" mezőbe írj egy rövid (max kb. 8 szó), magyar, tényszerű megnevezést arról, mit látsz (pl. "Törött hátsó lámpabúra"). MINDEN MÁS "type" értéknél a "title" mezőt HAGYD ÜRESEN -- azt a rendszer automatikusan tölti ki a kategória nevével.
6. A "description" tömör, magyar, SZAKMAI és KONKRÉT mondat legyen (max kb. 2 mondat), amit egy autóvizsgáló szakember a saját jegyzeteként írna le. KERÜLD az általános, homályos megfogalmazásokat (pl. "valamilyen sérülés látható", "kisebb probléma van rajta", "úgy tűnik, hogy..."). Helyette:
   - Nevezd meg a KONKRÉT karosszéria-elemet, amin a sérülés van, amennyire a fotóból megállapítható (pl. "lökhárító", "sárvédő", "ajtópanel", "küszöb", "lámpabúra", "motorháztető"), NE csak azt írd, hogy "a karosszérián".
   - Ha vizuálisan megbecsülhető, adj konkrét MÉRETET vagy kiterjedést (pl. "kb. 8 cm hosszú", "kb. 3 cm átmérőjű", "a panel felét érinti") -- ha a méret nem becsülhető meg megbízhatóan a fotóból, hagyd ki, NE találj ki számot.
   - Írd le, ha releváns és látható, hogy a sérülés meddig hatol (pl. "a festékig hatol", "csak a lakkréteget érinti", "a fémig látszik").
   - Példák a kívánt stílusra: "Kb. 8 cm-es karcolás a hátsó lökhárítón, a festékig hatol." / "Enyhe horpadás a bal első ajtópanelen, a lakkréteg nem sérült." / "Rozsdásodás a jobb hátsó sárvédő alsó élén, kb. 5 cm-es sávban."
   - Ha bizonytalan vagy valamiben, azt a "confidence" mezőben fejezd ki -- NE bujtass bizonytalanságot töltelékszavakkal ("esetleg", "talán", "úgy néz ki") a leírás szövegébe.
7. A "confidence" mező a SAJÁT bizonyosságod: "high" (egyértelmű, tisztán látható sérülés), "medium" (valószínű sérülés, de a kép minősége/szöge miatt van bizonytalanság), "low" (a kép rossz minőségű, vagy csak részben látszik a sérülés).
8. NE add meg, hol helyezkedik el a sérülés a karosszérián -- ezt a felhasználó jelöli be kézzel a referenciaképen, ez NEM a te feladatod.

Kizárólag a megadott JSON séma szerinti választ add -- semmi mást, se magyarázatot, se markdown jelölést, se kódblokkot.`;
}

export async function POST(request: NextRequest): Promise<NextResponse<ScanDamageSuccessResponse | ScanDamageErrorResponse>> {
  // AUTENTIKÁCIÓ -- lásd `parse-equipment/route.ts` JSDoc "Autentikáció + kredit-védelem"
  // szakaszát (KANONIKUS leírás).
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

  const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '');
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'A GEMINI_API_KEY érvénytelen vagy hiányzik.' }, { status: 500 });
  }

  let body: ScanDamageRequestBody;
  try {
    body = (await request.json()) as ScanDamageRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Érvénytelen JSON kérés törzs.' }, { status: 400 });
  }

  const rawImage = typeof body?.image === 'string' ? body.image : '';
  if (!rawImage.trim()) {
    return NextResponse.json({ success: false, error: 'Az "image" mező kötelező és nem lehet üres.' }, { status: 400 });
  }

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

  const approxDecodedBytes = Math.floor((base64Data.length * 3) / 4);
  if (approxDecodedBytes > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { success: false, error: `A kép túl nagy (max ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB).` },
      { status: 400 }
    );
  }

  const inspectionId = typeof body?.inspectionId === 'string' ? body.inspectionId.trim() : '';
  if (!inspectionId) {
    return NextResponse.json({ success: false, error: 'Az "inspectionId" mező kötelező.' }, { status: 400 });
  }

  // "1 AI KREDIT = 1 VIZSGÁLAT" -- lásd `lib/inspectionAiCredit.ts` JSDoc-ját. Ha ez a
  // vizsgálat MÁR "AI-aktív", a keret-ellenőrzést átugorjuk.
  const alreadyClaimed = await hasInspectionClaimedAiCredit(user.id, inspectionId);

  if (!alreadyClaimed) {
    const hasAiQuota = await checkAiQuota(user.id);
    if (!hasAiQuota) {
      return NextResponse.json(
        {
          success: false,
          error: 'Elfogyott a havi AI keret. A jelölőt kézzel is elhelyezheted.',
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
        damageDetected: { type: Type.BOOLEAN },
        confidence: { type: Type.STRING, enum: [...CONFIDENCE_VALUES] },
        type: { type: Type.STRING, enum: [...DAMAGE_TYPES] },
        title: { type: Type.STRING },
        description: { type: Type.STRING },
      },
      propertyOrdering: ['damageDetected', 'confidence', 'type', 'title', 'description'],
      // `type`/`title`/`description` SZÁNDÉKOSAN nincs a `required`-ben -- a modell
      // `damageDetected: false` esetén jogosan hagyja ki őket, lásd a fájl-JSDoc-ot.
      required: ['damageDetected', 'confidence'],
    },
  };

  const contents = [
    {
      role: 'user' as const,
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        {
          text: 'Elemezd a képet a rendszerutasítás szabályai szerint, és add vissza az eredményt a megadott JSON sémában.',
        },
      ],
    },
  ];

  // Modell-fallback lánc -- ugyanaz a minta, mint a `scan-defect`/`scan-vin`/
  // `scan-service-doc`/`parse-equipment` route-oknál.
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

  // Dinamikus modell-listázó VÉGSŐ biztonsági háló -- lásd `scan-defect/route.ts` azonos elvű
  // kommentjét.
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
        console.error(`[scan-damage] Statikus MODEL_CANDIDATES mind elbuktak -- dinamikus fallback próbálkozás: ${dynamicModelName}`);
        try {
          const response = await ai.models.generateContent({ model: dynamicModelName, contents, config: generationConfig });
          rawText = response.text;
          succeeded = true;
        } catch (error) {
          console.error(`Gemini API Error details (dynamic fallback model: ${dynamicModelName}):`, error);
        }
      } else {
        console.error('[scan-damage] Dinamikus modell-listázás nem talált "flash" nevet tartalmazó modellt.');
      }
    } catch (error) {
      console.error('[scan-damage] Dinamikus modell-listázás (ai.models.list()) hívási hiba:', error);
    }
  }

  if (!succeeded) {
    return NextResponse.json(
      { success: false, error: 'Hiba történt a Gemini API hívása közben', details: toErrorDetails(primaryError) },
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
    console.error('[scan-damage] A Gemini válasz nem érvényes JSON:', rawText, error);
    return NextResponse.json(
      { success: false, error: 'A Gemini API válasza nem érvényes JSON.', details: toErrorDetails(error) },
      { status: 502 }
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    return NextResponse.json({ success: false, error: 'A Gemini API válasza nem a várt objektum formátumú.' }, { status: 502 });
  }

  // Szigorú, MÉG EGYSZER (nem csak a `responseSchema`-ra bízott) validáció -- lásd
  // `sanitizeScanDamageResponse()` JSDoc-ját, ez a route legkritikusabb védelmi rétege a
  // hallucinált tartalom ellen.
  const data = sanitizeScanDamageResponse(parsed as ScanDamageModelResponse);
  if (!data) {
    return NextResponse.json({ success: false, error: 'A Gemini API válasza érvénytelen "confidence" értéket tartalmaz.' }, { status: 502 });
  }

  // "1 AI KREDIT = 1 VIZSGÁLAT" CLAIM + KREDIT/KVÓTA LEVONÁS -- KIZÁRÓLAG sikeres, érvényes
  // Gemini-válasz UTÁN, és KIZÁRÓLAG ha ez a vizsgálat MÉG nem volt "AI-aktív" -- lásd
  // `scan-defect/route.ts` azonos elvű kommentjét (a levonás FÜGGETLEN attól, hogy a modell
  // `damageDetected: true`-t vagy `false`-t adott vissza).
  if (!alreadyClaimed) {
    let wonClaim = false;
    try {
      wonClaim = await claimInspectionAiCredit(user.id, inspectionId);
    } catch (error) {
      console.error('[scan-damage] Vizsgálat AI-kredit claim sikertelen a sikeres AI hívás után:', error);
    }

    if (wonClaim) {
      try {
        await consumeAiQuota(user.id);
      } catch (error) {
        console.error('[scan-damage] AI-kvóta levonás sikertelen a sikeres AI hívás után:', error);
      }
    }
  }

  return NextResponse.json({ success: true, data });
}
