import { createClient } from '@/lib/supabase/server';
import { getUserRoleContext } from '@/lib/auth/roles';
import type { PlanTier, UsageLog, UserCredit } from '@/types/credits';

/**
 * Kredit kezelő szerveroldali segédmodul.
 *
 * Minden függvény a `@/lib/supabase/server` request-hatókörű, cookie-alapú
 * kliensét használja, NEM service role kulcsot, így minden művelet a
 * hívó, bejelentkezett felhasználó saját RLS-jogosultságával fut. Ez
 * garantálja a projekt szigorú multi-tenant izolációs szabályát (lásd
 * PROJEKT_INSTRUKCIOK.md 3. pont): egy szervezet tagja soha nem tudja egy
 * MÁSIK szervezet kredit-egyenlegét olvasni vagy módosítani, mert az
 * `user_credits`/`usage_logs` táblák `_org` RLS policy-jai (lásd
 * `supabase/migrations/20260803_organizations_rbac.sql`) mindig a hívó SAJÁT
 * `organization_id`-jára szűkítenek.
 *
 * **KÖZÖS CÉGES KREDITKERET (2026-08-03, "Szervezeti szerepkezelés" lépés):** a
 * `user_credits` tábla mostantól SZERVEZET-szintű (1 sor / szervezet, NEM 1 sor /
 * felhasználó), amikor egy Átvizsgáló (`role === 'inspector'`) hajt végre egy
 * kreditet fogyasztó AI-műveletet, a levonás UGYANABBÓL a közös kartból történik,
 * mint amikor a szervezet Menedzsere hívja ugyanazt a funkciót. A hívó függvények
 * (`hasEnoughCredits`/`deductCredits`) TOVÁBBRA IS a hívó user `userId`-jét kapják
 * paraméterként (az `/api/ai/*` route-ok NEM változtak), a szervezet-feloldás
 * (`getUserRoleContext`) ITT, belül történik.
 *
 * A tényleges levonás (`deductCredits`) a DB-oldali `deduct_credits` SQL
 * függvényen (RPC) keresztül fut, ez sor-zárolással (`for update`) végzi a
 * havi/vásárolt kredit közötti elsőbbségi levonást, hogy két párhuzamos kérés
 * (akár a Menedzser ÉS egy Átvizsgáló egyszerre) ne tudja kétszer elkölteni
 * ugyanazt a kreditet.
 */

/**
 * Strukturált hiba, amit `deductCredits` dob, ha a szervezetnek nincs elég
 * szabad (havi + vásárolt) kreditje a kért művelethez.
 */
export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS' as const;
  readonly organizationId: string;
  readonly required: number;
  readonly available: number;

  constructor(organizationId: string, required: number, available: number) {
    super(
      `A szervezetnek nincs elég kreditje a művelethez (szükséges: ${required}, elérhető: ${available}).`
    );
    this.name = 'InsufficientCreditsError';
    this.organizationId = organizationId;
    this.required = required;
    this.available = available;
  }
}

interface UserCreditRow {
  id: string;
  organization_id: string;
  monthly_credits_remaining: number;
  purchased_credits_remaining: number;
  credits_reset_at: string | null;
}

const USER_CREDIT_COLUMNS =
  'id, organization_id, monthly_credits_remaining, purchased_credits_remaining, credits_reset_at';

function toUserCredit(row: UserCreditRow): UserCredit {
  return {
    id: row.id,
    organizationId: row.organization_id,
    monthlyCreditsRemaining: row.monthly_credits_remaining,
    purchasedCreditsRemaining: row.purchased_credits_remaining,
    creditsResetAt: row.credits_reset_at,
    totalCreditsAvailable: row.monthly_credits_remaining + row.purchased_credits_remaining,
  };
}

/** Feloldja a hívó user `organization_id`-ját, minden lenti függvény ezen keresztül
 * jut el a KÖZÖS kredit-sorhoz. Hibát dob, ha a profil/szervezet valamiért hiányzik
 * (nem várt, defenzíven kezelt eset, a `handle_new_user()` trigger minden regisztrált
 * usernek garantáltan létrehoz egy szervezetet). */
async function resolveOrganizationId(userId: string): Promise<string> {
  const context = await getUserRoleContext(userId);
  if (!context) {
    throw new Error('Nem sikerült feloldani a felhasználó szervezetét.');
  }
  return context.organizationId;
}

/**
 * Visszaadja a SZERVEZET (a hívó user `organization_id`-ja szerinti közös kredit-sor)
 * aktuális kredit-egyenlegét (havi + vásárolt külön, illetve az összesített
 * `totalCreditsAvailable`). Ha a szervezethez még nem létezik `user_credits` rekord
 * (pl. az első AI-funkció-hívás a szervezetben), létrehozza az alapértelmezett, 0
 * kredites sort, majd azt adja vissza.
 */
