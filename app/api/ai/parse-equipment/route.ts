import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { EQUIPMENT_ITEMS } from '@/lib/inspections/constants';
import type { FeatureState, FeatureStatus } from '@/lib/inspections/types';

/**
 * Google Gemini backend a Felszereltség modul "Hibrid Okos-Lista" hangalapú/szabadszöveges
 * kitöltéséhez (PROJEKT_INSTRUKCIOK.md, "AI API Route létrehozása" lépés).
 *
 * A vizsgáló a `StepEquipment.tsx`-ben egy hangalapú (Web Speech API, lásd
 * `lib/speech-recognition.d.ts`) vagy szabadon beírt magyar nyelvű leírást diktál/gépel be
 * (pl. "a klíma működik, a tolatókamera hibás, homályos a kép, navigáció nincs az autóban"),
 * ezt küldi ez a route a Gemini modellnek, ami a `lib/inspections/constants.ts`
 * `EQUIPMENT_ITEMS` KATALÓGUSÁRA szigorúan korlátozva (semmilyen más elem-nevet nem fogadunk
 * el a válaszból) tér vissza a felismert elemek `FeatureState`-jeivel -- a kliens ezekkel az
 * `id`/`status`/`notes` frissítésekkel tudja utólag (merge-eléssel) átírni a wizard state-jét,
 * a `currentStates`-ben esetlegesen már meglévő, NEM említett elemeket változatlanul hagyva.
 *
 * **Modellválasztás + fallback-lánc (2026-08-02, három egymást követő hiba elhárítása):**
 * (1) a `gemini-2.0-flash` ingyenes (free tier) kvótája egyes Google AI Studio
 * projekteken `0`-ra volt állítva -- MINDEN hívás azonnal `429 RESOURCE_EXHAUSTED,
 * limit: 0`-val bukott. (2) A `gemini-2.0-flash` NÉV -- a Google modell-kivezetései miatt
 * -- azóta TELJESEN meg is szűnt (`404 NOT_FOUND, "This model models/gemini-2.0-flash is
 * no longer available"`). (3) A fallback-lánc akkori második tagja, a `gemini-1.5-pro`
 * SOSEM volt valódi, hivatalosan elérhető modellazonosító -- ez a NÉV maga adott
 * `404 NOT_FOUND`-ot, és mivel a hibaválasz `details` mezője korábban mindig az UTOLSÓ
 * (a fallback-láncban legutolsóként megpróbált) modell hibáját mutatta, ez ELFEDTE a
 * VALÓDI, elsődleges (`gemini-1.5-flash`) hiba okát -- a UI-n úgy tűnt, mintha az
 * elsődleges modell adna 404-et, holott az valójában sikeresen elérhető, csak a
 * fallback-modellnév volt hibás.
 *
 * Emiatt a `MODEL_CANDIDATES` mostantól KIZÁRÓLAG hivatalosan támogatott, jelenleg aktív
 * Flash modellazonosítókat tartalmaz (`gemini-1.5-flash` elsődleges, `gemini-1.5-flash-latest`
 * a stabil verzió-alias fallback-ként -- lásd `MODEL_CANDIDATES`), ÉS a `POST` handler
 * modell-ciklusa mostantól KIZÁRÓLAG az ELSŐDLEGES (index 0) modell hibáját adja vissza a
 * `details` mezőben, függetlenül attól, hány fallback próbálkozás futott utána -- lásd a
 * `POST` handler `primaryError` változóját.
 *
 * `runtime = 'nodejs'`, mert a `@google/genai` SDK Node.js API-kra (pl. `fetch` felett, de a
 * csomag maga Node.js-célzású) épül -- Edge runtime-on nem garantált a működése.
 */
export const runtime = 'nodejs';

/** Modell-fallback lánc, kipróbálási sorrendben -- lásd a fenti JSDoc "Modellválasztás +
 * fallback-lánc" pontját. Az első sikeres válasz azonnal megszakítja a ciklust, a
 * `POST` handlerben. SZÁNDÉKOSAN NEM tartalmazza SEM a `gemini-2.0-flash`-t (a Google
 * oldalán megszűnt modellnév, `404 NOT_FOUND`), SEM a `gemini-1.5-pro`-t (ez a "pro"
 * variáns-név SOSEM volt hivatalosan érvényes azonosító ebben az SDK-ban, szintén
 * `404 NOT_FOUND`-ot adott) -- mindkettő csak egy garantáltan bukó, felesleges
 * próbálkozást (és a valódi hiba elfedését, lásd fent) jelentett volna minden hívásnál. */
const MODEL_CANDIDATES = ['gemini-1.5-flash', 'gemini-1.5-flash-latest'] as const;

const VALID_STATUSES: FeatureStatus[] = ['working', 'defective', 'not_present'];

