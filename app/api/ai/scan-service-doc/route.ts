import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@/lib/supabase/server';
import { checkAiQuota, consumeAiQuota } from '@/lib/quotas';
import { hasInspectionClaimedAiCredit, claimInspectionAiCredit } from '@/lib/inspectionAiCredit';
import { logAiApiCall } from '@/lib/aiApiCallLog';
import { SERVICE_ENTRY_TYPE_SUGGESTIONS } from '@/lib/inspections/constants';

/**
 * Google Gemini Vision (multimodal) backend a "Szervizmúlt & Dokumentumok" wizard-lépés
 * (`StepServiceHistory.tsx`, PROJEKT_INSTRUKCIOK.md 5.B.3 "Szervizmúlt & Dokumentumok")
 * "Manuális Idővonal" pillérének AI-alapú gyorskitöltéséhez (2026-08-06, "Szervizbejegyzés
 * AI-beolvasás" lépés).
 *
 * A vizsgáló lefotózza a szervizkönyv egy (vagy több) oldalát, VAGY egy szervizszámlát/
 * munkalapot, ezt a fotót Base64 kódolással küldi be ez a route, ami a Gemini Flash Vision
 * modellel egyetlen hívásban kinyeri a fotón szereplő szerviz-eseményeket (dátum, km óra
 * állás, elvégzett munka típusa, opcionális megjegyzés) -- EGY fotón (pl. egy szervizkönyv
 * táblázatos oldalán) TÖBB bejegyzés is szerepelhet, ezért a válasz mindig egy TÖMB, nem
 * egyetlen objektum (ellentétben a `scan-vin` route-tal, ami mindig egyetlen járművet ír le).
 *
 * A kliens (`StepServiceHistory.tsx`) a válasz `entries` tömbjét `ServiceHistoryEntryState[]`-
 * re alakítva HOZZÁFŰZI (nem felülírja) a meglévő `value.entries` listához -- a szaki utólag
 * bármelyik AI-val előtöltött sort kézzel is módosíthatja/törölheti, ugyanúgy, mint egy
 * manuálisan felvitt bejegyzést.
 *
 * **Modellválasztás + fallback-lánc, Autentikáció + kredit-védelem:** UGYANAZ a minta, mint a
 * `parse-equipment`/`scan-vin` route-oknál -- lásd `parse-equipment/route.ts` JSDoc-ját
 * (CANONIKUS leírás), ide csak a route-specifikus eltéréseket dokumentáljuk.
 *
 * `runtime = 'nodejs'`, mert a `@google/genai` SDK Node.js-célzású.
 */
export const runtime = 'nodejs';

/** Modell-fallback lánc -- lásd `scan-vin/route.ts` azonos elvű kommentjét (2026-08-16
 * frissítés: `gemini-2.0-flash` kivezetve, lásd `parse-equipment/route.ts` JSDoc-ját). */
const MODEL_CANDIDATES = ['gemini-3.1-flash-lite', 'gemini-3.6-flash'] as const;

/** A `usage_logs.feature_name` értéke ehhez a route-hoz -- lásd `lib/credits.ts` és a
 * `components/credits/CreditDashboardModal.tsx` `FEATURE_NAME_LABELS` térképét (bővítve
 * ezzel az értékkel, hogy a Kredit Dashboard táblázatban is olvasható magyar néven jelenjen
 * meg, ne a nyers kódként). */
const FEATURE_NAME = 'service_doc_scan';

/** A Gemini `inlineData` bemenetéhez elfogadott kép MIME-típusok -- lásd `scan-vin/route.ts`
 * azonos elvű kommentjét. */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

/** A beküldött kép max. mérete -- lásd `scan-vin/route.ts` `MAX_IMAGE_BYTES` JSDoc-ját
 * (ugyanaz a Vercel ~4,5 MB-os request body korlát indokolja, a kliens `compressImageForAiScan`-
 * nel tömörít ELŐBB, ez csak egy második, szerver-oldali védelmi vonal). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
type ScanServiceDocConfidence = (typeof CONFIDENCE_VALUES)[number];

const DOCUMENT_TYPE_VALUES = ['service_book', 'invoice', 'other'] as const;
type ScanServiceDocDocumentType = (typeof DOCUMENT_TYPE_VALUES)[number];

function isConfidence(value: unknown): value is ScanServiceDocConfidence {
  return typeof value === 'string' && (CONFIDENCE_VALUES as readonly string[]).includes(value);
}

function isDocumentType(value: unknown): value is ScanServiceDocDocumentType {
  return typeof value === 'string' && (DOCUMENT_TYPE_VALUES as readonly string[]).includes(value);
}

/** Egy fotóból legfeljebb ennyi bejegyzést fogadunk el -- defenzív felső korlát, hogy egy
 * hallucináló/félreértelmezett modellválasz ne tudjon irreálisan sok (pl. 100+) üres/hibás
 * sort a wizard state-jébe zúdítani. Egy valós szervizkönyv-oldal/számla ennél jóval kevesebb
 * eseményt tartalmaz jellemzően. */