export async function getUserCreditBalance(userId: string): Promise<UserCredit> {
  const organizationId = await resolveOrganizationId(userId);
  return getOrganizationCreditBalance(organizationId);
}

async function getOrganizationCreditBalance(organizationId: string): Promise<UserCredit> {
  const supabase = await createClient();

  const { data: existing, error: selectError } = await supabase
    .from('user_credits')
    .select(USER_CREDIT_COLUMNS)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Nem sikerült lekérni a kredit-egyenleget: ${selectError.message}`);
  }

  if (existing) {
    return toUserCredit(existing);
  }

  // Még nincs rekord ehhez a szervezethez, alapértelmezett (0 havi / 0 vásárolt) sor
  // létrehozása.
  const { data: created, error: insertError } = await supabase
    .from('user_credits')
    .insert({ organization_id: organizationId })
    .select(USER_CREDIT_COLUMNS)
    .single();

  if (!insertError && created) {
    return toUserCredit(created);
  }

  // Ha az insert egy párhuzamos, időközben lefutott létrehozás miatt bukott el
  // (unique `organization_id` ütközés, pl. a Menedzser és egy Átvizsgáló egyszerre
  // hívott egy-egy AI-funkciót), olvassuk vissza a közben létrejött sort, mielőtt
  // ténylegesen hibát dobnánk.
  const { data: retried, error: retryError } = await supabase
    .from('user_credits')
    .select(USER_CREDIT_COLUMNS)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (retried) {
    return toUserCredit(retried);
  }

  throw new Error(
    `Nem sikerült létrehozni a kredit-egyenleget: ${insertError?.message ?? retryError?.message ?? 'ismeretlen hiba'}`
  );
}

/**
 * Igaz, ha a hívó user SZERVEZETÉNEK legalább `cost` darab szabad (havi + vásárolt
 * összesen) kreditje van, egy Átvizsgáló és a szervezete Menedzsere ugyanazt az
 * eredményt kapja, mert ugyanabból a közös sorból olvasnak.
 *
 * **Szigorúan "fail-closed" (2026-08-03, kredit-szivárgás audit után hozzáadva):**
 * ez a függvény SOHA nem dobhat kivételt a hívó (`/api/ai/*` route) felé, ha az
 * egyenleg lekérése BÁRMILYEN okból hibázik (DB-hiba, hálózati hiba, RLS-probléma,
 * hiányzó rekord létrehozásának sikertelensége, hiányzó szervezet stb.), `false`-t
 * adunk vissza, NEM dobjuk tovább a kivételt. Ennek oka: a hívó route-ok
 * (`app/api/ai/.../route.ts`) NINCSENEK try/catch-csel körbevéve ennél a hívásnál (a
 * `hasEnoughCredits(...)` UTÁNI kód, a Gemini-hívás, explicit `if (!hasCredits)
 * return 402` mögött van), így egy itt eldobott kivétel technikailag "csak" egy
 * 500-as hibát okozott volna (nem egy tényleges jogosulatlan AI-hívást), DE ez a
 * védelmi vonal explicit "fail-closed" garanciát ad: BÁRMILYEN bizonytalan/hibás
 * állapotban a válasz `false` (nincs elég kredit), SOSE `true`.
 */
export async function hasEnoughCredits(userId: string, cost: number = 1): Promise<boolean> {
  try {
    const balance = await getUserCreditBalance(userId);
    const total = balance.totalCreditsAvailable;

    if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) {
      return false;
    }

    return total >= cost;
  } catch (error) {
    console.error(
      '[hasEnoughCredits] Hiba az egyenleg lekérése közben, fail-closed, false-t adunk vissza (a hívó AI route NEM fut le):',
      error
    );
    return false;
  }
}

/**
 * Levonja a megadott `cost` mennyiségű kreditet a hívó user SZERVEZETÉNEK közös
 * keretéből, elsőbbséggel a lejáró `monthly_credits_remaining`-ből, majd (ha az
 * elfogyott) a `purchased_credits_remaining`-ből, és egy auditálható bejegyzést
 * hoz létre a `usage_logs` táblában (`user_id` = a TÉNYLEGESEN hívó user, Menedzser
 * vagy Átvizsgáló, `organization_id` = a közös szervezet). A tényleges levonás a
 * DB-oldali `deduct_credits` RPC-n keresztül, atomikusan (sor-zárolással) történik.
 *
 * @throws {InsufficientCreditsError} ha a szervezetnek nincs elég kreditje.
 */
