import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeInspectionQuota, InsufficientInspectionQuotaError } from '@/lib/quotas';
import type { QuotaBalance } from '@/types/quotas';

/**
 * Vizsgálati kvóta levonó végpont (PROJEKT_INSTRUKCIOK.md "Keret-ellenőrző és fogyasztó
 * logika" lépés, 2026-08-04), a `InspectionWizard.tsx` ('use client', tehát nem hívhatja
 * közvetlenül a `lib/quotas.ts` szerver-oldali, `next/headers`-re épülő függvényeit) egy
 * VADONATÚJ vizsgálat ELSŐ sikeres mentése UTÁN hívja ezt a route-ot (lásd
 * `InspectionWizard.tsx` `handleSubmit`, `!isEditMode` ág), hogy ténylegesen levonja a
 * `checkInspectionQuota`-val korábban (`/inspections/new` oldal betöltésekor) már
 * ellenőrzött vizsgálati keretet.
 */
export const runtime = 'nodejs';

interface ConsumeQuotaSuccessResponse {
  success: true;
  quota: QuotaBalance;
}

interface ConsumeQuotaErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: string;
}

function toErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(): Promise<NextResponse<ConsumeQuotaSuccessResponse | ConsumeQuotaErrorResponse>> {
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
    const quota = await consumeInspectionQuota(user.id);
    return NextResponse.json({ success: true, quota });
  } catch (error) {
    if (error instanceof InsufficientInspectionQuotaError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: 402 }
      );
    }

    console.error('[inspections/consume-quota] Váratlan hiba a kvóta levonása közben:', error);
    return NextResponse.json(
      { success: false, error: 'Nem sikerült levonni a vizsgálati keretet.', details: toErrorDetails(error) },
      { status: 500 }
    );
  }
}
