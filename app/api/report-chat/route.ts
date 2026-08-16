import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@/lib/supabase/server';
import type { PublicReportData } from '@/lib/reports/types';

/**
 * Publikus (bejelentkezés NÉLKÜLI) "Kérdezz az AI-tól" chat backend a
 * `/report/[public_token]` riporthoz -- lásd `PLAN_ai_report_chat.md` (a jelen
 * route ennek a specifikációnak az implementációja).
 *
 * **Kizárólag Pro/Business csomagon elérhető** -- a tier-gate KÉTSZERESEN ki van
 * kényszerítve szerver-oldalon: (1) a `get_public_report` RPC `ai_chat_enabled`
 * mezője (lásd `supabase/migrations/20260806180000_report_ai_chat.sql`), (2) a
 * `check_and_increment_report_chat_usage` RPC IS újra ellenőrzi a `plan_tier`-t,
 * mielőtt a napi számlálót növelné -- egy manipulált kliens-hívás (pl. a UI
 * megkerülésével, közvetlen `fetch`-csel) SEM tudja bekapcsolni a chatet egy
 * Starter/Growth riporton, mert ez a route MINDIG a friss RPC-eredményre
 * támaszkodik, sosem a kliens által küldött adatra.
 *
 * **Adatkör:** a rendszerprompt KIZÁRÓLAG a `get_public_report` RPC által
 * visszaadott, ehhez az EGY riporthoz tartozó JSON-t látja -- nincs közvetlen
 * tábla-lekérdezés, tehát a modell fizikailag nem fér hozzá más
 * szervezet/riport adatához.
 *
 * **Statelesség:** Next.js Route Handlerek (Vercel serverless) nem tartanak
 * szerver-oldali munkamenet-állapotot -- minden hívás a kliens által
 * visszaküldött `history` tömbből építi újra a többfordulós beszélgetés
 * kontextusát (lásd `components/report/ReportAiChat.tsx`). A beszélgetés
 * TARTALMA sehol nem kerül DB-be mentésre (GDPR adatminimalizálás, lásd a
 * migráció fejléc-kommentjét).
 *
 * **Kvóta:** NEM a szervezet AI-kredit pooljából fogy (a felhasználó döntése:
 * "ezt tartalmazza az előfizetés díja") -- kizárólag egy riport-tokenenkénti
 * napi üzenetlimit (`DAILY_MESSAGE_LIMIT`) védi visszaélés ellen, lásd a
 * migráció kommentjét. A limit elérésekor a válasz szándékosan generikus (nem
 * "elfogyott kereted" szövegű), mert ez nem egy a felhasználónak eladott/
 * számára ismert kvóta.
 *
 * **Modellválasztás + fallback-lánc (2026-08-16, frissítve):** ugyanaz a minta, mint a
 * projekt többi `/api/ai/*` route-jánál (lásd `generate-summary/route.ts` és
 * `parse-equipment/route.ts` JSDoc-ját a `gemini-2.0-flash` 2026-06-01-i kivezetéséről) --
 * elsődleges `gemini-3.1-flash-lite`, fallback `gemini-3.6-flash`.
 */
export const runtime = 'nodejs';

const MODEL_CANDIDATES = ['gemini-3.1-flash-lite', 'gemini-3.6-flash'] as const;

/** Egyetlen üzenet maximális hossza -- lásd PLAN_ai_report_chat.md 4.4 pont. */
const MAX_MESSAGE_LENGTH = 500;

/** A kliensről visszaküldött előzmény ennyi UTOLSÓ üzenetre van vágva -- ennyi
 * bőven elég a beszélgetés koherenciájához, és korlátozza a promptba kerülő
 * adat méretét/a Gemini-hívás költségét. */
const MAX_HISTORY_MESSAGES = 16;

/** A beágyazott riport-JSON maximális hossza -- ugyanaz az elv, mint a
 * `generate-summary/route.ts` `MAX_JSON_LENGTH`-je, csak jóval nagyobb korlát,
 * mert egy teljes riport (fotó-URL-ek nélkül) ennél jellemzően kisebb. */
