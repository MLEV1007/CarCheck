/**
 * Kredit- és előfizetés-kezelő típusdefiníciók.
 *
 * A DB-oszlopok snake_case-ben vannak (`monthly_credits_remaining` stb., lásd
 * `supabase/migrations/20260802_credits_schema.sql` + `20260803_organizations_rbac.sql`),
 * az alkalmazás-rétegben (`lib/credits.ts`, komponensek) mindenhol az itt definiált
 * camelCase alakot használjuk, a snake_case -> camelCase leképezést kizárólag
 * `lib/credits.ts` végzi.
 */

export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

/** Szervezeti szerepkör (PROJEKT_INSTRUKCIOK.md "Szervezeti szerepkezelés" lépés),
 * 'manager' = az első regisztráló, teljes cégre kiterjedő jogosultsággal; 'inspector' =
 * meghívott csapattag, alapból csak a saját vizsgálatait látja. */
export type OrganizationRole = 'manager' | 'inspector';

export interface UserCredit {
  id: string;
  /** A KÖZÖS, szervezet-szintű kredit-egyenleg szervezet-azonosítója (NEM az egyéni
   * felhasználóé, lásd `20260803_organizations_rbac.sql` "user_credits ÁTALAKÍTÁSA
   * szervezet-szintűre" szakaszát: egy Átvizsgáló AI-hívása is EBBŐL a közös
   * (a szervezet Menedzserének) keretéből von le). */
  organizationId: string;
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
