import { createClient } from '@/lib/supabase/server';
import { getUserRoleContext } from '@/lib/auth/roles';
import type { QuotaBalance, QuotaPlanTier } from '@/types/quotas';

/**
 * Vizsgálati- és AI-keret (kvóta) kezelő szerveroldali segédmodul (PROJEKT_INSTRUKCIOK.md
 * "Kredit/keret adatbázis migráció" + "Keret-ellenőrző és fogyasztó logika" lépések,
 * 2026-08-04).
 *
 * UGYANAZ az architekturális minta, mint `lib/credits.ts`-nél: a `@/lib/supabase/server`
 * request-hatókörű, cookie-alapú (NEM service role) klienst használja, tehát minden
 * művelet a hívó, bejelentkezett felhasználó saját RLS-jogosultságával fut, a `user_credits`
 * tábla `_org` RLS policy-jai (lásd `20260803_organizations_rbac.sql`) mindig a hívó SAJÁT
 * `organization_id`-jára szűkítenek, multi-tenant izoláció garantálva.
 *
 * A `plan_tier`/kvóta-oszlopok UGYANAZON a `user_credits` táblán élnek, mint a régi, egyedi
 * AI-kredit rendszer (`monthly_credits_remaining`/`purchased_credits_remaining`, lásd
 * `lib/credits.ts`), a két rendszer jelenleg TUDATOSAN PÁRHUZAMOSAN fut (lásd
 * `supabase/migrations/20260804_inspection_quotas.sql` bevezető kommentjét): a régi
 * kredit-rendszer az EGYEDI AI-hívásokat számolja generikusan, az ÚJ kvóta-rendszer a
 * Stripe csomaghoz (Starter/Pro) kötött KÉT KÜLÖN keretet (vizsgálat-indítás + AI-hívás)
 * vezeti, plan-alapú havi limittel.
 *
 * **Két KÜLÖNBÖZŐ hiba-stratégia, szándékosan:**
 * - `checkInspectionQuota`/`consumeInspectionQuota`, SZIGORÚ, DOB hibát, ha nincs keret,
 *   mert egy új vizsgálat indítása egy egyértelmű, blokkoló üzleti szabály (PROJEKT_INSTRUKCIOK.md:
 *   "Ha nincs, dobjon hibát").
 * - `checkAiQuota`, LÁGY, `boolean`-t ad vissza, SOSE dob, mert az AI-funkció (hangdiktálás/
 *   forgalmi szkenner) kifogyása NEM szabad, hogy blokkolja a vizsgálat gépeléssel/kattintással
 *   történő elvégzését, csak magát az AI-gyorsítást (PROJEKT_INSTRUKCIOK.md: "az átvizsgálás
 *   gépeléssel/kattintással továbbra is elvégezhető maradjon").
 */

export class InsufficientInspectionQuotaError extends Error {
  readonly code = 'INSUFFICIENT_INSPECTION_QUOTA' as const;
  readonly organizationId: string;
  readonly available: number;

  constructor(organizationId: string, available: number) {
    super(
      `A szervezetnek nincs elérhető vizsgálati kerete (elérhető: ${available}). Vásárolj Top-up ` +
        'csomagot vagy válts magasabb előfizetésre a Beállítások > Előfizetés oldalon.'
    );
    this.name = 'InsufficientInspectionQuotaError';
    this.organizationId = organizationId;
    this.available = available;
  }
}

interface QuotaRow {
  organization_id: string;
  plan_tier: string;
  monthly_inspections_limit: number;
  monthly_inspections_remaining: number;
  purchased_inspections_remaining: number;
  monthly_ai_limit: number;
  monthly_ai_remaining: number;
  purchased_ai_remaining: number;
  /** 2026-08-17, "Előfizetés lemondása" lépés, lásd `types/quotas.ts`
   * `QuotaBalance.hasActiveStripeSubscription`/`cancelAtPeriodEnd`/
   * `subscriptionCurrentPeriodEnd` JSDoc-ját. */
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean;
  subscription_current_period_end: string | null;
}