function isValidStatus(value: unknown): value is FeatureStatus {
  return typeof value === 'string' && (VALID_STATUSES as string[]).includes(value);
}

interface ParseEquipmentRequestBody {
  text: string;
  /** Opcionális, a jelenlegi gomb-állapotok -- MVP-ben csak kontextusnak/jövőbeli
   * finomításnak tartjuk fenn (pl. hogy a modell tudja, mi volt már beállítva), a validáció
   * és a végleges válasz nem függ tőle. */
  currentStates?: FeatureState[];
}

interface ParsedEquipmentItem {
  id?: unknown;
  status?: unknown;
  notes?: unknown;
}

interface ParseEquipmentSuccessResponse {
  success: true;
  updates: FeatureState[];
}

interface ParseEquipmentErrorResponse {
  success: false;
  error: string;
  /** A nyers hibaüzenet (kivétel `.message`-e, vagy `String(error)` ha nem `Error`
   * példány) -- KIZÁRÓLAG hibakeresési célból kerül bele a válaszba, hogy Vercel-en (ahol
   * a szerver-konzol logok nem mindig kényelmesen elérhetők) is azonnal látszódjon a
   * tényleges ok (pl. hibás/hiányzó API kulcs, kvóta-túllépés, modellnév-hiba stb.), ne
   * csak egy generikus "Hiba történt..." szöveg. */
  details?: string;
}

/** Kivétel-objektumból (vagy bármilyen `catch`-elt értékből) egységesen kinyert,
 * naplózásra/válaszba küldésre alkalmas szöveg. */
function toErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const MAX_TEXT_LENGTH = 4000;

/** A Gemini modellt a katalógus PONTOS elem-neveire szorítjuk -- a rendszerutasítás
 * (systemInstruction) explicit felsorolja a teljes, jelenleg érvényes katalógust, hogy a
 * modell ne találjon ki új, a UI-ban nem létező elemnevet. */
function buildSystemInstruction(): string {
  const catalogJson = JSON.stringify(EQUIPMENT_ITEMS);

  return `Te egy magyar nyelvű autóvizsgáló szakértő asszisztense vagy. A feladatod, hogy a felhasználó által diktált vagy beírt szabad szöveges magyar leírásból kinyerd, mely felszereltségi elemek állapotát említette, és ezeket a MEGADOTT KATALÓGUS elemeihez rendeld hozzá.

SZABÁLYOK:
1. KIZÁRÓLAG a katalógusban szó szerint szereplő elem-neveket használhatod "id" mezőként -- SOHA ne találj ki új elemnevet, és SOHA ne módosítsd, rövidítsd vagy fordítsd le a katalógusban szereplő pontos elnevezést.
2. Csak azokat az elemeket add vissza, amelyeket a szöveg EXPLICITEN, egyértelműen említ. Köznyelvi elnevezéseket/szinonimákat felismerhetsz (pl. "klíma" -> "Klímaberendezés"), de ha nem egyértelmű, melyik katalógus-elemről van szó, hagyd ki.
3. A "status" mező PONTOSAN az alábbi három érték egyike lehet:
   - "working" -- ha a szöveg szerint az elem működik / rendben van / megfelelő.
   - "defective" -- ha a szöveg szerint az elem hibás / nem működik / sérült / valamilyen problémája van.
   - "not_present" -- ha a szöveg szerint az elem nincs az autóban / nem releváns / nem szerelték fel.
4. Ha egy "defective" elemhez a szöveg konkrét hibaleírást is tartalmaz (pl. "recseg", "nem fűt", "villog a fényszóró"), add vissza tömören, magyarul a "notes" mezőben. Minden más esetben hagyd el a "notes" mezőt.
5. Ha a szöveg egyetlen felismerhető felszereltségi elemet sem tartalmaz, adj vissza üres tömböt.
6. Kizárólag a megadott JSON séma szerinti választ add -- semmi mást, se magyarázatot, se markdown jelölést, se kódblokkot.

KATALÓGUS (a pontos elem-nevek -- EZEKET és KIZÁRÓLAG ezeket használd "id"-ként):
${catalogJson}`;
}

