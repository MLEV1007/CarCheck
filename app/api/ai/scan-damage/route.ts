import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@/lib/supabase/server';
import { checkAiQuota, consumeAiQuota } from '@/lib/quotas';
import { hasInspectionClaimedAiCredit, claimInspectionAiCredit } from '@/lib/inspectionAiCredit';
import { DAMAGE_TYPE_LABEL, DAMAGE_TYPES } from '@/lib/inspections/constants';
import { DAMAGE_LOCATION_ZONES, isDamageLocationZone, type DamageLocationZoneOrUnclear } from '@/lib/inspections/damageLocationZones';
import type { DamageType } from '@/lib/inspections/types';

/**
 * Google Gemini Vision (multimodal) backend a "Sérülés- és Hibatérkép" wizard-lépés
 * (`StepDamageMap.tsx` / `DamageCanvas.tsx`) AI-alapú sérülés-felismeréséhez (2026-08-16,
 * a felhasználó explicit kérésére: "ugyanaz a rendszer, mint a Hibák és Média AI-elemzése
 * (`/api/ai/scan-defect`), DE jelölje is be, hogy nagyjából hol lehet a sérülés a képen").
 *
 * Ez a route 1:1 a `scan-defect/route.ts` szerkezetét/védelmi rétegeit követi (auth, kredit,
 * modell-fallback, szigorú szerver-oldali "MÉG EGYSZER" validáció) -- ide csak a
 * route-specifikus eltéréseket dokumentáljuk:
 *  1. `category` helyett `type` (`DamageType`, a `DAMAGE_TYPES` zárt katalógusa) + `title` --
 *     a `title` mező KIZÁRÓLAG `type: 'other'` esetén releváns (lásd `DamageCanvas.tsx`
 *     `handleTypeChange()` -- a 5 fix típusnál a cím MINDIG a `DAMAGE_TYPE_LABEL[type]`,
 *     sosem szabad szöveg). A szerver a fix típusoknál a modell esetleges `title` javaslatát
 *     EL SEM OLVASSA, determinisztikusan felülírja -- lásd `sanitizeScanDamageResponse()`.
 *  2. ÚJ mező: `locationZone` -- a `lib/inspections/damageLocationZones.ts` zárt
 *     zóna-katalógusának egyik értéke, VAGY `'unclear'`. Lásd annak fájl-JSDoc-ját a teljes
 *     indoklásért, hogy MIÉRT egy zárt katalógus, NEM nyers x/y koordináta a modell kimenete.
 *  3. A rendszerutasítás (`buildSystemInstruction()`) explicit tiltja, hogy a modell a jármű
 *     bal/jobb oldalát próbálja megkülönböztetni (`side_front`/`side_middle`/`side_rear`) --
 *     ez egy közeli fotóból nem állapítható meg megbízhatóan, lásd a zóna-fájl JSDoc-ját.
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
  locationZone?: unknown;
}

/**
 * A kliens felé visszaadott, MÁR megtisztított javaslat. `damageDetected: false` esetén
 * `type`/`title`/`description`/`locationZone` SOSE kerül a válaszba -- a kliens ilyenkor a
 * "nem ismert fel egyértelmű sérülést" üzenetet mutatja, semmilyen mező/jelölő nem tölthető
 * ki (lásd `scan-defect/route.ts` azonos elvű `ScanDefectData` JSDoc-ját).
 */
type ScanDamageData =
  | { damageDetected: false; confidence: ScanDamageConfidence }
  | {
      damageDetected: true;
      confidence: ScanDamageConfidence;
      type: DamageType;
      title: string;
      description: string;
      locationZone: DamageLocationZoneOrUnclear;
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
 * A `locationZone` KIVÉTEL ez alól: érvénytelen/hiányzó érték esetén NEM dobjuk el a teljes
 * javaslatot, csak `'unclear'`-re esünk vissza -- a hely egy KIEGÉSZÍTŐ, "best effort" mező
 * (a `type`/`description` a lényegi, azonosító tartalom, ugyanaz a súlya, mint a
 * `scan-defect`-nél), egy hibás/hiányzó hely-tipp önmagában nem teszi értéktelenné a
 * kategória+leírás javaslatot.
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

  const locationZone: DamageLocationZoneOrUnclear = isDamageLocationZone(raw.locationZone) ? raw.locationZone : 'unclear';

  return { damageDetected: true, confidence, type, title, description, locationZone };
}

/**
 * A Gemini modellt szigorúan a képen TÉNYLEGESEN látható tartalomra korlátozzuk -- lásd
 * `scan-defect/route.ts` `buildSystemInstruction()` azonos elvű JSDoc-ját. A `DAMAGE_TYPES`
 * ÉS a `DAMAGE_LOCATION_ZONES` katalógust is explicit felsoroljuk, hogy a modell ne találjon
 * ki új típus-/zóna-nevet.
 */