const QUOTA_COLUMNS =
  'organization_id, plan_tier, monthly_inspections_limit, monthly_inspections_remaining, purchased_inspections_remaining, monthly_ai_limit, monthly_ai_remaining, purchased_ai_remaining, stripe_subscription_id, cancel_at_period_end, subscription_current_period_end';

/** A DB `plan_tier` szöveges oszlopát a `QuotaPlanTier` unióra képezi le, 2026-08-06,
 * "Árazási struktúra bővítés" lépés óta EXHAUSZTÍV (a korábbi bináris `=== 'pro' ? 'pro'
 * : 'starter'` ternary minden ismeretlen/jövőbeli értéket csendben `'starter'`-re
 * fordított volna, ami a `growth`/`business` bevezetésével MÁR TÉNYLEGESEN hibás lett
 * volna). Igazán ismeretlen (jövőbeli, itt még nem kezelt) DB-érték esetén, ami csak a
 * DB CHECK constraint (`user_credits_plan_tier_check`) és ez a leképezés szétcsúszása
 * esetén fordulhatna elő, defenzíven `'free'`-re esik vissza (2026-08-07 óta, korábban
 * `'starter'`-re esett vissza, ez tévesen egy fizetős csomag megjelenítését okozta
 * volna egy ismeretlen/hibás DB-értékre, holott a biztonságos, "nem járhat neki több,
 * mint amennyit fizetett" alapállás a `free`). */
function toPlanTier(rawPlanTier: string): QuotaPlanTier {
  switch (rawPlanTier) {
    case 'free':
    case 'starter':
    case 'growth':
    case 'pro':
    case 'business':
      return rawPlanTier;
    default:
      return 'free';
  }
}

function toQuotaBalance(row: QuotaRow): QuotaBalance {
  return {
    organizationId: row.organization_id,
    planTier: toPlanTier(row.plan_tier),
    monthlyInspectionsLimit: row.monthly_inspections_limit,
    monthlyInspectionsRemaining: row.monthly_inspections_remaining,
    purchasedInspectionsRemaining: row.purchased_inspections_remaining,
    totalInspectionsAvailable: row.monthly_inspections_remaining + row.purchased_inspections_remaining,
    monthlyAiLimit: row.monthly_ai_limit,
    monthlyAiRemaining: row.monthly_ai_remaining,
    purchasedAiRemaining: row.purchased_ai_remaining,
    totalAiAvailable: row.monthly_ai_remaining + row.purchased_ai_remaining,
    hasActiveStripeSubscription: Boolean(row.stripe_subscription_id),
    cancelAtPeriodEnd: row.cancel_at_period_end,
    subscriptionCurrentPeriodEnd: row.subscription_current_period_end,
  };
}

/** Feloldja a hívó user `organization_id`-ját, lásd `lib/credits.ts` `resolveOrganizationId`
 * dokumentációját, ugyanaz a minta. */
async function resolveOrganizationId(userId: string): Promise<string> {
  const context = await getUserRoleContext(userId);
  if (!context) {
    throw new Error('Nem sikerült feloldani a felhasználó szervezetét.');
  }
  return context.organizationId;
}

/**
 * Visszaadja a SZERVEZET aktuális kvóta-egyenlegét (`user_credits` sor, plan_tier +
 * vizsgálati/AI kvóta oszlopok). Ha a szervezethez még nem létezik `user_credits` rekord
 * (pl. a szervezet eddig sem AI-funkciót, sem vizsgálatot nem indított), létrehozza az
 * alapértelmezett (2026-08-07 óta: `free`, 5 vizsgálat / 3 AI-hívás, lásd
 * `supabase/migrations/20260807_free_tier_default_quota.sql`) sort, ugyanazzal a
 * lazy-create + race-condition-visszaolvasás mintával, mint a `lib/credits.ts`
 * `getOrganizationCreditBalance`-je.
 */
export async function getQuotaBalance(userId: string): Promise<QuotaBalance> {
  const organizationId = await resolveOrganizationId(userId);
  return getOrganizationQuotaBalance(organizationId);
}

