import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserRoleContext } from '@/lib/auth/roles';
import { getStripeClient } from '@/lib/stripe';

/**
 * Stripe Checkout Session létrehozó végpont (PROJEKT_INSTRUKCIOK.md "Stripe Checkout
 * Session API" lépés, 2026-08-04) -- a Beállítások > Előfizetés (Billing) felület 3
 * csomag-kártyájának ("Starter", "Pro", "+10 Autó") gombjai hívják.
 *
 * **Szervezeti Guard -- KIZÁRÓLAG Menedzser indíthat fizetést** (PROJEKT_INSTRUKCIOK.md
 * "3. Biztonság és Multi-Tenancy" + explicit ebben a lépésben is kért szabály): egy
 * Átvizsgáló (`role === 'inspector'`) `403 Forbidden`-t kap. Ugyanaz az autentikációs minta,
 * mint a `/api/ai/*`/`/api/credits/summary` route-oknál (`lib/supabase/server.ts`
 * cookie-alapú kliens, `401` bejelentkezés nélkül) -- itt SZÁNDÉKOSAN NEM a
 * `lib/auth/roles.ts` `requireManager()` helpert hívjuk (bár az UGYANEZT a guard-ot
 * végzi el), mert a checkout session létrehozásához magára a bejelentkezett `user`-re
 * (email) ÉS a `getUserRoleContext` `organizationId`-jára is szükség van -- a
 * `requireManager()` ezeket NEM adja vissza, csak a guard `NextResponse`-t, egy második
 * hívás pedig felesleges duplikált auth-lekérdezés lenne.
 *
 * `mode`: a `priceId` alapján dől el -- a `STRIPE_PRICE_ID_TOPUP_10` (eseti, nem lejáró
 * "+10 Autó" csomag) `'payment'` (egyszeri fizetés), MINDEN MÁS ár (Starter/Pro havi
 * előfizetés) `'subscription'`.
 */
export const runtime = 'nodejs';

interface CheckoutRequestBody {
  priceId?: unknown;
}

interface CheckoutSuccessResponse {
  success: true;
  url: string;
}

interface CheckoutErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: string;
}

function toErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<CheckoutSuccessResponse | CheckoutErrorResponse>> {
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

  // SZERVEZETI GUARD -- lásd a fenti JSDoc-ot. Csak Menedzser indíthat fizetést.
  const roleContext = await getUserRoleContext(user.id);
  if (!roleContext || roleContext.role !== 'manager') {
    return NextResponse.json(
      { success: false, error: 'Ehhez a művelethez Menedzser jogosultság szükséges.', code: 'FORBIDDEN' },
      { status: 403 }
    );
  }

  let body: CheckoutRequestBody;
  try {
    body = (await request.json()) as CheckoutRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Érvénytelen JSON kérés törzs.' }, { status: 400 });
  }

  const priceId = typeof body?.priceId === 'string' ? body.priceId.trim() : '';
  if (!priceId) {
    return NextResponse.json(
      { success: false, error: 'A "priceId" mező kötelező és nem lehet üres.' },
      { status: 400 }
    );
  }

  const topUpPriceId = process.env.STRIPE_PRICE_ID_TOPUP_10;
  const mode: 'payment' | 'subscription' = priceId === topUpPriceId ? 'payment' : 'subscription';

  const origin = request.nextUrl.origin;

  try {
    const stripe = getStripeClient();

    const session = await stripe.checkout.sessions.create({
      mode,
      customer_email: user.email ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        userId: user.id,
        organizationId: roleContext.organizationId,
        priceId,
      },
      success_url: `${origin}/settings/billing?success=true`,
      cancel_url: `${origin}/settings/billing?canceled=true`,
    });

    if (!session.url) {
      return NextResponse.json(
        { success: false, error: 'A Stripe nem adott vissza átirányítási URL-t.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, url: session.url });
  } catch (error) {
    console.error('[stripe/checkout] Hiba a Checkout Session létrehozása közben:', error);
    return NextResponse.json(
      { success: false, error: 'Nem sikerült elindítani a fizetést.', details: toErrorDetails(error) },
      { status: 500 }
    );
  }
}
