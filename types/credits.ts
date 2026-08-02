/**
 * Kredit- és előfizetés-kezelő típusdefiníciók.
 *
 * A DB-oszlopok snake_case-ben vannak (`monthly_credits_remaining` stb., lásd
 * `supabase/migrations/20260802_credits_schema.sql`), az alkalmazás-rétegben
 * (`lib/credits.ts`, komponensek) mindenhol az itt definiált camelCase alakot
 * használjuk -- a snake_case -> camelCase leképezést kizárólag `lib/credits.ts`
 * végzi.
 */

export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface UserCredit {
  id: string;
  userId: string;
  monthlyCreditsRemaining: number;
  purchasedCreditsRemaining: number;
  creditsResetAt: string | null;
  /** monthlyCreditsRemaining + purchasedCreditsRemaining összege. */
  totalCreditsAvailable: number;
}

export interface UsageLog {
  id: string;
  userId: string;
  featureName: string;
  creditsDeducted: number;
  createdAt: string;
}
