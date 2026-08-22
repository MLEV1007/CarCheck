import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logPublicReportAiApiCall } from '@/lib/aiApiCallLog';
import type { PublicReportData } from '@/lib/reports/types';

/**
 * Publikus (bejelentkezés NÉLKÜLI) "Kérdezz az AI-tól" chat backend a
 * `/report/[public_token]` riporthoz, lásd `PLAN_ai_report_chat.md` (a jelen
 * route ennek a specifikációnak az implementációja).
 *
 * **Kizárólag Pro/Business csomagon elérhető**, a tier-gate KÉTSZERESEN ki van
 * kényszerítve szerver-oldalon: (1) a `get_public_report` RPC `ai_chat_enabled`
 * mezője (lásd `supabase/migrations/20260806180000_report_ai_chat.sql`), (2) a
 * `check_and_increment_report_chat_usage` RPC IS újra ellenőrzi a `plan_tier`-t,
 * mielőtt a napi számlálót növelné, egy manipulált kliens-hívás (pl. a UI
 * megkerülésével, közvetlen `fetch`-csel) SEM tudja bekapcsolni a chatet egy
 * Starter/Growth riporton, mert ez a route MINDIG a friss RPC-eredményre
 * támaszkodik, sosem a kliens által küldött adatra.
 *
 * **Adatkör:** a rendszerprompt KIZÁRÓLAG a `get_public_report` RPC által
 * visszaadott, ehhez az EGY riporthoz tartozó JSON-t látja, nincs közvetlen
 * tábla-lekérdezés, tehát a modell fizikailag nem fér hozzá más
 * szervezet/riport adatához.
 *
 * **Statelesség:** Next.js Route Handlerek (Vercel serverless) nem tartanak
 * szerver-oldali munkamenet-állapotot, minden hívás a kliens által
 * visszaküldött `history` tömbből építi újra a többfordulós beszélgetés
 * kontextusát (lásd `components/report/ReportAiChat.tsx`). A beszélgetés
 * TARTALMA sehol nem kerül DB-be mentésre (GDPR adatminimalizálás, lásd a
 * migráció fejléc-kommentjét).
 *
 * **Kvóta:** NEM a szervezet AI-kredit pooljából fogy (a felhasználó döntése:
 * "ezt tartalmazza az előfizetés díja"), kizárólag egy riport-tokenenkénti
 * napi üzenetlimit (`DAILY_MESSAGE_LIMIT`) védi visszaélés ellen, lásd a
 * migráció kommentjét. A limit elérésekor a válasz szándékosan generikus (nem
 * "elfogyott kereted" szövegű), mert ez nem egy a felhasználónak eladott/
 * számára ismert kvóta.
 *
 * **Modellválasztás + fallback-lánc (2026-08-16, frissítve):** ugyanaz a minta, mint a
 * projekt többi `/api/ai/*` route-jánál (lásd `generate-summary/route.ts` és
 * `parse-equipment/route.ts` JSDoc-ját a `gemini-2.0-flash` 2026-06-01-i kivezetéséről),
 * elsődleges `gemini-3.1-flash-lite`, fallback `gemini-3.6-flash`.
 *
 * **Prompt cache (2026-08-17, Levi kérésére):** a rendszerprompt (a TELJES riport-JSON-t
 * tartalmazza) korábban MINDEN egyes üzenetnél újra el lett küldve, pedig ugyanahhoz a
 * riport-tokenhez tartozó ÖSSZES beszélgetés (akár TÖBB látogatótól, több üzeneten át) ugyanazt
 * a rendszerpromptot használja. A `getOrCreateReportChatCache()` a Gemini explicit context
 * caching API-jával (`ai.caches.create`) riport-tokenenként EGYSZER hozza létre a cache-t
 * (1 órás TTL, lásd `report_chat_context_cache` tábla/migráció), utána `cachedContent`
 * hivatkozással újrahasználja, csak a beszélgetés-előzmény + az új üzenet megy ki
 * hívásonként, a (tipikusan a legtöbb token-t vivő) rendszerprompt nem.
 *
 * **FONTOS, NYITOTT KOCKÁZAT:** a Gemini explicit cache-elésnek történelmileg volt egy
 * modellenként eltérő MINIMÁLIS cache-elhető token-mérete, ha a riport-JSON+rendszerprompt
 * ez alatt van (egy tipikus riportnál ez simán előfordulhat), a `ai.caches.create()` hívás
 * hibázhat, VAGY a jelenlegi `gemini-3.1-flash-lite`/`gemini-3.6-flash` modelleknél ez a
 * korlát/API-alak MÁSKÉNT viselkedhet, mint a korábbi Gemini-generációknál, ezt
 * implementáció idején NEM lehetett megbízhatóan ellenőrizni (lásd `ai.google.dev/pricing`
 * és a caching dokumentáció friss állapotát). Emiatt a `getOrCreateReportChatCache()`
 * MINDEN hibát elnyel és `null`-lal tér vissza, ilyenkor a hívó a RÉGI, cache NÉLKÜLI,
 * teljes rendszerprompt-küldős útra esik vissza (lásd a `useCacheForThisAttempt` ágat lent),
 * tehát a chat funkció a cache-elés tényleges sikerétől FÜGGETLENÜL, változatlanul működik.
 * A `used_cache` mező (lásd `ai_api_calls` napló, `/admin` felület) mutatja meg utólag, hogy
 * a cache ténylegesen aktiválódott-e éles forgalomban.
 */