const MAX_ENTRIES = 20;

/** Egy dátum-mező szöveghossza -- csak a formai előszűréshez, a tényleges validáció a
 * `DATE_PATTERN`-nel történik. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Km óra állás -- csak számjegyek, ésszerű felső korlát (2 000 000 km), ugyanaz a szabály,
 * mint `lib/inspections/validation.ts` `sanitizeOdometer`/`sanitizeServiceMileage`-nél. */
const MAX_MILEAGE = 2_000_000;

/** "Típus" mező max. hossza -- ugyanaz a mező, amit a user is szabadon gépelhet be
 * (`StepServiceHistory.tsx`, `SERVICE_ENTRY_TYPE_SUGGESTIONS` datalist-tel), nincs zárt
 * katalógus-validáció (ellentétben az `equipment_parse` route-tal), csak egy ésszerű
 * hosszkorlát a nyilvánvalóan hibás/túl hosszú modellkimenet ellen. */
const MAX_TYPE_LENGTH = 80;

/** "Megjegyzés" mező max. hossza -- lásd fent. */
const MAX_NOTES_LENGTH = 300;

interface ScanServiceDocRequestBody {
  /** A kép Base64-tartalma -- data URL VAGY nyers Base64 + külön `mimeType` mező, ugyanaz a
   * kontraktus, mint a `scan-vin` route-nál. */
  image: string;
  mimeType?: string;
  /** A wizard-munkamenet vizsgálat-azonosítója -- lásd `scan-vin/route.ts` azonos mezőjének
   * JSDoc-ját ("1 AI kredit = 1 vizsgálat", `lib/inspectionAiCredit.ts`). */
  inspectionId: string;
}

interface RawServiceEntry {
  date?: unknown;
  mileage?: unknown;
  type?: unknown;
  notes?: unknown;
}

interface ScanServiceDocModelResponse {
  entries?: unknown;
  confidence?: unknown;
  detectedDocumentType?: unknown;
}

/** A kliens felé visszaadott, MÁR megtisztított bejegyzés -- minden mező opcionális, mert egy
 * fotóról nem biztos, hogy MINDEN mező (pl. km óra állás) kiolvasható -- a hiányzó mezőket a
 * szaki manuálisan tölti ki a `StepServiceHistory.tsx` már meglévő inputjaival, a bejegyzés
 * ettől függetlenül létrejön a listában. */
interface CleanServiceEntry {
  date?: string;
  mileage?: string;
  type?: string;
  notes?: string;
}

interface ScanServiceDocData {
  entries: CleanServiceEntry[];
  confidence: ScanServiceDocConfidence;
  detectedDocumentType: ScanServiceDocDocumentType;
}

interface ScanServiceDocSuccessResponse {
  success: true;
  data: ScanServiceDocData;
}

interface ScanServiceDocErrorResponse {
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
 * `parseDataUrl()`-jét (ugyanaz a kód, szándékosan duplikálva route-onként, nem közös
 * modulba emelve, mert a két route egyébként is teljesen független szerver-oldali fájl,
 * ugyanaz a minta, mint a `MODEL_CANDIDATES`/`toErrorDetails` egyéb duplikációinál). FONTOS:
 * NINCS `s` (dotAll) regex flag, lásd az eredeti kommentet a `TS1501` build-hibáról. */
function parseDataUrl(image: string): { mimeType: string; data: string } | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(image.trim());
  if (!match) return null;
  return { mimeType: match[1].trim().toLowerCase(), data: match[2].trim() };
}

