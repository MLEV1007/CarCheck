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
 * `mode`: a `priceId` alapján dől el -- MINDEN egyszeri (nem lejáró) csomag `'payment'`
 * (egyszeri fizetés): a `STRIPE_PRICE_ID_TOPUP_10` ("+10 Autó" vizsgálat-csomag) ÉS a 3
 * AI-kredit-csomag (`STRIPE_PRICE_ID_AI_TOPUP_5/15/40`, 2026-08-06, "Árazási struktúra
 * bővítés" lépés). MINDEN MÁS ár (Starter/Growth/Pro havi előfizetés) `'subscription'`.
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

  // Egyszeri (nem lejáró) vásárlási tételek -- lásd a fenti JSDoc "mode" pontját. Minden
  // más ár (Starter/Growth/Pro havi előfizetés) `'subscription'` módban indul.
  const oneTimePurchasePriceIds = new Set(
    [
      process.env.STRIPE_PRICE_ID_TOPUP_10,
      process.env.STRIPE_PRICE_ID_AI_TOPUP_5,
      process.env.STRIPE_PRICE_ID_AI_TOPUP_15,
      process.env.STRIPE_PRICE_ID_AI_TOPUP_40,
    ].filter((id): id is string => Boolean(id))
  );
  const mode: 'payment' | 'subscription' = oneTimePurchasePriceIds.has(priceId) ? 'payment' : 'subscription';

  const origin = request.nextUrl.origin;

  try {
    const stripe = getStripeClient();

    const session = await stripe.checkout.sessions.create({
      mode,
      customer_email: user.email ?? undefined,
      // `billing_address_collection: 'required'` -- 2026-08-17, "Sikeres fizetés email +
      // számlázási cím kötelezővé tétele" lépés, Levi kifejezett kérésére: a Stripe Checkout
      // oldalon a fizetés előtt KÖTELEZŐEN ki kell tölteni a teljes számlázási címet (ország,
      // irányítószám, város, cím, opcionálisan 2. sor). Enélkül ('auto', az eddigi
      // alapértelmezett) a Stripe csak akkor kéri be a címet, ha az adott fizetési mód (pl.
      // kártya) megköveteli -- emiatt gyakran hiányzott a számlázási cím, ami a
      // `invoice_creation`-nel generált Stripe-számlát hiányosan (vagy cím nélkül) állította
      // ki. Ez a beállítás közvetlenül összefügg a webhook `sendPaymentSuccessEmail` hívásának
      // "24 órán belül, amennyiben minden számlázási adat rendelkezésre áll" ígéretével --
      // ezzel a kapcsolóval gyakorlatilag MINDIG rendelkezésre fog állni.
      billing_address_collection: 'required',
      line_items: [{ price: priceId, quantity: 1 }],
      // `allow_promotion_codes` -- 2026-08-09, "Fizetési folyamat élő tesztelése" lépés:
      // megjeleníti a "Kedvezménykód hozzáadása" mezőt a Stripe Checkout oldalon. Eredetileg
      // egy 0 Ft-os, 100%-os teszt-kupon miatt kellett (hogy a teljes checkout -> webhook ->
      // `apply_plan_purchase` láncot valós pénz nélkül lehessen élesben leellenőrizni), de a
      // felhasználóval egyeztetve VÉGLEGESEN bekapcsolva marad -- jövőbeli marketing
      // kedvezménykampányokhoz is kell, és a mező önmagában biztonsági kockázatot nem jelent
      // (csak érvényes, a Stripe Dashboardon létrehozott kóddal használható).
      allow_promotion_codes: true,
      // `invoice_creation` -- 2026-08-09, "Fizetési folyamat élő tesztelése" lépés: az egyik
      // teszt-vásárlás után kiderült, hogy a Stripe NEM küld automatikusan számlát/PDF-et
      // 'payment' módú (egyszeri) Checkout Session után -- ez csak akkor jön létre, ha
      // KIFEJEZETTEN kérjük. 'subscription' módra (havi előfizetés) ez a paraméter NEM
      // adható át (Stripe API hibát dob rá), mert ott a Billing automatikusan generál
      // Invoice-ot minden számlázási ciklushoz -- ezért csak `mode === 'payment'` esetén
      // kapcsoljuk be. FIGYELEM: a Stripe-számla e-mailben történő automatikus kiküldését
      // a Stripe Dashboard Settings -> "Customer emails" -> "Email customers about
      // finalized invoices" kapcsolója vezérli, ezt manuálisan kell bekapcsolni a
      // Dashboardon, API-n keresztül nem állítható be.
      ...(mode === 'payment' ? { invoice_creation: { enabled: true } } : {}),
      metadata: {
        userId: user.id,
        organizationId: roleContext.organizationId,
        priceId,
      },
      // `subscription_data.metadata` -- 2026-08-11, "Platform Admin kredit/előfizetés-kezelés"
      // lépés: a session-szintű `metadata` (fent) NEM másolódik át automatikusan a mögötte
      // létrejövő Subscription objektumra -- a `customer.subscription.*` webhook-eseményeknek
      // (amik a Stripe-előfizetés lejárati dátumát szinkronizálják a `user_credits` táblába,
      // lásd `app/api/stripe/webhook/route.ts` `handleSubscriptionEvent`) SAJÁT, a Subscription
      // objektumon élő `organizationId`-ra van szükségük, hogy tudják, MELYIK szervezethez
      // tartoznak -- Stripe customer<->szervezet leképezés erre a lépésre előtt SEHOL nem
      // létezett. Csak `mode === 'subscription'`-nél értelmes (az egyszeri Top-up/AI-kredit
      // vásárlásoknál nincs Subscription objektum).
      ...(mode === 'subscription'
        ? { subscription_data: { metadata: { organizationId: roleContext.organizationId, userId: user.id } } }
        : {}),
      // `session_id={CHECKOUT_SESSION_ID}` -- 2026-08-09, "Nincs számla-email" lépés: a
      // Stripe ezt a sablon-változót a valódi Session ID-ra cseréli az átirányításkor. A
      // `BillingTab.tsx` ezzel kéri le a `/api/stripe/checkout-session` route-tól a számla
      // linkjét, mert a `stripe.invoices.sendInvoice()` (webhook route) megbízhatatlan
      // ugyanilyen Session-öknél -- lásd `app/api/stripe/checkout-session/route.ts` JSDoc-ját.
      success_url: `${origin}/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
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