export const runtime = 'nodejs';

const MODEL_CANDIDATES = ['gemini-3.1-flash-lite', 'gemini-3.6-flash'] as const;

/** A cache-eléshez használt modell, egy Gemini `CachedContent` egy KONKRÉT modellhez van
 * kötve, ezért a cache-t KIZÁRÓLAG az ELSŐDLEGES (`MODEL_CANDIDATES[0]`) modellnél próbáljuk
 * felhasználni; ha emiatt (vagy bármi más miatt) a primér hívás elbukik, a fallback modellnél
 * (`MODEL_CANDIDATES[1]`) MINDIG a teljes rendszerpromptot küldjük, cache nélkül, egy cache-
 * referencia egy MÁSIK modellel érvénytelen hívást eredményezne. */
const CACHE_MODEL: (typeof MODEL_CANDIDATES)[number] = MODEL_CANDIDATES[0];

/** A Gemini-oldali cache TTL-je, elég hosszú ahhoz, hogy egy aktív beszélgetés/több
 * egymást követő látogató (ugyanarra a riportra) kihasználja, de nem túl hosszú ahhoz, hogy
 * egy riport-revalidálás (adatváltozás) sokáig "beragadjon", bár azt amúgy is a
 * `content_hash`-eltérés azonnal érvényteleníti, függetlenül a TTL-től. */
const CACHE_TTL_SECONDS = 3600;

/** Biztonsági ráhagyás a Gemini-oldali TTL lejárta előtt, sose próbáljunk egy éppen
 * lejáró/lejárt cache-referenciát felhasználni (a válasz emiatt hibázna). */
const CACHE_EXPIRY_SAFETY_MARGIN_MS = 5 * 60 * 1000;