/** Mai dátum "YYYY-MM-DD" alakban -- a jövőbeli dátumok kiszűréséhez (egy szervizesemény
 * sosem lehet a jövőben). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Egyetlen nyers modell-bejegyzést tisztít/validál a TÉNYLEGES mezőnkénti szabályok szerint --
 * szigorúan, a `parse-equipment`/`scan-vin` route-ok elvét követve: a modell kimenete
 * szemantikailag helytelen lehet a séma-megfelelés ellenére is, ezért MINDEN mezőt itt, a
 * szerveren MÉG EGYSZER ellenőrzünk, nem bízzuk kizárólag a `responseSchema`-ra. Egy
 * érvénytelennek bizonyuló mezőt csendben KIHAGYUNK a válaszból (a mező üresen marad, a szaki
 * kézzel pótolja), nem dobjuk el emiatt a teljes bejegyzést -- lásd a `CleanServiceEntry`
 * JSDoc-ját.
 *
 * @returns `null`, ha a bejegyzésnek EGYETLEN használható mezője sincs (ilyenkor nincs értelme
 * egy teljesen üres sort felvenni a listába).
 */
function sanitizeServiceEntry(raw: RawServiceEntry): CleanServiceEntry | null {
  const clean: CleanServiceEntry = {};

  if (typeof raw.date === 'string') {
    const trimmed = raw.date.trim();
    if (DATE_PATTERN.test(trimmed) && trimmed <= todayIso()) {
      clean.date = trimmed;
    }
  }

  if (typeof raw.mileage === 'string' || typeof raw.mileage === 'number') {
    const digitsOnly = String(raw.mileage).replace(/\D/g, '');
    if (digitsOnly) {
      const numeric = Number(digitsOnly);
      if (Number.isFinite(numeric) && numeric >= 0 && numeric <= MAX_MILEAGE) {
        clean.mileage = digitsOnly;
      }
    }
  }

  if (typeof raw.type === 'string' && raw.type.trim()) {
    clean.type = raw.type.trim().slice(0, MAX_TYPE_LENGTH);
  }

  if (typeof raw.notes === 'string' && raw.notes.trim()) {
    clean.notes = raw.notes.trim().slice(0, MAX_NOTES_LENGTH);
  }

  return Object.keys(clean).length > 0 ? clean : null;
}

/** A Gemini modellt a szervizkönyv/számla fotók tipikus tartalmára és a wizard mezőkiosztására
 * szorítjuk. A "Típus" mezőnél SZÁNDÉKOSAN NEM zárt katalógus -- a
 * `SERVICE_ENTRY_TYPE_SUGGESTIONS` listát csak JAVASLATKÉNT kapja a modell (ugyanaz a lista,
 * amit a `StepServiceHistory.tsx` datalist-je is javasol a usernek), hogy egységesebb, a UI-val
 * konzisztens megnevezéseket adjon vissza, DE ha a dokumentumon egy ettől eltérő, konkrétabb
 * munkamegnevezés szerepel, azt is elfogadjuk szabad szövegként. */
