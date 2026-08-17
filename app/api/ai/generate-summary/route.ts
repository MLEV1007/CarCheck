import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@/lib/supabase/server';
import { checkAiQuota, consumeAiQuota } from '@/lib/quotas';
import { hasInspectionClaimedAiCredit, claimInspectionAiCredit } from '@/lib/inspectionAiCredit';
import { logAiApiCall } from '@/lib/aiApiCallLog';

/**
 * Google Gemini backend a "Végső Szakvélemény & Várható Költségek" modul (10. wizard
 * lépés, `StepFinalAssessment.tsx`) "✨ Automatikus összefoglaló írása (AI)" gombjához.
 *
 * A kliens a `buildInspectionSnapshot()`-tal (lásd `StepFinalAssessment.tsx`) összeállított,
 * a TELJES aktuális vizsgálati adatból (autó adatai, diagnosztika, felszereltség,
 * gumiabroncsok, festékvastagság-mérés, sérülések, hibák) képzett JSON-t küldi ennek a
 * route-nak -- KIZÁRÓLAG szöveges/számszerű mezőkkel, `File`/`blob:` hivatkozás nélkül
 * (azok a Gemini szöveg-modellnek irrelevánsak, és JSON-ná sem szerializálhatók). A route
 * egyetlen, 3-4 mondatos, objektív magyar szakvéleményt ad vissza sima szövegként (NEM
 * JSON-t, NEM markdown-t), amit a kliens közvetlenül a "Szöveges összefoglaló" textarea-ba
 * illeszt.
 *
 * **Modellválasztás + fallback-lánc (2026-08-16, frissítve):** UGYANAZ a minta, mint a
 * `parse-equipment/route.ts`-nél (lásd annak részletes JSDoc-ját a `gemini-2.0-flash`
 * 2026-06-01-i kivezetéséről és a fiókszintű napi kérés-plafonról) -- elsődleges
 * `gemini-3.1-flash-lite`, fallback `gemini-3.6-flash`. Itt NINCS `responseSchema`/strukturált JSON kimenet (a válasz maga
 * egy szabad szöveges bekezdés), ezért a `generationConfig` egyszerűbb, mint a
 * `parse-equipment`/`scan-vin` route-oknál.
 *
 * `runtime = 'nodejs'` -- ugyanazon okból, mint a projekt többi Gemini route-jánál (lásd
 * `parse-equipment/route.ts` JSDoc-ja).
 *
 * **Autentikáció + kredit-védelem:** lásd `parse-equipment/route.ts` JSDoc "Autentikáció +
 * kredit-védelem" szakaszát (CANONIKUS leírás) -- ugyanaz a minta, `featureName: 'summary_generate'`.
 */
export const runtime = 'nodejs';

/** Lásd `parse-equipment/route.ts` "Modellválasztás + fallback-lánc" JSDoc pontját (2026-08-16
 * frissítés) -- ugyanaz az elsődleges/fallback pár, ugyanazon indoklással. */
const MODEL_CANDIDATES = ['gemini-3.1-flash-lite', 'gemini-3.6-flash'] as const;

/** A `usage_logs.feature_name` értéke ehhez a route-hoz -- lásd `lib/credits.ts`. */
const FEATURE_NAME = 'summary_generate';

interface GenerateSummaryRequestBody {
  /** A `StepFinalAssessment.tsx` `buildInspectionSnapshot()` által összeállított,
   * tisztán JSON-szerializálható vizsgálati adat -- a route nem ismeri/nem kényszeríti ki
   * ennek pontos alakját (a kliens felelőssége), csak a méretét korlátozza (lásd
   * `MAX_JSON_LENGTH`) és a Gemini promptjába ágyazza. */
  inspectionData: unknown;
  /** A wizard-munkamenet vizsgálat-azonosítója -- lásd `scan-vin/route.ts` azonos mezőjének
   * JSDoc-ját ("1 AI kredit = 1 vizsgálat", `lib/inspectionAiCredit.ts`). */
  inspectionId: string;
}

interface GenerateSummarySuccessResponse {
  success: true;
  summary: string;
}

interface GenerateSummaryErrorResponse {
  success: false;
  error: string;
  /** Lásd `parse-equipment/route.ts` `toErrorDetails()` JSDoc-ját -- ugyanaz a
   * hibakeresési célú, nyers hibaüzenetet hordozó mező. */
  details?: string;
  /** Gépileg feldolgozható hibakód -- lásd `parse-equipment/route.ts` azonos mezőjének JSDoc-ját. */
  code?: string;
}

function toErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A beágyazott JSON string maximális hossza -- egy vizsgálat összes adata (fotó-URL-ek
 * NÉLKÜL, lásd fent) ennél jóval kisebb is bőven elég részletes szakvéleményhez; a
 * korlát a nyilvánvalóan hibás/túlméretezett kérések elutasítására szolgál, ugyanaz az
 * elv, mint a `parse-equipment/route.ts` `MAX_TEXT_LENGTH`-jénél. */