function hashSystemInstruction(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Lekéri a riport-tokenhez tartozó, MÉG ÉRVÉNYES Gemini prompt-cache-t (ha a tartalom
 * időközben nem változott, lásd `content_hash`), vagy létrehoz egy újat, lásd a fájl
 * tetején lévő JSDoc "Prompt cache" szakaszát a teljes indoklásért/kockázatért. A
 * `report_chat_context_cache` tábla service-role (`createAdminClient()`) klienssel
 * érhető el, mert ez egy rendszer-szintű könyvelés, nincs bejelentkezett user-session
 * (publikus route), amivel a normál cookie-alapú kliens RLS-e működne.
 *
 * @returns a Gemini `CachedContent` erőforrás neve, vagy `null`, ha a cache-elés bármiért
 * (hiba, DB-elérés, vagy a Gemini API oldali korlát) nem sikerült, ilyenkor a hívó a
 * cache NÉLKÜLI, teljes rendszerprompt-küldős útra esik vissza.
 */
async function getOrCreateReportChatCache(
  ai: GoogleGenAI,
  token: string,
  systemInstruction: string
): Promise<string | null> {
  const contentHash = hashSystemInstruction(systemInstruction);

  try {
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from('report_chat_context_cache')
      .select('cache_name, model, content_hash, expires_at')
      .eq('public_token', token)
      .maybeSingle();

    if (
      existing &&
      existing.model === CACHE_MODEL &&
      existing.content_hash === contentHash &&
      new Date(existing.expires_at).getTime() - Date.now() > CACHE_EXPIRY_SAFETY_MARGIN_MS
    ) {
      return existing.cache_name;
    }

    const cache = await ai.caches.create({
      model: CACHE_MODEL,
      config: {
        systemInstruction,
        ttl: `${CACHE_TTL_SECONDS}s`,
      },
    });

    if (!cache.name) return null;

    const expiresAt = new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString();

    await admin.from('report_chat_context_cache').upsert(
      {
        public_token: token,
        cache_name: cache.name,
        model: CACHE_MODEL,
        content_hash: contentHash,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'public_token' }
    );

    return cache.name;
  } catch (error) {
    console.error(
      '[report-chat] Prompt cache létrehozás/lekérés sikertelen, gyorsítótár nélkül, a teljes ' +
        'rendszerprompttal folytatjuk (a chat funkció ettől függetlenül működik):',
      error
    );
    return null;
  }
}

/** Egyetlen üzenet maximális hossza, lásd PLAN_ai_report_chat.md 4.4 pont. */
const MAX_MESSAGE_LENGTH = 500;

/** A kliensről visszaküldött előzmény ennyi UTOLSÓ üzenetre van vágva, ennyi
 * bőven elég a beszélgetés koherenciájához, és korlátozza a promptba kerülő
 * adat méretét/a Gemini-hívás költségét. */
const MAX_HISTORY_MESSAGES = 16;

/** A beágyazott riport-JSON maximális hossza, ugyanaz az elv, mint a
 * `generate-summary/route.ts` `MAX_JSON_LENGTH`-je, csak jóval nagyobb korlát,
 * mert egy teljes riport (fotó-URL-ek nélkül) ennél jellemzően kisebb. */
const MAX_REPORT_JSON_LENGTH = 30000;

/** Riport-tokenenkénti napi üzenetlimit, lásd a migráció "A) KVÓTA" kommentjét.
 * Szándékosan bőkezű (a chat az előfizetés díjában benne van, nem egy
 * "elfogyasztható" mennyiség), csak a nyílt visszaélést hivatott megfogni. */
const DAILY_MESSAGE_LIMIT = 40;

const SYSTEM_INSTRUCTION_TEMPLATE = (reportJson: string) =>
  [
    'Te egy autóvizsgálati riport asszisztense vagy. KIZÁRÓLAG az alábbi JSON-ban szereplő, ehhez a KONKRÉT autóhoz tartozó vizsgálati adatokról válaszolhatsz, magyar nyelven.',
    'Ha a kérdés nem a riport adataihoz kapcsolódik (pl. általános autós tanács, más autó, más téma), udvariasan tereld vissza a beszélgetést a riport tartalmára.',
    'Javítási költségre vonatkozó kérdésnél KIZÁRÓLAG durva, tájékoztató jellegű nagyságrendet adj, MINDIG jelezd, hogy ez nem hivatalos árajánlat, és javasold a vizsgálatot végző szakértő vagy egy szerviz megkeresését pontos árért.',
    'Ne találj ki adatot, ami nincs a JSON-ban, ha a kérdésre nincs elég infó a riportban, mondd meg, hogy ez a riport nem tartalmazza ezt az adatot.',
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
 * A teljes `PublicReportData`-ból a Gemini promptba ágyazott alhalmaz, a
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

  // 1) A riport lekérdezése, lásd `app/report/[public_token]/page.tsx` UGYANEZT a
  // mintát: KIZÁRÓLAG a `get_public_report` RPC-n keresztül, soha nem közvetlen
  // tábla-lekérdezéssel.
  const { data: reportData, error: reportError } = await supabase.rpc('get_public_report', { p_token: token });

  if (reportError || !reportData) {
    return NextResponse.json({ success: false, error: 'A riport nem található.', code: 'NOT_FOUND' }, { status: 404 });
  }

  const report = reportData as PublicReportData & { ai_chat_enabled: boolean };

  // 2) Tier-gate, lásd a fájl tetején lévő JSDoc-ot. A kliens SOSE dönthet erről
  // saját maga, ez a mező KIZÁRÓLAG a `get_public_report` RPC szerver-oldali
  // számításából származik.
  if (!report.ai_chat_enabled) {
    return NextResponse.json(
      { success: false, error: 'Ez a funkció ehhez a riporthoz nem érhető el.', code: 'CHAT_NOT_ENABLED' },
      { status: 403 }
    );
  }

  // 3) Visszaélés elleni napi üzenetlimit, lásd a migráció "A) KVÓTA" kommentjét.
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

  const systemInstruction = SYSTEM_INSTRUCTION_TEMPLATE(reportContextJson);

  // Prompt cache, lásd a fájl tetején lévő JSDoc "Prompt cache" szakaszát. `null`, ha a
  // cache-elés bármiért nem sikerült, ez esetben MINDEN modell-próbálkozás a teljes
  // rendszerpromptot küldi (a `useCacheForThisAttempt` lent mindig `false` lesz), a chat
  // funkció ettől függetlenül, változatlanul működik.
  const cacheName = await getOrCreateReportChatCache(ai, token, systemInstruction);

  const contents = [
    ...history.map((item) => ({ role: item.role, parts: [{ text: item.text }] })),
    { role: 'user' as const, parts: [{ text: message }] },
  ];

  let rawText: string | undefined;
  let succeeded = false;
  let primaryError: unknown;
  // Melyik modell adta a ténylegesen felhasznált választ, ÉS élt-e cache-eléssel,
  // Platform Admin AI-hívás-napló célja (lásd `lib/aiApiCallLog.ts`).
  let usedModel: string | undefined;
  let usedCache = false;

  for (let i = 0; i < MODEL_CANDIDATES.length; i++) {
    const model = MODEL_CANDIDATES[i];
    // A cache-t KIZÁRÓLAG a `CACHE_MODEL`-lel (az elsődleges modellel) próbáljuk, egy
    // másik modellel a cache-referencia érvénytelen hívást eredményezne, lásd `CACHE_MODEL`
    // JSDoc-ját. Ha nincs cache (`cacheName === null`) VAGY ez épp a fallback modell
    // próbálkozása, a teljes rendszerpromptot küldjük, ugyanúgy, mint eddig.
    const useCacheForThisAttempt = Boolean(cacheName) && model === CACHE_MODEL;
    const config = useCacheForThisAttempt
      ? { cachedContent: cacheName as string, temperature: 0.3 }
      : { systemInstruction, temperature: 0.3 };

    try {
      const response = await ai.models.generateContent({ model, contents, config });
      rawText = response.text;
      succeeded = true;
      usedModel = model;
      usedCache = useCacheForThisAttempt;
      break;
    } catch (error) {
      console.error(`Gemini API Error details (model: ${model}):`, error);
      if (i === 0) primaryError = error;
    }
  }

  // Platform Admin AI-hívás-napló (2026-08-17), MINDEN ténylegesen megtörtént
  // Gemini-hívás-próbálkozást naplózunk, sikereset ÉS sikertelent is, lásd
  // `lib/aiApiCallLog.ts`. Best-effort, sosem dob hibát/nem akasztja meg a választ.
  await logPublicReportAiApiCall(token, usedModel ?? MODEL_CANDIDATES[0], succeeded, usedCache);

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
