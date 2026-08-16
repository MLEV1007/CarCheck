import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@/lib/supabase/server';
import { checkAiQuota, consumeAiQuota } from '@/lib/quotas';
import { hasInspectionClaimedAiCredit, claimInspectionAiCredit } from '@/lib/inspectionAiCredit';
import { DEFECT_CATEGORIES } from '@/lib/inspections/constants';

/**
 * Google Gemini Vision (multimodal) backend a "Hibák és Média" wizard-lépés
 * (`StepDefects.tsx`, PROJEKT_INSTRUKCIOK.md 5.B.3) AI-alapú hiba-felismeréséhez
 * (2026-08-16, lásd `PLAN_ai_scan_defect.md` -- ez a route AZ OTT LEÍRT terv szerint
 * készült, MINDEN eltérés a tervtől itt, a JSDoc-ban dokumentálva).
 *
 * A vizsgáló lefotózza a hibát/sérülést, ezt a fotót Base64 kódolással küldi be ez a
 * route, ami a Gemini Flash Vision modellel egyetlen hívásban **javaslatot** ad a
 * hiba kategóriájára (`DEFECT_CATEGORIES` zárt katalógus) és megír egy rövid, tényszerű
 * vázlat-leírást -- ezt a kliens (`StepDefects.tsx`) SOSE írja közvetlenül a hiba-kártya
 * mezőibe, mindig egy elkülönült "AI javaslat" panelként jeleníti meg, KÜLÖN "Elfogadom"
 * gombbal (lásd `PLAN_ai_scan_defect.md` 3.5 pontját -- ez a route maga NEM tudja
 * kikényszeríteni a kliens-oldali UI-mintát, de a válasz-alak -- egy különálló "javaslat",
 * nem egy "kész mező" -- ezt a használatot sugallja).
 *
 * **KRITIKUS KÜLÖNBSÉG a projekt többi Vision route-jához (`scan-vin`/`scan-service-doc`)
 * képest: itt NINCS zárt forrásdokumentum, amihez a modell kimenete objektíven mérhető
 * lenne (egy VIN-plakett/forgalmi engedély szabványos mezőkiosztású, egy szervizkönyv-oldal
 * táblázatos) -- egy tetszőleges sérülés-fotó szabad jelenet, ahol a modell könnyen
 * "kiszínezhetne" nem látható részleteket. Ezért ez a route SZIGORÚBB védelmi rétegeket
 * alkalmaz, mint a projekt többi AI route-ja -- lásd `buildSystemInstruction()` és
 * `sanitizeScanDefectResponse()` JSDoc-jait, valamint `PLAN_ai_scan_defect.md` 3. pontját
 * a teljes indoklásért:
 *  1. A válasz-séma explicit engedi/megköveteli a "nem látok egyértelmű hibát" kimenetet
 *     (`defectDetected: false`) -- a modell NINCS kényszerítve, hogy mindenképp találjon
 *     valamit.
 *  2. A `category` KIZÁRÓLAG a zárt `DEFECT_CATEGORIES` katalógus egyik értéke lehet --
 *     szerver-oldalon MÉG EGYSZER ellenőrizve (nem bízva a `responseSchema` enum-ra), és
 *     ha a modell mégis egy nem-katalógus értéket adna vissza, a TELJES javaslatot
 *     elvetjük (`defectDetected: false`-ra esünk vissza), NEM próbálunk "legközelebbi
 *     találatra" kerekíteni.
 *  3. A rendszerutasítás explicit tiltja a spekulációt: nincs ok/diagnózis, nincs
 *     javítási javaslat, nincs költségbecslés, nincs szavakkal kifejezett
 *     súlyosság-minősítés -- KIZÁRÓLAG a képen ténylegesen látható tartalom írható le.
 *  4. NINCS numerikus/strukturált súlyosság-mező -- lásd `PLAN_ai_scan_defect.md` 3.4/8.
 *     pontját (szándékos v1 hatókör-korlátozás, nyitott döntésként a felhasználóval).
 *
 * **Modellválasztás + fallback-lánc, Autentikáció + kredit-védelem:** UGYANAZ a minta,
 * mint a `parse-equipment`/`scan-vin`/`scan-service-doc` route-oknál -- lásd
 * `parse-equipment/route.ts` JSDoc-ját (CANONIKUS leírás), ide csak a route-specifikus
 * eltéréseket dokumentáljuk.
 *
 * `runtime = 'nodejs'`, mert a `@google/genai` SDK Node.js-célzású.
 */