export async function POST(request: NextRequest): Promise<NextResponse<ParseEquipmentSuccessResponse | ParseEquipmentErrorResponse>> {
  // Környezeti változó megtisztítása -- Vercel-en (vagy más .env kezelőkben) előfordul,
  // hogy a beillesztett API kulcs köré véletlenül idézőjelek kerülnek, vagy a másolás
  // felesleges vezető/záró szóközt/sortörést hagy maga után. Egy ilyen "szennyezett" kulcs
  // a Gemini API-nál generikus hitelesítési hibaként (a mi kódunkban eddig "Hiba történt a
  // Gemini API hívása közben"-ként) jelentkezett, a valódi ok (érvénytelen kulcs) elrejtve
  // maradt -- ezért itt, HASZNÁLAT ELŐTT explicit tisztítjuk.
  const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '');
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'A GEMINI_API_KEY érvénytelen vagy hiányzik.' }, { status: 500 });
  }

  let body: ParseEquipmentRequestBody;
  try {
    body = (await request.json()) as ParseEquipmentRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Érvénytelen JSON kérés törzs.' }, { status: 400 });
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json(
      { success: false, error: 'A "text" mező kötelező és nem lehet üres.' },
      { status: 400 }
    );
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { success: false, error: `A szöveg túl hosszú (max ${MAX_TEXT_LENGTH} karakter).` },
      { status: 400 }
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  const generationConfig = {
    systemInstruction: buildSystemInstruction(),
    temperature: 0,
    responseMimeType: 'application/json' as const,
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          status: { type: Type.STRING, enum: VALID_STATUSES },
          notes: { type: Type.STRING },
        },
        // A `propertyOrdering` explicit megadása a kimenet stabil mezősorrendjéhez -- a
        // Google dokumentáció a (mára kivezetett) 2.0-s modelleknél kifejezetten kérte,
        // újabb modelleknél már opcionális, de az itt használt 1.5-ös modelleknél sem árt --
        // ugyanaz a séma megy mindkét `MODEL_CANDIDATES`-belihez.
        propertyOrdering: ['id', 'status', 'notes'],
        required: ['id', 'status'],
      },
    },
  };

  // Modell-fallback lánc -- sorban kipróbáljuk a `MODEL_CANDIDATES`-t, az ELSŐ sikeres
  // választ azonnal felhasználjuk. MINDEN próbálkozás hibáját logoljuk (modellnevenként
  // külön, hogy a Vercel logokból pontosan látszódjon, melyik modell hányadik
  // próbálkozásra bukott el), DE a kliensnek küldött `details` mezőbe KIZÁRÓLAG az
  // ELSŐDLEGES (`MODEL_CANDIDATES[0]`) modell hibáját tesszük -- egy esetleges
  // fallback-modell (pl. hibás/érvénytelen névvel) hibája NE fedje el a valódi,
  // elsődleges okot (lásd a fájl fejléc-JSDoc-jában a `gemini-1.5-pro` 404-es esetét).
  let rawText: string | undefined;
  let succeeded = false;
  let primaryError: unknown;

  for (let i = 0; i < MODEL_CANDIDATES.length; i++) {
    const model = MODEL_CANDIDATES[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: `Diktált/beírt szöveg:\n"""\n${text}\n"""` }] }],
        config: generationConfig,
      });

      rawText = response.text;
      succeeded = true;
      break;
    } catch (error) {
      console.error(`Gemini API Error details (model: ${model}):`, error);
      if (i === 0) primaryError = error;
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
    console.error('[parse-equipment] A Gemini válasz nem érvényes JSON:', rawText, error);
    return NextResponse.json(
      { success: false, error: 'A Gemini API válasza nem érvényes JSON.', details: toErrorDetails(error) },
      { status: 502 }
    );
  }

  if (!Array.isArray(parsed)) {
    return NextResponse.json(
      { success: false, error: 'A Gemini API válasza nem a várt tömb formátumú.' },
      { status: 502 }
    );
  }

  // Szigorú, kliens-oldalon MÉG EGYSZER (nem csak a promptra/responseSchema-ra bízva) végzett
  // validáció -- a modell kimenete szemantikailag helytelen lehet a séma-megfelelés ellenére
  // is (lásd a Gemini strukturált kimenet dokumentáció "Validation" best practice pontját),
  // ezért minden elemet a TÉNYLEGES `EQUIPMENT_ITEMS` katalógushoz és a `FeatureStatus`
  // unióhoz ellenőrzünk -- bármi, ami nem egyezik pontosan, csendben kimarad a válaszból.
  const catalogSet = new Set(EQUIPMENT_ITEMS);
  const seenIds = new Set<string>();
  const updates: FeatureState[] = [];

  for (const rawItem of parsed as unknown[]) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as ParsedEquipmentItem;

    if (typeof item.id !== 'string' || !catalogSet.has(item.id)) continue;
    if (!isValidStatus(item.status)) continue;
    if (seenIds.has(item.id)) continue; // duplikátum -- csak az első előfordulást tartjuk meg

    const featureState: FeatureState = { id: item.id, status: item.status };
    if (item.status === 'defective' && typeof item.notes === 'string' && item.notes.trim()) {
      featureState.notes = item.notes.trim();
    }

    updates.push(featureState);
    seenIds.add(item.id);
  }

  return NextResponse.json({ success: true, updates });
}
