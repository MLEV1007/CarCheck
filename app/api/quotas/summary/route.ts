import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getQuotaBalance } from '@/lib/quotas';
import { getUserRoleContext } from '@/lib/auth/roles';
import type { OrganizationRole } from '@/types/credits';
import type { QuotaBalance } from '@/types/quotas';

/**
 * Vizsgálati- és AI-keret áttekintés végpont (PROJEKT_INSTRUKCIOK.md "Frontend Fizetési
 * Modal / Billing Felület" lépés, 2026-08-04) -- a `BillingTab.tsx` ('use client', tehát
 * nem hívhatja közvetlenül a `lib/quotas.ts` szerver-oldali, `next/headers`-re épülő
 * függvényeit) ezen a REST hídon keresztül kéri le a jelenlegi csomagot és a hátralévő
 * vizsgálati/AI keretet. UGYANAZ az autentikációs minta, mint `/api/credits/summary`-nál.
 */
export interface QuotaSummarySuccessResponse {
  success: true;
  quota: QuotaBalance;
  role: OrganizationRole;
}

interface QuotaSummaryErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: string;
}

function toErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(): Promise<NextResponse<QuotaSummarySuccessResponse | QuotaSummaryErrorResponse>> {
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
    const [quota, roleContext] = await Promise.all([getQuotaBalance(user.id), getUserRoleContext(user.id)]);

    return NextResponse.json({
      success: true,
      quota,
      role: roleContext?.role ?? 'manager',
    });
  } catch (error) {
    console.error('[quotas/summary] Nem sikerült összeállítani a kvóta-áttekintést:', error);
    return NextResponse.json(
      { success: false, error: 'Nem sikerült lekérni a kvóta-adatokat.', details: toErrorDetails(error) },
      { status: 500 }
    );
  }
}