export const runtime = 'nodejs';

/** Modell-fallback lánc -- lásd `scan-vin/route.ts` azonos elvű kommentjét (2026-08-16
 * frissítés: `gemini-2.0-flash` kivezetve, lásd `parse-equipment/route.ts` JSDoc-ját). */
const MODEL_CANDIDATES = ['gemini-3.1-flash-lite', 'gemini-3.6-flash'] as const;

/** A `usage_logs.feature_name` értéke ehhez a route-hoz -- lásd `lib/credits.ts`. Jelenleg
 * (2026-08-16) a projekt egyetlen `/api/ai/*` route-ja sem ad át explicit `featureName`-t a
 * kredit-/kvóta-levonó hívásoknak (`consumeAiQuota`/`claimInspectionAiCredit` a hívó `userId`-t
 * és `inspectionId`-t kéri, nem a funkció nevét) -- ez a konstans itt is KIZÁRÓLAG
 * dokumentációs/jövőbeli `usage_logs`-bővítési célt szolgál, ugyanúgy, mint a másik 4
 * route-ban, nem befolyásolja a tényleges futásidejű viselkedést. */
const FEATURE_NAME = 'defect_scan';

/** A Gemini `inlineData` bemenetéhez elfogadott kép MIME-típusok -- lásd `scan-vin/route.ts`
 * azonos elvű kommentjét. Videó SZÁNDÉKOSAN nincs a listában -- ez a route KIZÁRÓLAG
 * állóképet fogad, a kliens (`DefectMediaUpload.tsx`) videó-fájlnál nem is ajánlja fel az
 * "AI elemzés" gombot (lásd `PLAN_ai_scan_defect.md` 4.1 pontját). */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

/** A beküldött kép max. mérete -- lásd `scan-vin/route.ts` `MAX_IMAGE_BYTES` JSDoc-ját
 * (ugyanaz a Vercel ~4,5 MB-os request body korlát indokolja). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
type ScanDefectConfidence = (typeof CONFIDENCE_VALUES)[number];

function isConfidence(value: unknown): value is ScanDefectConfidence {
  return typeof value === 'string' && (CONFIDENCE_VALUES as readonly string[]).includes(value);
}

/** A `description` mező max. hossza -- lásd `PLAN_ai_scan_defect.md` 4.1.3 pontját (ugyanaz
 * az elv, mint a `scan-service-doc` `MAX_NOTES_LENGTH`-jénél): egy tömör, 1-2 mondatos,
 * TÉNYLEGESEN a képen látott tartalom leírásához bőven elég, egy ennél hosszabb válasz inkább
 * a spekuláció jele lenne, mint a hasznosságé. */
const MAX_DESCRIPTION_LENGTH = 300;

interface ScanDefectRequestBody {
  /** A kép Base64-tartalma -- data URL VAGY nyers Base64 + külön `mimeType` mező, ugyanaz a
   * kontraktus, mint a `scan-vin`/`scan-service-doc` route-oknál. */
  image: string;
  mimeType?: string;
  /** A wizard-munkamenet vizsgálat-azonosítója -- lásd `scan-vin/route.ts` azonos mezőjének
   * JSDoc-ját ("1 AI kredit = 1 vizsgálat", `lib/inspectionAiCredit.ts`). */
  inspectionId: string;
}

interface ScanDefectModelResponse {
  defectDetected?: unknown;
  confidence?: unknown;
  category?: unknown;
  description?: unknown;
}

/**
 * A kliens felé visszaadott, MÁR megtisztított javaslat. `defectDetected: false` esetén
 * `category`/`description` SOSE kerül a válaszba -- a kliens ilyenkor a "nem ismert fel
 * egyértelmű hibát" üzenetet mutatja, semmilyen mező nem tölthető ki (lásd
 * `PLAN_ai_scan_defect.md` 3.2/3.5 pontját).
 */
type ScanDefectData =
  | { defectDetected: false; confidence: ScanDefectConfidence }
  | { defectDetected: true; confidence: ScanDefectConfidence; category: string; description: string };

interface ScanDefectSuccessResponse {
  success: true;
  data: ScanDefectData;
}

