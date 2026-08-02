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
 * **Modellválasztás + fallback-lánc (2026-08-02, végleges változat -- a korábbi hibás
 * kísérletek teljes története a git history-ban követhető, itt csak a jelenlegi,
 * ÉRVÉNYES állapot):** a felhasználói Google AI Studio API kulcs és számlázási fiók
 * aktiválása óta a `gemini-2.0-flash` és a mindenkori legfrissebb "flash" modell is
 * zökkenőmentesen elérhető -- a korábbi `1.5`-ös modellnevekre (amik a Google
 * modell-kivezetései miatt közben elavultak) többé NINCS szükség, minden ilyen
 * hivatkozás törölve. Elsődleges modell `gemini-2.0-flash`, fallback a
 * `gemini-flash-latest` (a Google mindenkori legújabb, stabil "flash" verzió-aliasa --
 * ez a NÉV saját magát tartja karban a Google oldalán, így egy jövőbeli
 * `gemini-2.0-flash`-kivezetés esetén sem kell a kódot módosítani).
 *
 * **Dinamikus modell-listázó végső biztonsági háló:** ha VÉLETLENÜL mindkét fix
 * `MODEL_CANDIDATES` név elbukna (pl. egy jövőbeli, előre nem látott Google-oldali
 * modell-átnevezés miatt), a `POST` handler `ai.models.list({ config: { queryBase: true
 * } })`-szal lekérdezi a ténylegesen elérhető modellek listáját, és az ELSŐ, nevében
 * "flash" szót tartalmazó modellel próbálkozik -- ez a réteg kódmódosítás NÉLKÜL is
 * túlél egy jövőbeli modellnév-változást, csak a statikus lista frissítése válik
 * feleslegessé (bár a gyorsabb, egy hálózati kör nélküli sikeres hívás miatt a
 * `MODEL_CANDIDATES` karbantartása továbbra is ajánlott).
 *
 * A hibaválasz `details` mezője TOVÁBBRA IS KIZÁRÓLAG az ELSŐDLEGES (`MODEL_CANDIDATES[0]`,
 * azaz `gemini-2.0-flash`) hibáját mutatja, függetlenül attól, hány fallback (statikus
 * VAGY dinamikus) próbálkozás futott utána -- lásd a `POST` handler `primaryError`
 * változóját, és a korábbi (`gemini-1.5-pro` 404-es esetét dokumentáló) fejlesztési
 * lépést a `status.md`-ben arról, miért fontos ez a szétválasztás.
 *
 * `runtime = 'nodejs'`, mert a `@google/genai` SDK Node.js API-kra (pl. `fetch` felett, de a
 * csomag maga Node.js-célzású) épül -- Edge runtime-on nem garantált a működése.
 */
export const runtime = 'nodejs';

/** Modell-fallback lánc, kipróbálási sorrendben -- lásd a fenti JSDoc "Modellválasztás +
 * fallback-lánc" pontját. Az első sikeres válasz azonnal megszakítja a ciklust, a
 * `POST` handlerben. Ha MINDKETTŐ elbukna, a `POST` handler egy dinamikus
 * modell-listázó fallback-kel próbálkozik tovább (lásd `ai.models.list()` hívás lent). */
const MODEL_CANDIDATES = ['gemini-2.0-flash', 'gemini-flash-latest'] as const;

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
        // Google dokumentáció a 2.0-s modelleknél kifejezetten kéri, újabb modelleknél már
        // opcionális, de nem árt -- ugyanaz a séma megy mindegyik próbált modellhez
        // (`MODEL_CANDIDATES` ÉS az esetleges dinamikus fallback modell is).
        propertyOrdering: ['id', 'status', 'notes'],
        required: ['id', 'status'],
      },
    },
  };

  // A kérés tartalma (`contents`) minden próbálkozásnál (statikus ÉS dinamikus fallback)
  // ugyanaz -- egyetlen helyen építjük fel, hogy ne duplikálódjon a kód.
  const contents = [{ role: 'user' as const, parts: [{ text: `Diktált/beírt szöveg:\n"""\n${text}\n"""` }] }];

  // Modell-fallback lánc -- sorban kipróbáljuk a `MODEL_CANDIDATES`-t, az ELSŐ sikeres
  // választ azonnal felhasználjuk. MINDEN próbálkozás hibáját logoljuk (modellnevenként
  // külön, hogy a Vercel logokból pontosan látszódjon, melyik modell hányadik
  // próbálkozásra bukott el), DE a kliensnek küldött `details` mezőbe KIZÁRÓLAG az
  // ELSŐDLEGES (`MODEL_CANDIDATES[0]`, azaz `gemini-2.0-flash`) modell hibáját tesszük --
  // egy esetleges fallback-modell hibája NE fedje el a valódi, elsődleges okot.
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

  // Dinamikus modell-listázó VÉGSŐ biztonsági háló -- KIZÁRÓLAG akkor fut le, ha MINDKÉT
  // fix `MODEL_CANDIDATES` elbukott. Lekérdezzük a ténylegesen elérhető (nem finomhangolt,
  // `queryBase: true`) modellek listáját, és az ELSŐ, nevében "flash" szót tartalmazó
  // modellel próbálkozunk -- ez a réteg egy jövőbeli, előre nem látott Google-oldali
  // modellnév-változást is túlél kódmódosítás nélkül. A `primaryError`-t EZ a próbálkozás
  // sem írja felül -- a kliens felé küldött hiba oka mindig az elsődleges statikus modellé
  // marad, a dinamikus fallback csak egy csendes, extra mentőöv.
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
        console.error(`[parse-equipment] Statikus MODEL_CANDIDATES mind elbuktak -- dinamikus fallback próbálkozás: ${dynamicModelName}`);
        try {
          const response = await ai.models.generateContent({ model: dynamicModelName, contents, config: generationConfig });
          rawText = response.text;
          succeeded = true;
        } catch (error) {
          console.error(`Gemini API Error details (dynamic fallback model: ${dynamicModelName}):`, error);
        }
      } else {
        console.error('[parse-equipment] Dinamikus modell-listázás nem talált "flash" nevet tartalmazó modellt.');
      }
    } catch (error) {
      console.error('[parse-equipment] Dinamikus modell-listázás (ai.models.list()) hívási hiba:', error);
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
