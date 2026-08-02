import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@/lib/supabase/server';
import { hasEnoughCredits, deductCredits } from '@/lib/credits';

/**
 * Google Gemini backend az "Auto-Trigger AI Diktálás" lépéshez (2026-08-02) --
 * nyelvhelyesség-javítás egy hangalapú diktálásból származó, gyakran tagolatlan/
 * nyelvtanilag pontatlan magyar szöveg-szegmensre.
 *
 * Ez a route a `VoiceInputButton.tsx` ALAPÉRTELMEZETT (`onDictationEnd` prop NÉLKÜLI)
 * viselkedésének motorja: amint a mikrofon kikapcsol, a `useSpeechToText.ts`
 * `onSessionEnd` callback-je átadja a SESSION alatt ténylegesen felismert nyers szöveget
 * (NEM a teljes mező-tartalmat, csak az újonnan bediktált részt), ez a route pedig egy
 * profi, kerek, szakmai magyar mondattá/mondatokká alakítja -- a `VoiceInputButton` a
 * választ a diktálás-indításkori mező-tartalomhoz fűzve (`joinDictatedText`) illeszti
 * be a mezőbe, a nyers verziót felülírva. Ezt a route-ot a `StepEquipment.tsx` Felszereltség
 * lépés AI diktálás kártyája SZÁNDÉKOSAN NEM használja -- ott a diktálás vége közvetlenül
 * a `/api/ai/parse-equipment` strukturált feldolgozást indítja el (lásd `StepEquipment.tsx`
 * `onDictationEnd` propját), a nyers szöveg apró nyelvtani pontatlanságai ott irrelevánsak.
 *
 * **Modellválasztás + fallback-lánc:** UGYANAZ a minta, mint a projekt többi Gemini
 * route-jánál (lásd `parse-equipment/route.ts` részletes JSDoc-ját) -- elsődleges
 * `gemini-2.0-flash`, fallback `gemini-flash-latest`.
 *
 * `runtime = 'nodejs'` -- ugyanazon okból, mint a projekt többi Gemini route-jánál.
 *
 * **Autentikáció + kredit-védelem:** lásd `parse-equipment/route.ts` JSDoc "Autentikáció +
 * kredit-védelem" szakaszát (CANONIKUS leírás) -- ugyanaz a minta, `featureName: 'grammar_fix'`.
 */
export const runtime = 'nodejs';

/** Lásd `parse-equipment/route.ts` "Modellválasztás + fallback-lánc" JSDoc pontját. */
const MODEL_CANDIDATES = ['gemini-2.0-flash', 'gemini-flash-latest'] as const;

/** A `usage_logs.feature_name` értéke ehhez a route-hoz -- lásd `lib/credits.ts`. */
const FEATURE_NAME = 'grammar_fix';

interface FixGrammarRequestBody {
  text: string;
}

interface FixGrammarSuccessResponse {
  success: true;
  text: string;
}

interface FixGrammarErrorResponse {
  success: false;
  error: string;
  details?: string;
  /** Gépileg feldolgozható hibakód -- lásd `parse-equipment/route.ts` azonos mezőjének JSDoc-ját. */
  code?: string;
}

function toErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Egyetlen diktálás-session nyers szövege ennél jóval rövidebb a gyakorlatban (egy-két
 * mondatnyi hiba-/megjegyzés-leírás) -- ugyanaz a védelmi elv, mint a
 * `parse-equipment/route.ts` `MAX_TEXT_LENGTH`-jénél. */
const MAX_TEXT_LENGTH = 4000;

const SYSTEM_INSTRUCTION =
  'Te egy magyar nyelvi lektor vagy, aki gépjármű-szakértők hangalapú diktálásait javítja. A bemenet egy hangalapú diktálásból származó, gyakran tagolatlan, nyelvtanilag pontatlan magyar szöveg. Alakítsd át egy vagy néhány profi, nyelvtanilag helyes, szakmai hangvételű magyar mondattá -- MINDEN konkrét adatot (számok, mértékegységek, alkatrész-nevek, márkanevek) őrizz meg pontosan, és NE adj hozzá új információt, NE változtass a jelentésen. A válaszod KIZÁRÓLAG a javított szöveg legyen -- semmi magyarázat, semmi idézőjel, semmi markdown formázás.';

export async function POST(
  request: NextRequest
): Promise<NextResponse<FixGrammarSuccessResponse | FixGrammarErrorResponse>> {
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

  let body: FixGrammarRequestBody;
  try {
    body = (await request.json()) as FixGrammarRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Érvénytelen JSON kérés törzs.' }, { status: 400 });
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ success: false, error: 'A "text" mező kötelező és nem lehet üres.' }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { success: false, error: `A szöveg túl hosszú (max ${MAX_TEXT_LENGTH} karakter).` },
      { status: 400 }
    );
  }

  // ELŐZETES KREDIT-ELLENŐRZÉS -- a Gemini API hívás ELŐTT. Lásd `parse-equipment/route.ts`
  // JSDoc-ját; a tényleges levonás sikeres, érvényes válasz UTÁN, lent.
  const hasCredits = await hasEnoughCredits(user.id, 1);
  if (!hasCredits) {
    return NextResponse.json(
      {
        success: false,
        error: 'Nincs elegendő AI kredit a művelet elvégzéséhez.',
        code: 'INSUFFICIENT_CREDITS',
      },
      { status: 402 }
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  const generationConfig = {
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature: 0.2,
  };

  const contents = [{ role: 'user' as const, parts: [{ text: `Nyers, diktált szöveg:\n"""\n${text}\n"""` }] }];

  // Modell-fallback lánc -- lásd `parse-equipment/route.ts` részletes JSDoc-ját. Itt
  // (a szándékosan kisebb, gyors-válaszú felület miatt) a dinamikus `ai.models.list()`
  // végső biztonsági hálót NEM ismételjük meg -- ha mindkét statikus jelölt elbukik, a
  // hívó fél (`VoiceInputButton`) csendben megtartja a mezőben már ott lévő, élőben
  // felismert NYERS szöveget, nincs adatvesztés.
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

  if (!succeeded) {
    return NextResponse.json(
      { success: false, error: 'Hiba történt a Gemini API hívása közben', details: toErrorDetails(primaryError) },
      { status: 502 }
    );
  }

  const fixedText = rawText?.trim();
  if (!fixedText) {
    return NextResponse.json({ success: false, error: 'A Gemini API üres választ adott.' }, { status: 502 });
  }

  // KREDIT LEVONÁS -- KIZÁRÓLAG sikeres, érvényes Gemini-válasz UTÁN. Lásd
  // `parse-equipment/route.ts` JSDoc-ját a hiba-esetek indoklásáról.
  try {
    await deductCredits(user.id, FEATURE_NAME, 1);
  } catch (error) {
    console.error('[fix-grammar] Kredit levonás sikertelen a sikeres AI hívás után:', error);
  }

  return NextResponse.json({ success: true, text: fixedText });
}