interface ScanDefectErrorResponse {
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

/** `data:image/jpeg;base64,....` data URL feldolgozása -- lásd `scan-vin/route.ts`
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
 * validáció -- lásd `PLAN_ai_scan_defect.md` 3. és 4.1 pontját a teljes indoklásért. A
 * modell kimenete szemantikailag helytelen/hallucinált lehet a séma-megfelelés ellenére is,
 * ezért itt MINDEN mezőt a TÉNYLEGES szabályok szerint ellenőrzünk, és bármilyen
 * bizonytalanság/eltérés esetén a BIZTONSÁGOS, visszafogottabb `{ defectDetected: false }`
 * eredményre esünk vissza -- SOSE próbálunk egy hiányos/gyanús modellválaszból mégis egy
 * "elfogadható" javaslatot kikényszeríteni.
 *
 * @returns `null`, ha a `confidence` mező érvénytelen -- ez SÉMAHIBA (nem tartalmi
 * bizonytalanság), ilyenkor a hívó `502`-t ad vissza, nem csendes fallback-et.
 */
function sanitizeScanDefectResponse(raw: ScanDefectModelResponse): ScanDefectData | null {
  if (!isConfidence(raw.confidence)) return null;
  const confidence = raw.confidence;

  if (raw.defectDetected !== true) {
    return { defectDetected: false, confidence };
  }

  // A `category` KIZÁRÓLAG a zárt katalógus egyik értéke lehet -- lásd a fájl-JSDoc 2. pontját.
  if (typeof raw.category !== 'string' || !DEFECT_CATEGORIES.includes(raw.category)) {
    return { defectDetected: false, confidence };
  }

  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) : '';
  if (!description) {
    return { defectDetected: false, confidence };
  }

  return { defectDetected: true, confidence, category: raw.category, description };
}

/**
 * A Gemini modellt szigorúan a képen TÉNYLEGESEN látható tartalomra korlátozzuk -- lásd
 * `PLAN_ai_scan_defect.md` 4.2 pontját (ez a rendszerutasítás pontos szövege). A
 * `DEFECT_CATEGORIES` katalógust a `parse-equipment`-hez hasonlóan explicit felsoroljuk,
 * hogy a modell ne találjon ki új kategória-nevet.
 */
function buildSystemInstruction(): string {
  const categoriesJson = JSON.stringify(DEFECT_CATEGORIES);

  return `Te egy magyar nyelvű autóvizsgálati hiba-felismerő asszisztens vagy. A feladatod, hogy a felhasználó által feltöltött fotóról (egy autó-alkatrész vagy karosszéria-részlet közeli képe) megállapítsd, látható-e rajta EGYÉRTELMŰ mechanikai/elektronikai/beltéri hiba vagy sérülés, és ha igen, tömören leírd, amit TÉNYLEGESEN látsz.

SZIGORÚ SZABÁLYOK:
1. KIZÁRÓLAG azt írd le, ami a képen ténylegesen látható: a hiba/sérülés típusa, helye, kiterjedése, ha ez vizuálisan megállapítható.
2. SOHA ne találj ki, ne feltételezz olyan információt, ami NEM látható a képen: ne adj meg konkrét alkatrész-márkát/típust, ne adj okot vagy diagnózist, ne adj javítási javaslatot, ne adj költségbecslést, ne minősítsd szavakkal a súlyosságot (pl. "veszélyes", "azonnal javítandó").
3. Ha nem vagy egyértelműen biztos abban, hogy mit látsz, VAGY a kép nem alkalmas hiba azonosítására (homályos, rossz szög, nem releváns tárgy, vagy egyszerűen nem látszik rajta semmi problémás), a "defectDetected" mezőt ÁLLÍTSD "false"-ra, és NE adj vissza "category"/"description" mezőt. A bizonytalan esetben MINDIG a visszafogottabb válasz a helyes, SOHA ne "találgass csak azért, hogy legyen mit visszaadni".
4. Ha "defectDetected: true", a "category" mező KIZÁRÓLAG az alábbi 5 érték egyike lehet, PONTOSAN ebben az írásmódban: ${categoriesJson}. Ha egyik sem illik egyértelműen, használd az "Egyéb"-et.
5. A "description" tömör, magyar, tényszerű mondat legyen (max kb. 2 mondat), amit egy autóvizsgáló szakember a saját jegyzeteként írna le, pl. "Kb. 8 cm-es karcolás a jobb hátsó ajtón, a festékig hatol." vagy "Repedt a hátsó lökhárító bal alsó sarka."
6. A "confidence" mező a SAJÁT bizonyosságod: "high" (egyértelmű, tisztán látható hiba), "medium" (valószínű hiba, de a kép minősége/szöge miatt van bizonytalanság), "low" (a kép rossz minőségű, vagy csak részben látszik a hiba).

Kizárólag a megadott JSON séma szerinti választ add -- semmi mást, se magyarázatot, se markdown jelölést, se kódblokkot.`;
}

