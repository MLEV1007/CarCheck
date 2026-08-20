/**
 * Azok az útvonal-prefixek, ahol a felhasználó garantáltan bejelentkezett --
 * ugyanaz a lista, amit korábban a `lib/supabase/middleware.ts` PROTECTED_PREFIXES
 * konstansa önállóan tárolt. Közös helyre emelve (2026-08-20, "Formbricks
 * visszajelzés-widget" lépés, lásd docs/formbricks-feedback-widget-elemzes-2026-08-20.md
 * 5. pontját), hogy a middleware ÉS a `FormbricksProvider.tsx` (ami eldönti, mikor
 * töltse be a widgetet) ugyanabból az egyetlen forrásból dolgozzon -- ne kelljen két
 * helyen karbantartani, ha egy új védett route-szegmens kerül a projektbe.
 */
export const PROTECTED_PREFIXES = ['/dashboard', '/inspections', '/settings', '/admin'] as const;

/** `true`, ha a `pathname` a fenti védett prefixek valamelyike alá esik (a prefix maga is számít). */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