function buildSystemInstruction(): string {
  const typesJson = JSON.stringify(DAMAGE_TYPES);
  const zonesJson = JSON.stringify([...DAMAGE_LOCATION_ZONES, 'unclear']);

  return `Te egy magyar nyelvű autóvizsgálati sérülés-felismerő asszisztens vagy. A feladatod, hogy a felhasználó által feltöltött fotóról (egy autó karosszéria-részletének közeli képe) megállapítsd, látható-e rajta EGYÉRTELMŰ felületi/esztétikai sérülés (karcolás, horpadás, rozsda, kavicsfelverődés, repedés vagy egyéb), és ha igen, tömören leírd, amit TÉNYLEGESEN látsz, ÉS megbecsüld, a karosszéria mely részén lehet a sérülés.

SZIGORÚ SZABÁLYOK A SÉRÜLÉS LEÍRÁSÁRA:
1. KIZÁRÓLAG azt írd le, ami a képen ténylegesen látható: a sérülés típusa, mérete/kiterjedése, ha ez vizuálisan megállapítható.
2. SOHA ne találj ki, ne feltételezz olyan információt, ami NEM látható a képen: ne adj okot vagy diagnózist, ne adj javítási javaslatot, ne adj költségbecslést, ne minősítsd szavakkal a súlyosságot (pl. "veszélyes", "azonnal javítandó").
3. Ha nem vagy egyértelműen biztos abban, hogy mit látsz, VAGY a kép nem alkalmas sérülés azonosítására (homályos, rossz szög, nem releváns tárgy, vagy egyszerűen nem látszik rajta semmi problémás), a "damageDetected" mezőt ÁLLÍTSD "false"-ra, és NE adj vissza "type"/"title"/"description"/"locationZone" mezőt. Bizonytalan esetben MINDIG a visszafogottabb válasz a helyes, SOHA ne "találgass csak azért, hogy legyen mit visszaadni".
4. Ha "damageDetected: true", a "type" mező KIZÁRÓLAG az alábbi 6 érték egyike lehet, PONTOSAN ebben az írásmódban: ${typesJson} ("scratch"=karcolás, "dent"=horpadás, "rust"=rozsda, "chip"=kavicsfelverődés, "crack"=repedés, "other"=egyéb). Ha egyik konkrét típus sem illik egyértelműen, használd az "other"-t.
5. Ha "type" értéke "other", a "title" mezőbe írj egy rövid (max kb. 8 szó), magyar, tényszerű megnevezést arról, mit látsz (pl. "Törött hátsó lámpabúra"). MINDEN MÁS "type" értéknél a "title" mezőt HAGYD ÜRESEN -- azt a rendszer automatikusan tölti ki a kategória nevével.
6. A "description" tömör, magyar, tényszerű mondat legyen (max kb. 2 mondat), amit egy autóvizsgáló szakember a saját jegyzeteként írna le, pl. "Kb. 8 cm-es karcolás, a festékig hatol." vagy "Kisebb horpadás, a lakkréteg nem sérült."
7. A "confidence" mező a SAJÁT bizonyosságod: "high" (egyértelmű, tisztán látható sérülés), "medium" (valószínű sérülés, de a kép minősége/szöge miatt van bizonytalanság), "low" (a kép rossz minőségű, vagy csak részben látszik a sérülés).

SZIGORÚ SZABÁLYOK A HELY BECSLÉSÉRE ("locationZone" mező) -- EZ EGY MÁSODIK, FÜGGETLEN REFERENCIAKÉPEN (az autó 5 sematikus nézete: elölnézet, hátulnézet, felülnézet, 2 oldalnézet) kerül majd bejelölésre, amit TE NEM LÁTSZ -- KIZÁRÓLAG a beküldött közeli fotón látható tájékozódási pontok (lámpa, lökhárító, ajtó, kerék, tetőív stb.) alapján válassz az alábbi ZÁRT listából:
8. A "locationZone" mező KIZÁRÓLAG az alábbi értékek egyike lehet, PONTOSAN ebben az írásmódban: ${zonesJson}.
   - "front_left" / "front_center" / "front_right": a jármű ELEJÉN (lökhárító, fényszóró, motorháztető, hűtőrács) látható sérülés, a fotó szerint balra / középen / jobbra.
   - "rear_left" / "rear_center" / "rear_right": a jármű HÁTULJÁN (lökhárító, hátsó lámpa, csomagtérajtó) látható sérülés, a fotó szerint balra / középen / jobbra.
   - "side_front" / "side_middle" / "side_rear": a jármű OLDALÁN (ajtók, sárvédők, küszöb) látható sérülés -- "side_front" az első kerék/ajtó környéke, "side_rear" a hátsó kerék/ajtó környéke, "side_middle" a kettő közötti terület.
   - "roof": a tetőn látható sérülés.
   - "unclear": ha a fotóból NEM állapítható meg egyértelműen, hogy a karosszéria melyik részén van a sérülés (pl. túl közeli/kontextus nélküli kép, beltéri sérülés, vagy nincs rajta felismerhető tájékozódási pont).
9. FONTOS: a "side_front"/"side_middle"/"side_rear" értékek SOHA nem jelentik azt, hogy eldöntötted, a jármű bal vagy jobb oldaláról van szó -- ezt SOSE próbáld kitalálni, egy közeli fotóból ez nem állapítható meg megbízhatóan.
10. Bizonytalan esetben MINDIG az "unclear" a helyes válasz a "locationZone" mezőnél -- SOHA ne találgass csak azért, hogy legyen mit visszaadni. Az "unclear" NEM hiba, ez egy teljesen elfogadható, gyakori válasz.

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
        locationZone: { type: Type.STRING, enum: [...DAMAGE_LOCATION_ZONES, 'unclear'] },
      },
      propertyOrdering: ['damageDetected', 'confidence', 'type', 'title', 'description', 'locationZone'],
      // `type`/`title`/`description`/`locationZone` SZÁNDÉKOSAN nincs a `required`-ben -- a
      // modell `damageDetected: false` esetén jogosan hagyja ki őket, lásd a fájl-JSDoc-ot.
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