function buildSystemInstruction(): string {
  const typeSuggestions = JSON.stringify(SERVICE_ENTRY_TYPE_SUGGESTIONS);

  return `Te egy magyar nyelvű autószerviz-dokumentum elemző asszisztens vagy. A feladatod, hogy a felhasználó által feltöltött fotóról (szervizkönyv egy vagy több oldala, szervizszámla, vagy munkalap) kinyerd a rajta szereplő ÖSSZES szerviz-eseményt.

SZABÁLYOK:
1. Egy fotón (pl. egy szervizkönyv táblázatos oldalán, vagy egy tételes számlán) TÖBB szerviz-esemény is szerepelhet -- mindegyiket KÜLÖN elemként add vissza az "entries" tömbben. Ha csak egyetlen esemény azonosítható (pl. egyetlen számla egyetlen látogatásról), az "entries" tömb egyetlen elemet tartalmazzon.
2. "date": a szerviz-esemény dátuma PONTOSAN "YYYY-MM-DD" formátumban (pl. "2024-03-15"). Ha a dokumentumon csak hónap/év szerepel, a hónap ELSŐ napját add vissza (pl. "2024-03" -> "2024-03-01"). Ha a dátum egyáltalán nem olvasható/nem szerepel, hagyd ki ezt a mezőt az adott bejegyzésnél.
3. "mileage": a km óra állás a szerviz-esemény időpontjában, KIZÁRÓLAG számjegyekkel, elválasztó/mértékegység NÉLKÜL (pl. "84 000 km" -> "84000"). Ha nem olvasható/nem szerepel, hagyd ki.
4. "type": az elvégzett munka rövid, magyar megnevezése. Törekedj arra, hogy -- ha a dokumentumon szereplő munka egyértelműen megfeleltethető -- az alábbi JAVASOLT megnevezések egyikét add vissza PONTOSAN úgy, ahogy szerepel: ${typeSuggestions}. Ha a dokumentumon ennél konkrétabb/eltérő munka szerepel (pl. "Vízpumpa csere", "Kipufogó javítás"), akkor a dokumentumon szereplő, tömör magyar megnevezést add vissza szabad szövegként -- SOSE találj ki olyan munkát, ami nem szerepel a dokumentumon.
5. "notes": opcionális, tömör magyar megjegyzés -- pl. konkrét cserélt alkatrészek, garanciális megjegyzés, szerviz neve/helye, ha ez EXTRA információt ad a "type" mezőhöz képest. Ha nincs ilyen, hagyd ki ezt a mezőt.
6. Ha a képen SEMMILYEN felismerhető szerviz-esemény nincs (pl. üres oldal, olvashatatlan kép, vagy a dokumentum nem szervizmúlttal kapcsolatos), az "entries" tömb legyen üres.
7. A "confidence" mező a SAJÁT bizonyosságod a kinyert adatokra vonatkozóan: "high" (a legtöbb mező tisztán olvasható), "medium" (néhány mező bizonytalan/hiányzik), "low" (a kép rossz minőségű, vagy csak részleges adatokat sikerült kiolvasni).
8. "detectedDocumentType": "service_book" (szervizkönyv oldala, jellemzően táblázatos/pecsételt formátum), "invoice" (számla/munkalap, tételes díjtétel-listával), vagy "other" (egyik kategóriába sem sorolható egyértelműen).

Kizárólag a megadott JSON séma szerinti választ add -- semmi mást, se magyarázatot, se markdown jelölést, se kódblokkot.`;
}

