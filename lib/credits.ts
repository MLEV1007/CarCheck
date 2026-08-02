import { createClient } from '@/lib/supabase/server';
import type { UserCredit } from '@/types/credits';

/**
 * Kredit kezelő szerveroldali segédmodul.
 *
 * Minden függvény a `@/lib/supabase/server` request-hatókörű, cookie-alapú
 * kliensét használja -- NEM service role kulcsot -- így minden művelet a
 * hívó, bejelentkezett felhasználó saját RLS-jogosultságával fut. Ez
 * garantálja a projekt szigorú multi-tenant izolációs szabályát (lásd
 * PROJEKT_INSTRUKCIOK.md 3. pont): egy felhasználó soha nem tudja egy másik
 * felhasználó kredit-egyenlegét olvasni vagy módosítani, mert az
 * `user_credits`/`usage_logs` táblák `_own` RLS policy-jai ezt eleve
 * megakadályozzák (lásd `supabase/migrations/20260802_credits_schema.sql`).
 *
 * A tényleges levonás (`deductCredits`) a DB-oldali `deduct_credits` SQL
 * függvényen (RPC) keresztül fut -- ez sor-zárolással (`for update`) végzi a
 * havi/vásárolt kredit közötti elsőbbségi levonást, hogy két párhuzamos kérés
 * ne tudja kétszer elkölteni ugyanazt a kreditet.
 */

/**
 * Strukturált hiba, amit `deductCredits` dob, ha a felhasználónak nincs elég
 * szabad (havi + vásárolt) kreditje a kért művelethez.
 */
export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS' as const;
  readonly userId: string;
  readonly required: number;
  readonly available: number;

  constructor(userId: string, required: number, available: number) {
    super(
      `A felhasználónak nincs elég kreditje a művelethez (szükséges: ${required}, elérhető: ${available}).`
    );
    this.name = 'InsufficientCreditsError';
    this.userId = userId;
    this.required = required;
    this.available = available;
  }
}

interface UserCreditRow {
  id: string;
  user_id: string;
  monthly_credits_remaining: number;
  purchased_credits_remaining: number;
  credits_reset_at: string | null;
}

const USER_CREDIT_COLUMNS =
  'id, user_id, monthly_credits_remaining, purchased_credits_remaining, credits_reset_at';

function toUserCredit(row: UserCreditRow): UserCredit {
  return {
    id: row.id,
    userId: row.user_id,
    monthlyCreditsRemaining: row.monthly_credits_remaining,
    purchasedCreditsRemaining: row.purchased_credits_remaining,
    creditsResetAt: row.credits_reset_at,
    totalCreditsAvailable: row.monthly_credits_remaining + row.purchased_credits_remaining,
  };
}

/**
 * Visszaadja a felhasználó aktuális kredit-egyenlegét (havi + vásárolt külön,
 * illetve az összesített `totalCreditsAvailable`). Ha a felhasználóhoz még
 * nem létezik `user_credits` rekord (pl. első AI-funkció-hívás), létrehozza
 * az alapértelmezett, 0 kredites sort, majd azt adja vissza.
 */
export async function getUserCreditBalance(userId: string): Promise<UserCredit> {
  const supabase = await createClient();

  const { data: existing, error: selectError } = await supabase
    .from('user_credits')
    .select(USER_CREDIT_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Nem sikerült lekérni a kredit-egyenleget: ${selectError.message}`);
  }

  if (existing) {
    return toUserCredit(existing);
  }

  // Még nincs rekord -- alapértelmezett (0 havi / 0 vásárolt) sor létrehozása.
  const { data: created, error: insertError } = await supabase
    .from('user_credits')
    .insert({ user_id: userId })
    .select(USER_CREDIT_COLUMNS)
    .single();

  if (!insertError && created) {
    return toUserCredit(created);
  }

  // Ha az insert egy párhuzamos, időközben lefutott létrehozás miatt bukott el
  // (unique `user_id` ütközés), olvassuk vissza a közben létrejött sort,
  // mielőtt ténylegesen hibát dobnánk.
  const { data: retried, error: retryError } = await supabase
    .from('user_credits')
    .select(USER_CREDIT_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (retried) {
    return toUserCredit(retried);
  }

  throw new Error(
    `Nem sikerült létrehozni a kredit-egyenleget: ${insertError?.message ?? retryError?.message ?? 'ismeretlen hiba'}`
  );
}

/**
 * Igaz, ha a felhasználónak legalább `cost` darab szabad (havi + vásárolt
 * összesen) kreditje van.
 */
export async function hasEnoughCredits(userId: string, cost: number = 1): Promise<boolean> {
  const balance = await getUserCreditBalance(userId);
  return balance.totalCreditsAvailable >= cost;
}

/**
 * Levonja a megadott `cost` mennyiségű kreditet a felhasználótól -- elsőbbséggel
 * a lejáró `monthly_credits_remaining`-ből, majd (ha az elfogyott) a
 * `purchased_credits_remaining`-ből --, és egy auditálható bejegyzést hoz létre
 * a `usage_logs` táblában. A tényleges levonás a DB-oldali `deduct_credits` RPC-n
 * keresztül, atomikusan (sor-zárolással) történik.
 *
 * @throws {InsufficientCreditsError} ha a felhasználónak nincs elég kreditje.
 */
export async function deductCredits(
  userId: string,
  featureName: string,
  cost: number = 1
): Promise<UserCredit> {
  if (!Number.isInteger(cost) || cost <= 0) {
    throw new Error('A levonandó kredit mennyiségének pozitív egész számnak kell lennie.');
  }

  const supabase = await createClient();

  // A `deduct_credits` RPC csak meglévő `user_credits` sort tud módosítani,
  // új sort nem hoz létre -- ez a hívás biztosítja, hogy a sor létezzen
  // (első AI-funkció-hívásnál is), mielőtt az RPC lefutna.
  await getUserCreditBalance(userId);

  const { data, error } = await supabase
    .rpc('deduct_credits', {
      p_user_id: userId,
      p_feature_name: featureName,
      p_cost: cost,
    })
    .maybeSingle();

  if (error) {
    if (error.message.includes('INSUFFICIENT_CREDITS')) {
      const freshBalance = await getUserCreditBalance(userId);
      throw new InsufficientCreditsError(userId, cost, freshBalance.totalCreditsAvailable);
    }
    throw new Error(`Nem sikerült levonni a kreditet: ${error.message}`);
  }

  if (!data) {
    throw new Error('Nem sikerült levonni a kreditet: az adatbázis nem adott vissza egyenleget.');
  }

  // Az RPC csak a friss havi/vásárolt egyenleget adja vissza -- a teljes
  // (id/creditsResetAt-tel kiegészített) objektumot egy friss olvasással
  // állítjuk össze, hogy a visszaadott `UserCredit` mindig konzisztens legyen.
  const balance = await getUserCreditBalance(userId);
  return balance;
}