const MAX_REPORT_JSON_LENGTH = 30000;

/** Riport-tokenenkénti napi üzenetlimit -- lásd a migráció "A) KVÓTA" kommentjét.
 * Szándékosan bőkezű (a chat az előfizetés díjában benne van, nem egy
 * "elfogyasztható" mennyiség), csak a nyílt visszaélést hivatott megfogni. */
const DAILY_MESSAGE_LIMIT = 40;

const SYSTEM_INSTRUCTION_TEMPLATE = (reportJson: string) =>
  [
    'Te egy autóvizsgálati riport asszisztense vagy. KIZÁRÓLAG az alábbi JSON-ban szereplő, ehhez a KONKRÉT autóhoz tartozó vizsgálati adatokról válaszolhatsz, magyar nyelven.',
    'Ha a kérdés nem a riport adataihoz kapcsolódik (pl. általános autós tanács, más autó, más téma), udvariasan tereld vissza a beszélgetést a riport tartalmára.',
    'Javítási költségre vonatkozó kérdésnél KIZÁRÓLAG durva, tájékoztató jellegű nagyságrendet adj, MINDIG jelezd, hogy ez nem hivatalos árajánlat, és javasold a vizsgálatot végző szakértő vagy egy szerviz megkeresését pontos árért.',
    'Ne találj ki adatot, ami nincs a JSON-ban -- ha a kérdésre nincs elég infó a riportban, mondd meg, hogy ez a riport nem tartalmazza ezt az adatot.',
    'Válaszolj tömören (max 2-4 mondat), ne használj markdown-formázást.',
    '',
    `Vizsgálati riport adatai (JSON):\n${reportJson}`,
  ].join('\n');

interface ReportChatHistoryItem {
  role: 'user' | 'model';
  text: string;
}

interface ReportChatRequestBody {
  token?: string;
  message?: string;
  history?: ReportChatHistoryItem[];
}

interface ReportChatSuccessResponse {
  success: true;
  reply: string;
}

interface ReportChatErrorResponse {
  success: false;
  error: string;
  details?: string;
  code?: string;
}

function toErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A teljes `PublicReportData`-ból a Gemini promptba ágyazott alhalmaz -- a
 * médiafájl-URL-ek (fotók/videók) és a cég elérhetőségi adatai (telefon/email/
 * logó) szándékosan KIMARADNAK: a modellnek nincs szüksége rájuk a riport
 * adatairól szóló kérdések megválaszolásához, és feleslegesen növelnék a
 * promptot. A cégnév megmarad (kontextusnak, pl. "ki végezte a vizsgálatot").
 */