/**
 * EXPORTÁLVA (2026-08-07, "Vercel-en is lassú" hibaelhárítás), a `/api/quotas/summary`
 * route korábban `Promise.all([getQuotaBalance(user.id), getUserRoleContext(user.id)])`-t
 * hívott: ez ÚGY TŰNT párhuzamos, de a `getQuotaBalance` MAGA is meghívja belül a
 * `resolveOrganizationId`-n keresztül a `getUserRoleContext`-et, vagyis a `profiles`
 * tábla EGYETLEN kéréshez KÉTSZER lett lekérdezve (egyszer feleslegesen), és emellett a
 * `getQuotaBalance` belső lánca (role-lookup -> quota-lookup) is szekvenciális 2 DB-kör-út,
 * NEM párhuzamosítható a másikkal. Élő Vercel-adatban (`car-check` projekt, Region IAD1,
 * a Supabase projekt `eu-central-1`-ben) ez a route P75 4,55 másodpercet mutatott, a
 * transzatlanti kör-utak (auth + 2x profiles + user_credits, részben feleslegesen
 * duplikálva) összeadódtak. Ha a hívó MÁR ismeri az `organizationId`-t (mert ő maga
 * hívta a `getUserRoleContext`-et), ezt a függvényt KÖZVETLENÜL hívva a felesleges
 * második `profiles`-lekérdezés elkerülhető, lásd `app/api/quotas/summary/route.ts`.
 */