export async function deductCredits(
  userId: string,
  featureName: string,
  cost: number = 1
): Promise<UserCredit> {
  if (!Number.isInteger(cost) || cost <= 0) {
    throw new Error('A levonandó kredit mennyiségének pozitív egész számnak kell lennie.');
  }

  const organizationId = await resolveOrganizationId(userId);
  const supabase = await createClient();

  // A `deduct_credits` RPC csak meglévő `user_credits` sort tud módosítani, új sort
  // nem hoz létre, ez a hívás biztosítja, hogy a szervezet sora létezzen (a
  // szervezet ELSŐ AI-funkció-hívásánál is, akár a Menedzser, akár egy Átvizsgáló
  // hívja elsőként), mielőtt az RPC lefutna.
  await getOrganizationCreditBalance(organizationId);

  const { data, error } = await supabase
    .rpc('deduct_credits', {
      p_organization_id: organizationId,
      p_actor_user_id: userId,
      p_feature_name: featureName,
      p_cost: cost,
    })
    .maybeSingle();

  if (error) {
    if (error.message.includes('INSUFFICIENT_CREDITS')) {
      const freshBalance = await getOrganizationCreditBalance(organizationId);
      throw new InsufficientCreditsError(organizationId, cost, freshBalance.totalCreditsAvailable);
    }
    throw new Error(`Nem sikerült levonni a kreditet: ${error.message}`);
  }

  if (!data) {
    throw new Error('Nem sikerült levonni a kreditet: az adatbázis nem adott vissza egyenleget.');
  }

  // Az RPC csak a friss havi/vásárolt egyenleget adja vissza, a teljes
  // (id/creditsResetAt-tel kiegészített) objektumot egy friss olvasással
  // állítjuk össze, hogy a visszaadott `UserCredit` mindig konzisztens legyen.
  return getOrganizationCreditBalance(organizationId);
}

/**
 * Visszaadja a felhasználó `profiles.plan_tier` értékét (Kredit Dashboard UI, "Csomag
 * Státusz" blokk), ha valamiért hiányzik/érvénytelen (nem várt, de defenzíven kezelt
 * eset), `'free'`-re esik vissza, sose adjon vissza a `PlanTier` unión kívüli értéket.
 *
 * **Megjegyzés:** a `plan_tier`/Stripe-azonosítók (`stripe_customer_id`/
 * `stripe_subscription_id`) TOVÁBBRA IS a `profiles` (egyéni felhasználó) során élnek,
 * NEM a szervezeten, a "Szervezeti szerepkezelés" lépés kizárólag a KREDITEKET tette
 * szervezet-szintűvé. A csomag-szint szervezetre költöztetése (hogy egy Átvizsgáló ne
 * a saját, hanem a Menedzsere csomagját lássa) egy KÖVETKEZŐ, a Stripe-integrációval
 * együtt elvégzendő finomítás, lásd status.md "Következő lépés".
 */
export async function getUserPlanTier(userId: string): Promise<PlanTier> {
  const supabase = await createClient();

  const { data, error } = await supabase.from('profiles').select('plan_tier').eq('id', userId).maybeSingle();

  if (error) {
    throw new Error(`Nem sikerült lekérni a csomag-szintet: ${error.message}`);
  }

  const VALID_TIERS: PlanTier[] = ['free', 'starter', 'pro', 'enterprise'];
  const rawTier = data?.plan_tier;
  return rawTier && (VALID_TIERS as string[]).includes(rawTier) ? (rawTier as PlanTier) : 'free';
}

/**
 * Visszaadja a hívó user SZERVEZETÉNEK legutóbbi `usage_logs` bejegyzéseit,
 * legfrissebb elöl (Kredit Dashboard UI, "AI Használati Előzmények" tábla),
 * alapértelmezetten a legutóbbi 8 bejegyzést. A közös kreditkerethez igazodva ez
 * mostantól a TELJES CSAPAT (Menedzser + minden Átvizsgáló) AI-használatát mutatja,
 * nem csak a hívóét, ez a Kredit Dashboard modal jelenleg kizárólag Menedzsernek
 * látható (lásd `HeaderCreditBadge`/`InsufficientCreditsModal` szerepkör-alapú
 * elrejtését), tehát ez pontosan a "lásd a teljes csapat AI-fogyasztását" igényt
 * szolgálja ki.
 */
export async function getRecentUsageLogs(userId: string, limit: number = 8): Promise<UsageLog[]> {
  const organizationId = await resolveOrganizationId(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('usage_logs')
    .select('id, user_id, feature_name, credits_deducted, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Nem sikerült lekérni a használati előzményeket: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    featureName: row.feature_name,
    creditsDeducted: row.credits_deducted,
    createdAt: row.created_at,
  }));
}