function buildReportContext(report: PublicReportData) {
  const { inspection, paint_measurements, defects, company } = report;

  return {
    car: {
      brand: inspection.car_brand,
      model: inspection.car_model,
      year: inspection.year,
      license_plate: inspection.license_plate,
      odometer: inspection.odometer,
      engine_type: inspection.engine_type,
      power_kw: inspection.power_kw,
      gross_weight_kg: inspection.gross_weight_kg,
      fuel_type: inspection.fuel_type,
    },
    diagnostics: inspection.diagnostics,
    equipment: inspection.equipment,
    tires: inspection.tires,
    service_history: {
      status: inspection.service_history?.status ?? null,
      entries: inspection.service_history?.entries ?? [],
    },
    damages: (inspection.damages ?? []).map((d) => ({ type: d.type, title: d.title, description: d.description })),
    paint_measurements: paint_measurements.map((pm) => ({ value: pm.value })),
    defects: defects.map((d) => ({ category: d.category, description: d.description })),
    final_assessment: inspection.final_assessment,
    report_thresholds: company
      ? {
          paint_threshold_gyari_max_micron: company.paint_threshold_gyari_max_micron,
          paint_threshold_ujrafujt_max_micron: company.paint_threshold_ujrafujt_max_micron,
          tire_age_warning_years: company.tire_age_warning_years,
          tire_tread_warning_mm: company.tire_tread_warning_mm,
        }
      : null,
    inspecting_company: company?.company_name ?? null,
  };
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ReportChatSuccessResponse | ReportChatErrorResponse>> {
  const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '');
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'A GEMINI_API_KEY érvénytelen vagy hiányzik.' }, { status: 500 });
  }

  let body: ReportChatRequestBody;
  try {
    body = (await request.json()) as ReportChatRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Érvénytelen JSON kérés törzs.' }, { status: 400 });
  }

  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token) {
    return NextResponse.json({ success: false, error: 'A "token" mező kötelező.' }, { status: 400 });
  }

  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json({ success: false, error: 'Az üzenet nem lehet üres.' }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { success: false, error: `Az üzenet túl hosszú (max ${MAX_MESSAGE_LENGTH} karakter).` },
      { status: 400 }
    );
  }

  const rawHistory = Array.isArray(body?.history) ? body.history : [];
  const history = rawHistory
    .filter(
      (item): item is ReportChatHistoryItem =>
        item != null &&
        (item.role === 'user' || item.role === 'model') &&
        typeof item.text === 'string' &&
        item.text.trim().length > 0
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => ({ role: item.role, text: item.text.trim().slice(0, MAX_MESSAGE_LENGTH) }));

  const supabase = await createClient();

  // 1) A riport lekérdezése -- lásd `app/report/[public_token]/page.tsx` UGYANEZT a
  // mintát: KIZÁRÓLAG a `get_public_report` RPC-n keresztül, soha nem közvetlen
  // tábla-lekérdezéssel.
  const { data: reportData, error: reportError } = await supabase.rpc('get_public_report', { p_token: token });

  if (reportError || !reportData) {
    return NextResponse.json({ success: false, error: 'A riport nem található.', code: 'NOT_FOUND' }, { status: 404 });
  }

  const report = reportData as PublicReportData & { ai_chat_enabled: boolean };

  // 2) Tier-gate -- lásd a fájl tetején lévő JSDoc-ot. A kliens SOSE dönthet erről
  // saját maga, ez a mező KIZÁRÓLAG a `get_public_report` RPC szerver-oldali
  // számításából származik.
  if (!report.ai_chat_enabled) {
    return NextResponse.json(
      { success: false, error: 'Ez a funkció ehhez a riporthoz nem érhető el.', code: 'CHAT_NOT_ENABLED' },
      { status: 403 }
    );
  }

  // 3) Visszaélés elleni napi üzenetlimit -- lásd a migráció "A) KVÓTA" kommentjét.
  // Ugyanez az RPC ÚJRA ellenőrzi a tier-gate-et is (védelmi rétegezés).
  const { data: usageAllowed, error: usageError } = await supabase.rpc('check_and_increment_report_chat_usage', {
    p_token: token,
    p_daily_limit: DAILY_MESSAGE_LIMIT,
  });

  if (usageError || usageAllowed !== true) {
    return NextResponse.json(
      { success: false, error: 'Jelenleg nem elérhető, próbáld később.', code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  let reportContextJson: string;
  try {
    reportContextJson = JSON.stringify(buildReportContext(report));
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'A riport adatai nem szerializálhatók.', details: toErrorDetails(error) },
      { status: 500 }
    );
  }

  if (reportContextJson.length > MAX_REPORT_JSON_LENGTH) {
    reportContextJson = reportContextJson.slice(0, MAX_REPORT_JSON_LENGTH);
  }

  const ai = new GoogleGenAI({ apiKey });

  const generationConfig = {
    systemInstruction: SYSTEM_INSTRUCTION_TEMPLATE(reportContextJson),
    temperature: 0.3,
  };

  const contents = [
    ...history.map((item) => ({ role: item.role, parts: [{ text: item.text }] })),
    { role: 'user' as const, parts: [{ text: message }] },
  ];

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
      { success: false, error: 'Jelenleg nem elérhető, próbáld később.', details: toErrorDetails(primaryError) },
      { status: 502 }
    );
  }

  const reply = rawText?.trim();
  if (!reply) {
    return NextResponse.json({ success: false, error: 'A Gemini API üres választ adott.' }, { status: 502 });
  }

  return NextResponse.json({ success: true, reply });
}