export async function getOrganizationQuotaBalance(organizationId: string): Promise<QuotaBalance> {
  const supabase = await createClient();

  const { data: existing, error: selectError } = await supabase
    .from('user_credits')
    .select(QUOTA_COLUMNS)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Nem sikerült lekérni a kvóta-egyenleget: ${selectError.message}`);
  }

  if (existing) {
    return toQuotaBalance(existing);
  }

  const { data: created, error: insertError } = await supabase
    .from('user_credits')
    .insert({ organization_id: organizationId })
    .select(QUOTA_COLUMNS)
    .single();

  if (!insertError && created) {
    return toQuotaBalance(created);
  }

  // Párhuzamos létrehozás/unique-ütközés esetén visszaolvassuk a közben létrejött sort,
  // lásd `lib/credits.ts` `getOrganizationCreditBalance` ugyanezen mintájának indoklását.
  const { data: retried, error: retryError } = await supabase
    .from('user_credits')
    .select(QUOTA_COLUMNS)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (retried) {
    return toQuotaBalance(retried);
  }

  throw new Error(
    `Nem sikerült létrehozni a kvóta-egyenleget: ${insertError?.message ?? retryError?.message ?? 'ismeretlen hiba'}`
  );
}

/**
 * SZIGORÚ vizsgálati-keret ellenőrzés, új autó vizsgálat indításakor hívandó (lásd
 * `app/inspections/new/page.tsx`). Dob egy `InsufficientInspectionQuotaError`-t, ha a
 * szervezetnek nincs elérhető vizsgálati kerete (havi + vásárolt összesen <= 0), a hívó
 * ezt elkapva blokkolhatja az új vizsgálat indítását.
 */
export async function checkInspectionQuota(userId: string): Promise<QuotaBalance> {
  const balance = await getQuotaBalance(userId);

  if (balance.totalInspectionsAvailable <= 0) {
    throw new InsufficientInspectionQuotaError(balance.organizationId, balance.totalInspectionsAvailable);
  }

  return balance;
}

/**
 * Levonja 1 vizsgálati keretet a hívó user SZERVEZETÉNEK közös kvóta-sorából, elsőbbséggel
 * a lejáró `monthly_inspections_remaining`-ből, majd (ha az elfogyott) a `purchased_
 * inspections_remaining`-ből. A tényleges levonás a DB-oldali `consume_inspection_quota`
 * RPC-n keresztül, atomikusan (sor-zárolással) fut, lásd
 * `supabase/migrations/20260804_inspection_quotas.sql`.
 *
 * @throws {InsufficientInspectionQuotaError} ha a szervezetnek időközben elfogyott a kerete
 * (pl. egy párhuzamos kérés, a `checkInspectionQuota`-nál és emitt is ellenőrizve van).
 */
export async function consumeInspectionQuota(userId: string): Promise<QuotaBalance> {
  const organizationId = await resolveOrganizationId(userId);
  const supabase = await createClient();

  // Biztosítja, hogy a szervezet sora létezzen, mielőtt az RPC lefutna (az RPC csak
  // MEGLÉVŐ sort tud módosítani, újat nem hoz létre), lásd `deductCredits` (lib/credits.ts)
  // ugyanezen mintáját.
  await getOrganizationQuotaBalance(organizationId);

  const { error } = await supabase
    .rpc('consume_inspection_quota', { p_organization_id: organizationId })
    .maybeSingle();

  if (error) {
    if (error.message.includes('INSUFFICIENT_INSPECTION_QUOTA')) {
      const freshBalance = await getOrganizationQuotaBalance(organizationId);
      throw new InsufficientInspectionQuotaError(organizationId, freshBalance.totalInspectionsAvailable);
    }
    throw new Error(`Nem sikerült levonni a vizsgálati keretet: ${error.message}`);
  }

  return getOrganizationQuotaBalance(organizationId);
}

/**
 * LÁGY AI-keret ellenőrzés, AI-funkció (hangdiktálás/forgalmi szkenner) hívása ELŐTT
 * hívandó. Igaz, ha a szervezetnek van szabad AI kerete, havi ÉS vásárolt együtt (lásd
 * `QuotaBalance.totalAiAvailable`, 2026-08-06). **Szigorúan "fail-closed",
 * UGYANAZ a minta, mint `hasEnoughCredits` (lib/credits.ts):** BÁRMILYEN hiba esetén (DB/
 * hálózat/RLS/hiányzó szervezet) `false`-t ad vissza, SOSE dob kivételt, a hívó AI route
 * ezt egy egyszerű `if (!hasAiQuota) { ...ne hívja a Gemini API-t... }` ággal használja, DE
 * (a `checkInspectionQuota`-val ellentétben) ez a kifogyás NEM szabad, hogy blokkolja a
 * vizsgálat gépeléssel/kattintással történő elvégzését, lásd a fájl tetején lévő JSDoc-ot.
 */
export async function checkAiQuota(userId: string): Promise<boolean> {
  try {
    const balance = await getQuotaBalance(userId);
    // 2026-08-06, "Árazási struktúra bővítés" lépés óta a TELJES (havi + vásárolt)
    // AI-kredit keretet nézzük, nem csak a havit, korábban a vásárolt AI-kredit
    // csomagok (lásd `purchasedAiRemaining`) sosem tudták volna feloldani ezt a kaput,
    // pedig pont ez a rendeltetésük (a havi keret elfogyása UTÁNI vásárolható kiegészítés).
    return balance.totalAiAvailable > 0;
  } catch (error) {
    console.error(
      '[checkAiQuota] Hiba az AI-keret lekérése közben, fail-closed, false-t adunk vissza:',
      error
    );
    return false;
  }
}

/**
 * Levonja 1 AI-hívást a hívó user SZERVEZETÉNEK havi AI keretéből, a tényleges levonás a
 * `consume_ai_quota` RPC-n keresztül, atomikusan fut. Ha a levonás hibázna (pl. egy
 * párhuzamos kérés időközben elfogyasztotta az utolsó AI-hívást), a hibát a hívó logolja,
 * ugyanaz az elv, mint `deductCredits`-nél: a válasz, amit a felhasználó a MÁR lefutott,
 * ténylegesen kifizetett AI-hívásért cserébe kapott, ne vesszen el emiatt.
 */
export async function consumeAiQuota(userId: string): Promise<QuotaBalance> {
  const organizationId = await resolveOrganizationId(userId);
  const supabase = await createClient();

  await getOrganizationQuotaBalance(organizationId);

  const { error } = await supabase.rpc('consume_ai_quota', { p_organization_id: organizationId }).maybeSingle();

  if (error) {
    throw new Error(`Nem sikerült levonni az AI keretet: ${error.message}`);
  }

  return getOrganizationQuotaBalance(organizationId);
}