export async function POST(request: NextRequest): Promise<NextResponse<ScanServiceDocSuccessResponse | ScanServiceDocErrorResponse>> {
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

  let body: ScanServiceDocRequestBody;
  try {
    body = (await request.json()) as ScanServiceDocRequestBody;
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
    // ELŐZETES AI-KVÓTA ELLENŐRZÉS -- lásd `parse-equipment/route.ts` azonos elvű kommentjét.
    // 2026-08-06-tól ez az EGYETLEN kapu -- lásd `scan-vin/route.ts` azonos elvű kommentjét
    // a régi kredit-gate eltávolításának indoklásáról.
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
        entries: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              mileage: { type: Type.STRING },
              type: { type: Type.STRING },
              notes: { type: Type.STRING },
            },
            propertyOrdering: ['date', 'mileage', 'type', 'notes'],
          },
        },
        confidence: { type: Type.STRING, enum: [...CONFIDENCE_VALUES] },
        detectedDocumentType: { type: Type.STRING, enum: [...DOCUMENT_TYPE_VALUES] },
      },
      propertyOrdering: ['entries', 'confidence', 'detectedDocumentType'],
      required: ['entries', 'confidence', 'detectedDocumentType'],
    },
  };

  const contents = [
    {
      role: 'user' as const,
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        {
          text: 'Elemezd a képet a rendszerutasítás szabályai szerint, és add vissza a kinyert szerviz-eseményeket a megadott JSON sémában.',
        },
      ],
    },
  ];

  // Modell-fallback lánc -- ugyanaz a minta, mint a `scan-vin`/`parse-equipment` route-oknál.
  let rawText: string | undefined;
  let succeeded = false;
  let primaryError: unknown;
  // Melyik modell adta a ténylegesen felhasznált választ -- Platform Admin
  // AI-hívás-napló célja (lásd `lib/aiApiCallLog.ts`), a statikus ÉS a dinamikus
  // fallback ág is beállítja siker esetén.
  let usedModel: string | undefined;

  for (let i = 0; i < MODEL_CANDIDATES.length; i++) {
    const model = MODEL_CANDIDATES[i];
    try {
      const response = await ai.models.generateContent({ model, contents, config: generationConfig });
      rawText = response.text;
      succeeded = true;
      usedModel = model;
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
        console.error(`[scan-service-doc] Statikus MODEL_CANDIDATES mind elbuktak -- dinamikus fallback próbálkozás: ${dynamicModelName}`);
        try {
          const response = await ai.models.generateContent({ model: dynamicModelName, contents, config: generationConfig });
          rawText = response.text;
          succeeded = true;
          usedModel = dynamicModelName;
        } catch (error) {
          console.error(`Gemini API Error details (dynamic fallback model: ${dynamicModelName}):`, error);
        }
      } else {
        console.error('[scan-service-doc] Dinamikus modell-listázás nem talált "flash" nevet tartalmazó modellt.');
      }
    } catch (error) {
      console.error('[scan-service-doc] Dinamikus modell-listázás (ai.models.list()) hívási hiba:', error);
    }
  }

  // Platform Admin AI-hívás-napló (2026-08-17) -- MINDEN ténylegesen megtörtént
  // Gemini-hívás-próbálkozást naplózunk, sikereset ÉS sikertelent is, FÜGGETLENÜL
  // az alábbi JSON-validáció kimenetétől -- lásd `lib/aiApiCallLog.ts`. Best-effort,
  // sosem dob hibát/nem akasztja meg a választ.
  await logAiApiCall(user.id, FEATURE_NAME, usedModel ?? MODEL_CANDIDATES[0], succeeded);

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
    console.error('[scan-service-doc] A Gemini válasz nem érvényes JSON:', rawText, error);
    return NextResponse.json(
      { success: false, error: 'A Gemini API válasza nem érvényes JSON.', details: toErrorDetails(error) },
      { status: 502 }
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    return NextResponse.json({ success: false, error: 'A Gemini API válasza nem a várt objektum formátumú.' }, { status: 502 });
  }

  const modelResponse = parsed as ScanServiceDocModelResponse;

  if (!Array.isArray(modelResponse.entries)) {
    return NextResponse.json({ success: false, error: 'A Gemini API válasza nem tartalmaz érvényes "entries" tömböt.' }, { status: 502 });
  }
  if (!isConfidence(modelResponse.confidence)) {
    return NextResponse.json({ success: false, error: 'A Gemini API válasza érvénytelen "confidence" értéket tartalmaz.' }, { status: 502 });
  }
  if (!isDocumentType(modelResponse.detectedDocumentType)) {
    return NextResponse.json({ success: false, error: 'A Gemini API válasza érvénytelen "detectedDocumentType" értéket tartalmaz.' }, { status: 502 });
  }

  // Szigorú, MÉG EGYSZER (nem csak a responseSchema-ra bízott) mezőnkénti validáció -- lásd
  // `sanitizeServiceEntry()` JSDoc-ját. A `MAX_ENTRIES`-nél is levágjuk a listát, defenzíven.
  const entries: CleanServiceEntry[] = [];
  for (const rawEntry of modelResponse.entries as unknown[]) {
    if (entries.length >= MAX_ENTRIES) break;
    if (!rawEntry || typeof rawEntry !== 'object') continue;
    const cleaned = sanitizeServiceEntry(rawEntry as RawServiceEntry);
    if (cleaned) entries.push(cleaned);
  }

  const data: ScanServiceDocData = {
    entries,
    confidence: modelResponse.confidence,
    detectedDocumentType: modelResponse.detectedDocumentType,
  };

  // "1 AI KREDIT = 1 VIZSGÁLAT" CLAIM + KREDIT/KVÓTA LEVONÁS -- KIZÁRÓLAG sikeres, érvényes
  // Gemini-válasz UTÁN, és KIZÁRÓLAG ha ez a vizsgálat MÉG nem volt "AI-aktív". Lásd
  // `lib/inspectionAiCredit.ts` JSDoc-ját a race-condition kezelésről.
  if (!alreadyClaimed) {
    let wonClaim = false;
    try {
      wonClaim = await claimInspectionAiCredit(user.id, inspectionId);
    } catch (error) {
      console.error('[scan-service-doc] Vizsgálat AI-kredit claim sikertelen a sikeres AI hívás után:', error);
    }

    if (wonClaim) {
      try {
        await consumeAiQuota(user.id);
      } catch (error) {
        console.error('[scan-service-doc] AI-kvóta levonás sikertelen a sikeres AI hívás után:', error);
      }
    }
  }

  return NextResponse.json({ success: true, data });
}
