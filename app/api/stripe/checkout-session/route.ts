import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserRoleContext } from '@/lib/auth/roles';
import { getStripeClient } from '@/lib/stripe';

/**
 * Stripe Checkout Session -> számla-link lekérdező végpont (GET), 2026-08-09, "Nincs
 * számla-email" lépés. Azért kellett, mert kiderült, hogy a `stripe.invoices.sendInvoice()`
 * hívás (`app/api/stripe/webhook/route.ts`) `invoice_creation`-nel létrehozott Checkout-
 * számláknál IDŐSZAKOSAN, indoklás nélkül `400 invalid_request_error`-t dob ("This invoice
 * cannot be sent right now. Please contact us..."), ugyanolyan felépítésű Session-öknél,
 * ahol egyszer sikeres volt, másszor nem. Mivel ez egy Stripe-oldali, API-n keresztül nem
 * diagnosztizálható/megbízhatóan javítható viselkedés, a MEGBÍZHATÓ megoldás: a számla
 * linkjét a SAJÁT felületünkön (a sikeres fizetés banner, `BillingTab.tsx`) is
 * megjelenítjük, függetlenül attól, hogy a Stripe e-mailje eljutott-e a vevőhöz.
 *
 * **Biztonsági guard:** a `session.metadata.organizationId`-nak EGYEZNIE kell a bejelentkezett
 * felhasználó szervezetével, anélkül bárki, aki ismeri/kitalálja egy másik szervezet
 * `session_id`-jét, megnézhetné AZ Ő számlájukat. Ugyanaz a Menedzser-guard, mint a
 * `/api/stripe/checkout` route-on (lásd annak JSDoc-ját).
 */
export const runtime = 'nodejs';

interface CheckoutSessionInvoiceResponse {
  success: true;
  invoiceUrl: string | null;
  invoicePdf: string | null;
  invoiceNumber: string | null;
}

interface ErrorResponse {
  success: false;
  error: string;
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<CheckoutSessionInvoiceResponse | ErrorResponse>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'A művelethez bejelentkezés szükséges.' }, { status: 401 });
  }

  const roleContext = await getUserRoleContext(user.id);
  if (!roleContext || roleContext.role !== 'manager') {
    return NextResponse.json(
      { success: false, error: 'Ehhez a művelethez Menedzser jogosultság szükséges.' },
      { status: 403 }
    );
  }

  const sessionId = request.nextUrl.searchParams.get('session_id')?.trim();
  if (!sessionId) {
    return NextResponse.json({ success: false, error: 'A "session_id" paraméter kötelező.' }, { status: 400 });
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Lásd a fenti JSDoc "Biztonsági guard" pontját, csak a SAJÁT szervezet Session-jét
    // engedjük megnézni.
    if (session.metadata?.organizationId !== roleContext.organizationId) {
      return NextResponse.json({ success: false, error: 'Ez a fizetés nem a szervezetedhez tartozik.' }, { status: 403 });
    }

    if (typeof session.invoice !== 'string') {
      return NextResponse.json({ success: true, invoiceUrl: null, invoicePdf: null, invoiceNumber: null });
    }

    const invoice = await stripe.invoices.retrieve(session.invoice);

    return NextResponse.json({
      success: true,
      invoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdf: invoice.invoice_pdf ?? null,
      invoiceNumber: invoice.number ?? null,
    });
  } catch (error) {
    console.error('[stripe/checkout-session] Hiba a Session/Invoice lekérdezése közben:', error);
    return NextResponse.json({ success: false, error: 'Nem sikerült lekérdezni a számlát.' }, { status: 500 });
  }
}
