/**
 * Vizsgálati- és AI-keret (kvóta) típusdefiníciók (PROJEKT_INSTRUKCIOK.md "Kredit/keret
 * adatbázis migráció" lépés, 2026-08-04).
 *
 * A DB-oszlopok snake_case-ben vannak (`user_credits` tábla, lásd
 * `supabase/migrations/20260804_inspection_quotas.sql`), az alkalmazás-rétegben
 * (`lib/quotas.ts`, komponensek) mindenhol az itt definiált camelCase alakot
 * használjuk -- a leképezést kizárólag `lib/quotas.ts` végzi. Ugyanaz a minta, mint a
 * `types/credits.ts`-nél (a régi, egyedi AI-kredit rendszernél).
 */

export type QuotaPlanTier = 'starter' | 'pro';

export interface QuotaBalance {
  /** A KÖZÖS, szervezet-szintű kvóta-sor szervezet-azonosítója -- ugyanaz a
   * `user_credits.organization_id`, mint a `UserCredit`-nél (lásd `types/credits.ts`),
   * mert a plan_tier/kvóta oszlopok UGYANAZON a `user_credits` táblán élnek. */
  organizationId: string;
  planTier: QuotaPlanTier;
  monthlyInspectionsLimit: number;
  monthlyInspectionsRemaining: number;
  purchasedInspectionsRemaining: number;
  /** monthlyInspectionsRemaining + purchasedInspectionsRemaining összege. */
  totalInspectionsAvailable: number;
  monthlyAiLimit: number;
  monthlyAiRemaining: number;
}