const MAX_JSON_LENGTH = 20000;

const SYSTEM_INSTRUCTION =
  'Te egy független gépjármű-szakértő vagy. Írj egy 3-4 mondatos, profi, objektív magyar nyelvű összefoglaló szakvéleményt az átadott JSON adatok alapján. Ne használj sallangokat, csak a tényeket értékeld (általános állapot, főbb hibák). NE formázd markdownnal.';

export async function POST(
  request: NextRequest
): Promise<NextResponse<GenerateSummarySuccessResponse | GenerateSummaryErrorResponse>> {
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

  // Lásd `parse-equipment/route.ts` ugyanerről a lépésről szóló JSDoc-ját -- a
  // Vercel/.env kezelők néha véletlenül idézőjelet/szóközt hagynak a kulcs körül.
  const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '');
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'A GEMINI_API_KEY érvénytelen vagy hiányzik.' }, { status: 500 });
  }

  let body: GenerateSummaryRequestBody;
  try {
    body = (await request.json()) as GenerateSummaryRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Érvénytelen JSON kérés törzs.' }, { status: 400 });
  }

  if (body?.inspectionData === undefined || body?.inspectionData === null) {
    return NextResponse.json(
      { success: false, error: 'Az "inspectionData" mező kötelező.' },
      { status: 400 }
    );
  }

  let inspectionDataJson: string;
  try {
    inspectionDataJson = JSON.stringify(body.inspectionData);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Az "inspectionData" nem szerializálható JSON-ná.', details: toErrorDetails(error) },
      { status: 400 }
    );
  }

  if (inspectionDataJson.length > MAX_JSON_LENGTH) {
    return NextResponse.json(
      { success: false, error: `A vizsgálati adat túl nagy (max ${MAX_JSON_LENGTH} karakter).` },
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
    // ELŐZETES AI-KVÓTA ELLENŐRZÉS -- lásd `parse-equipment/route.ts` "ELŐZETES AI-KVÓTA
    // ELLENŐRZÉS" JSDoc-kommentjét, ugyanaz a minta. 2026-08-06-tól ez az EGYETLEN kapu --
    // lásd `scan-vin/route.ts` azonos elvű kommentjét a régi kredit-gate eltávolításának
    // indoklásáról.
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
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature: 0.4,
  };

  const contents = [
    { role: 'user' as const, parts: [{ text: `Vizsgálati adatok (JSON):\n${inspectionDataJson}` }] },
  ];

  // Modell-fallback lánc -- lásd `parse-equipment/route.ts` ugyanerről szóló, részletes
  // JSDoc-ját. Itt (a szándékosan kisebb felület miatt) a dinamikus `ai.models.list()`
  // végső biztonsági hálót NEM ismételjük meg -- ha mindkét statikus jelölt elbukik, azt
  // egy 502-es hibaként adjuk vissza, a kliens toast/hibaüzenete pedig egyértelműen jelzi,
  // hogy a szakinak kézzel kell megírnia az összefoglalót.
  let rawText: string | undefined;
  let succeeded = false;
  let primaryError: unknown;
  // Melyik modell adta a ténylegesen felhasznált választ -- Platform Admin
  // AI-hívás-napló célja (lásd `lib/aiApiCallLog.ts`).
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

  // Platform Admin AI-hívás-napló (2026-08-17) -- MINDEN ténylegesen megtörtént
  // Gemini-hívás-próbálkozást naplózunk, sikereset ÉS sikertelent is -- lásd
  // `lib/aiApiCallLog.ts`. Best-effort, sosem dob hibát/nem akasztja meg a választ.
  await logAiApiCall(user.id, FEATURE_NAME, usedModel ?? MODEL_CANDIDATES[0], succeeded);

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

  const summary = rawText?.trim();
  if (!summary) {
    return NextResponse.json({ success: false, error: 'A Gemini API üres választ adott.' }, { status: 502 });
  }

  // "1 AI KREDIT = 1 VIZSGÁLAT" CLAIM + KREDIT/KVÓTA LEVONÁS -- KIZÁRÓLAG sikeres, érvényes
  // Gemini-válasz UTÁN, és KIZÁRÓLAG ha ez a vizsgálat MÉG nem volt "AI-aktív". Lásd
  // `lib/inspectionAiCredit.ts` JSDoc-ját a race-condition kezelésről.
  if (!alreadyClaimed) {
    let wonClaim = false;
    try {
      wonClaim = await claimInspectionAiCredit(user.id, inspectionId);
    } catch (error) {
      console.error('[generate-summary] Vizsgálat AI-kredit claim sikertelen a sikeres AI hívás után:', error);
    }

    if (wonClaim) {
      try {
        await consumeAiQuota(user.id);
      } catch (error) {
        console.error('[generate-summary] AI-kvóta levonás sikertelen a sikeres AI hívás után:', error);
      }
    }
  }

  return NextResponse.json({ success: true, summary });
}
