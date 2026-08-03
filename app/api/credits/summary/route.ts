import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRecentUsageLogs, getUserCreditBalance, getUserPlanTier } from '@/lib/credits';
import { getUserRoleContext } from '@/lib/auth/roles';
import type { OrganizationRole, PlanTier, UsageLog, UserCredit } from '@/types/credits';

/**
 * Kredit- és előfizetés-áttekintés végpont a kliens-oldali UI komponenseknek
 * (`HeaderCreditBadge.tsx`, `CreditDashboardModal.tsx`) -- ezek `'use client'`
 * komponensek, így nem hívhatják közvetlenül a `lib/credits.ts` szerver-oldali
 * (cookie-alapú Supabase kliens, `next/headers`-re épülő) függvényeit, ezért ez a route
 * egyetlen hívásban adja vissza mindhármat: a csomag-szintet (`plan_tier`), a
 * kredit-egyenleget (`user_credits`, automatikusan létrehozva, ha még nem létezik --
 * lásd `getUserCreditBalance`) és a legutóbbi AI-használati audit-bejegyzéseket
 * (`usage_logs`).
 *
 * Ugyanaz az autentikációs minta, mint a `/api/ai/*` route-oknál (lásd
 * `app/api/ai/parse-equipment/route.ts` "Autentikáció + kredit-védelem" JSDoc-ját) --
 * `lib/supabase/server.ts` cookie-alapú kliens, `401` bejelentkezés nélkül.
 *
 * **`role`/`canViewAllReports` (2026-08-03, "Szervezeti szerepkezelés" lépés):** a
 * válasz ezeket is tartalmazza -- a `HeaderCreditBadge`/`InsufficientCreditsModal`
 * (mindkettő kliens-komponens) ezen keresztül tudja meg a hívó szerepkörét, hogy
 * Átvizsgálónak elrejtse a kredit-egyenleget, illetve testreszabott "keresd meg a
 * Menedzseredet" üzenetet mutasson kifogyott céges kereten.
 */
export interface CreditSummarySuccessResponse {
  success: true;
  planTier: PlanTier;
  balance: UserCredit;
  usageLogs: UsageLog[];
  role: OrganizationRole;
  canViewAllReports: boolean;
}

interface CreditSummaryErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: string;
}

function toErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(): Promise<NextResponse<CreditSummarySuccessResponse | CreditSummaryErrorResponse>> {
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

  try {
    const [balance, planTier, usageLogs, roleContext] = await Promise.all([
      getUserCreditBalance(user.id),
      getUserPlanTier(user.id),
      getRecentUsageLogs(user.id, 8),
      getUserRoleContext(user.id),
    ]);

    return NextResponse.json({
      success: true,
      planTier,
      balance,
      usageLogs,
      role: roleContext?.role ?? 'manager',
      canViewAllReports: roleContext?.canViewAllReports ?? false,
    });
  } catch (error) {
    console.error('[credits/summary] Nem sikerült összeállítani a kredit-áttekintést:', error);
    return NextResponse.json(
      { success: false, error: 'Nem sikerült lekérni a kredit-adatokat.', details: toErrorDetails(error) },
      { status: 500 }
    );
  }
}