export async function POST(request: NextRequest): Promise<NextResponse<ScanDefectSuccessResponse | ScanDefectErrorResponse>> {
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

  const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '');
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'A GEMINI_API_KEY érvénytelen vagy hiányzik.' }, { status: 500 });
  }

  let body: ScanDefectRequestBody;
  try {
    body = (await request.json()) as ScanDefectRequestBody;
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
        defectDetected: { type: Type.BOOLEAN },
        confidence: { type: Type.STRING, enum: [...CONFIDENCE_VALUES] },
        category: { type: Type.STRING, enum: [...DEFECT_CATEGORIES] },
        description: { type: Type.STRING },
      },
      propertyOrdering: ['defectDetected', 'confidence', 'category', 'description'],
      // `category`/`description` SZÁNDÉKOSAN nincs a `required`-ben -- a modell
      // `defectDetected: false` esetén jogosan hagyja ki őket, lásd a fájl-JSDoc-ot.
      required: ['defectDetected', 'confidence'],
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

  // Modell-fallback lánc -- ugyanaz a minta, mint a `scan-vin`/`scan-service-doc`/
  // `parse-equipment` route-oknál.
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

  // Dinamikus modell-listázó VÉGSŐ biztonsági háló -- lásd `scan-vin/route.ts` azonos elvű
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
        console.error(`[scan-defect] Statikus MODEL_CANDIDATES mind elbuktak -- dinamikus fallback próbálkozás: ${dynamicModelName}`);
        try {
          const response = await ai.models.generateContent({ model: dynamicModelName, contents, config: generationConfig });
          rawText = response.text;
          succeeded = true;
        } catch (error) {
          console.error(`Gemini API Error details (dynamic fallback model: ${dynamicModelName}):`, error);
        }
      } else {
        console.error('[scan-defect] Dinamikus modell-listázás nem talált "flash" nevet tartalmazó modellt.');
      }
    } catch (error) {
      console.error('[scan-defect] Dinamikus modell-listázás (ai.models.list()) hívási hiba:', error);
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
    console.error('[scan-defect] A Gemini válasz nem érvényes JSON:', rawText, error);
    return NextResponse.json(
      { success: false, error: 'A Gemini API válasza nem érvényes JSON.', details: toErrorDetails(error) },
      { status: 502 }
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    return NextResponse.json({ success: false, error: 'A Gemini API válasza nem a várt objektum formátumú.' }, { status: 502 });
  }

  // Szigorú, MÉG EGYSZER (nem csak a `responseSchema`-ra bízott) validáció -- lásd
  // `sanitizeScanDefectResponse()` JSDoc-ját, ez a route legkritikusabb védelmi rétege a
  // hallucinált tartalom ellen.
  const data = sanitizeScanDefectResponse(parsed as ScanDefectModelResponse);
  if (!data) {
    return NextResponse.json({ success: false, error: 'A Gemini API válasza érvénytelen "confidence" értéket tartalmaz.' }, { status: 502 });
  }

  // "1 AI KREDIT = 1 VIZSGÁLAT" CLAIM + KREDIT/KVÓTA LEVONÁS -- KIZÁRÓLAG sikeres, érvényes
  // Gemini-válasz UTÁN, és KIZÁRÓLAG ha ez a vizsgálat MÉG nem volt "AI-aktív". A levonás
  // FÜGGETLEN attól, hogy a modell `defectDetected: true`-t vagy `false`-t adott vissza --
  // egy "nem találtam hibát" válasz is egy sikeres, kifizetett AI-hívás (ugyanúgy, ahogy a
  // `scan-service-doc` egy üres `entries` tömböt is sikeres válaszként számol el), lásd
  // `lib/inspectionAiCredit.ts` JSDoc-ját a race-condition kezelésről.
  if (!alreadyClaimed) {
    let wonClaim = false;
    try {
      wonClaim = await claimInspectionAiCredit(user.id, inspectionId);
    } catch (error) {
      console.error('[scan-defect] Vizsgálat AI-kredit claim sikertelen a sikeres AI hívás után:', error);
    }

    if (wonClaim) {
      try {
        await consumeAiQuota(user.id);
      } catch (error) {
        console.error('[scan-defect] AI-kvóta levonás sikertelen a sikeres AI hívás után:', error);
      }
    }
  }

  return NextResponse.json({ success: true, data });
}
