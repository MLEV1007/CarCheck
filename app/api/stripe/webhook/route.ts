import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripeClient } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Stripe Webhook végpont (PROJEKT_INSTRUKCIOK.md "Webhook logika" lépés, 2026-08-04) --
 * a Stripe szervere hívja szerver-szerver kommunikációval, amikor egy Checkout Session
 * állapota változik (elsősorban `checkout.session.completed`, sikeres fizetés/előfizetés
 * után). NINCS bejelentkezett user-session (nincs cookie), ezért ez a route:
 *   1) a `STRIPE_WEBHOOK_SECRET`-tel ELLENŐRZI a kérés aláírását (`stripe-signature`
 *      fejléc) -- ez garantálja, hogy a kérés TÉNYLEG a Stripe-tól jött, nem egy
 *      hamisított POST kérés, ami illetéktelenül jóváírna krediteket/kvótát.
 *   2) a `lib/supabase/admin.ts` SERVICE ROLE (RLS-t megkerülő) klienssel írja a
 *      `user_credits` táblát -- a normál, cookie-alapú kliens itt nem működne, mert
 *      nincs `auth.uid()` (a webhook-nak nincs bejelentkezett usere).
 *
 * `runtime = 'nodejs'` -- a Stripe SDK szinkron webhook-aláírás-ellenőrzése (`stripe.
 * webhooks.constructEvent`) Node.js `crypto` modulra épül.
 *
 * **KRITIKUS: a nyers (raw) request body-t KELL az aláírás-ellenőrzéshez** -- Next.js App
 * Router Route Handlerben `await request.text()`-tel olvassuk ki (NEM `request.json()`-nal,
 * ami már parse-olt objektumot adna, azzal a Stripe SDK aláírás-számítása nem egyezne).
 */
export const runtime = 'nodejs';

/** `checkout.session.completed` `metadata.priceId` -> `apply_plan_purchase` RPC
 * `p_plan_action` paramétere. `null`, ha a `priceId` egyik ismert env-price-azonosítóval
 * sem egyezik (pl. egy régi/törölt ár, vagy konfigurációs hiba) -- ilyenkor a webhook
 * `200`-at ad vissza (a Stripe-nak NEM szabad újrapróbálkoznia), de logolja a hibát, mert
 * a KÉRÉS maga érvényes volt, csak a mi price ID <-> csomag leképezésünk hiányos.
 *
 * **2026-08-06, "Árazási struktúra bővítés" lépés:** `growth` + 3 AI-kredit-csomag
 * (`ai_topup5/15/40`) hozzáadva -- lásd `supabase/migrations/
 * 20260806_pricing_tiers_growth_business_ai_credits.sql` bővített `apply_plan_purchase`
 * `p_plan_action` enumját. A `business` tier SZÁNDÉKOSAN NINCS itt leképezve -- nem
 * önkiszolgáló Stripe Checkout tétel (egyedi ártárgyalás, lásd `BillingTab.tsx`), ezért
 * sosem érkezik `checkout.session.completed` esemény hozzá ezen a felületen keresztül.
 *
 * **2026-08-07, "Fizetések átnevezése + Havi/éves kapcsoló" lépés:** a `*_YEARLY` env
 * price ID-k (`STRIPE_PRICE_ID_STARTER_YEARLY` stb.) UGYANARRA a `plan_tier`-re képeződnek
 * le, mint a havi párjuk -- a `p_plan_action`/`plan_tier` a csomag SZINTJÉT jelöli, nem a
 * számlázási periódust, a `user_credits` táblának nincs külön "yearly" állapota. A
 * megjelenített csomagnevek (Egyéni/Műhely Kereskedői/Profi) csak UI-réteg
 * (`BillingTab.tsx` `PLAN_TIER_LABELS`), a belső `starter`/`growth`/`pro` azonosító
 * változatlan maradt, hogy a meglévő DB-adatok/RPC ne törjenek. */
function resolvePlanAction(
  priceId: string | undefined
): 'starter' | 'growth' | 'pro' | 'topup10' | 'ai_topup5' | 'ai_topup15' | 'ai_topup40' | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_ID_STARTER) return 'starter';
  if (priceId === process.env.STRIPE_PRICE_ID_STARTER_YEARLY) return 'starter';
  if (priceId === process.env.STRIPE_PRICE_ID_GROWTH) return 'growth';
  if (priceId === process.env.STRIPE_PRICE_ID_GROWTH_YEARLY) return 'growth';
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_ID_PRO_YEARLY) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_ID_TOPUP_10) return 'topup10';
  if (priceId === process.env.STRIPE_PRICE_ID_AI_TOPUP_5) return 'ai_topup5';
  if (priceId === process.env.STRIPE_PRICE_ID_AI_TOPUP_15) return 'ai_topup15';
  if (priceId === process.env.STRIPE_PRICE_ID_AI_TOPUP_40) return 'ai_topup40';
  return null;
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const organizationId = session.metadata?.organizationId;
  const priceId = session.metadata?.priceId;

  if (!organizationId) {
    console.error('[stripe/webhook] checkout.session.completed esemény metadata.organizationId nélkül -- kihagyva.', {
      sessionId: session.id,
    });
    return;
  }

  const planAction = resolvePlanAction(priceId);
  if (!planAction) {
    console.error('[stripe/webhook] checkout.session.completed esemény ismeretlen/hiányzó metadata.priceId-vel -- kihagyva.', {
      sessionId: session.id,
      priceId,
    });
    return;
  }

  const supabaseAdmin = createAdminClient();

  const { error } = await supabaseAdmin
    .rpc('apply_plan_purchase', { p_organization_id: organizationId, p_plan_action: planAction })
    .maybeSingle();

  if (error) {
    console.error('[stripe/webhook] apply_plan_purchase RPC hiba:', { organizationId, planAction, error });
    throw new Error(`apply_plan_purchase sikertelen: ${error.message}`);
  }

  console.log('[stripe/webhook] Csomag/Top-up sikeresen alkalmazva:', { organizationId, planAction, sessionId: session.id });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET hiányzik a szerver környezeti változói közül.');
    return NextResponse.json({ error: 'A webhook nincs megfelelően konfigurálva a szerveren.' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Hiányzó stripe-signature fejléc.' }, { status: 400 });
  }

  // Nyers body -- lásd a fenti JSDoc "KRITIKUS" pontját, semmiképp ne `request.json()`.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error('[stripe/webhook] Aláírás-ellenőrzés sikertelen:', error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Webhook aláírás-ellenőrzés sikertelen: ${details}` }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutSessionCompleted(session);
    }
    // Más eseménytípusokat (pl. invoice.payment_failed, customer.subscription.deleted)
    // ez a lépés szándékosan nem kezel -- az MVP kizárólag a sikeres Checkout Session
    // utáni kvóta-jóváírást igényelte (lásd PROJEKT_INSTRUKCIOK.md 3. pontját).

    return NextResponse.json({ received: true });
  } catch (error) {
    // Nem-200 válasz esetén a Stripe automatikusan újrapróbálja a webhook-hívást --
    // ez szándékos, hogy egy átmeneti DB-hiba (pl. hálózati kihagyás) esetén a
    // kvóta-jóváírás egy KÖVETKEZŐ retry-nál sikeresen lefusson, ne vesszen el véglegesen.
    console.error('[stripe/webhook] Esemény-feldolgozási hiba:', error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Webhook feldolgozási hiba: ${details}` }, { status: 500 });
  }
}
