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

  // `session.invoice` -- 2026-08-09, "Élő teszt-vásárlás utáni hibák kivizsgálása" lépés:
  // kiderült, hogy a `checkout/route.ts`-ben bekapcsolt `invoice_creation` CSAK létrehozza
  // és finalizálja a Stripe Invoice-ot, de NEM küldi el automatikusan e-mailben -- ehhez
  // KIFEJEZETTEN meg kell hívni a `send` végpontot (Stripe dokumentáció: "Send an Invoice...
  // Stripe finalizes the invoice as soon as you send it", és a `invoice_creation` a
  // finalizálást már elvégezte, tehát itt csak a kiküldés hiányzik). `mode: 'subscription'`
  // Checkout Session-nél `session.invoice` is létezik, de ott a Stripe Billing automatikus
  // számla-emailjei (Dashboard "Customer emails" beállítás) felelnek a kiküldésért, azt itt
  // NEM duplikáljuk.
  //
  // Szándékosan NEM dobunk hibát, ha a küldés sikertelen -- a kredit/csomag jóváírása (fent)
  // ekkorra már megtörtént, egy `throw` itt a teljes webhook-ot hiba-státuszra állítaná,
  // amire a Stripe újrapróbálkozna, és az `apply_plan_purchase` RPC (nem idempotens, `+5`
  // jellegű összeadás) EGY ÚJABB kredit-jóváírást hajtana végre ugyanarra a vásárlásra --
  // ez rosszabb, mint egy elmaradt e-mail. Az e-mail hiba csak logolva van.
  if (typeof session.invoice === 'string') {
    try {
      const stripe = getStripeClient();
      await stripe.invoices.sendInvoice(session.invoice);
      console.log('[stripe/webhook] Számla e-mail elküldve:', { organizationId, invoiceId: session.invoice });
    } catch (sendError) {
      console.error('[stripe/webhook] Számla e-mail küldése sikertelen (a kredit jóváírása ettől függetlenül megtörtént):', {
        organizationId,
        invoiceId: session.invoice,
        sendError,
      });
    }
  }
}

/**
 * `customer.subscription.created`/`updated`/`deleted` esemény-kezelő (2026-08-11,
 * "Platform Admin kredit/előfizetés-kezelés" lépés) -- ELSŐDLEGESEN a `user_credits`
 * Stripe-mezőit (stripe_customer_id/stripe_subscription_id/subscription_status/
 * subscription_current_period_end/cancel_at_period_end) frissíti, a `plan_tier`/kvóta-
 * oszlopokhoz csak EGY, kifejezetten szűk esetben nyúl (lásd lent, "Előfizetés
 * lemondása" szakasz) -- egyébként azokat továbbra is KIZÁRÓLAG a
 * `checkout.session.completed` -> `apply_plan_purchase` RPC (fent) vagy a Platform Admin
 * felület kézi felülbírálása állítja. Ez a szándékos szétválasztás (Levi tisztázó
 * kérdésre adott döntése): a `/admin` felület kredit/csomag-módosítása CSAK belső
 * override, NEM hív Stripe API írási műveletet -- ez a handler alapvetően a FORDÍTOTT
 * irányt (Stripe -> mi) szinkronizálja, kizárólag megjelenítési célra (lejárati dátum/
 * státusz az admin/Billing felületen).
 *
 * **Előfizetés lemondása (2026-08-17, "Előfizetés lemondása" lépés) -- KIVÉTEL a fenti
 * elv alól:** ha az esemény azt jelzi, hogy a Stripe-előfizetés VÉGLEGESEN lezárult
 * (`subscription.status === 'canceled'` -- ez akár egy `customer.subscription.deleted`
 * eseménnyel érkezik, amikor a `cancel_at_period_end=true`-val lemondott előfizetés
 * számlázási ciklusa lejár ÉS a Stripe automatikusan lezárja, akár elméletileg egy
 * `updated` eseménnyel, ha a Stripe Dashboardon valaki azonnal töröl egy előfizetést),
 * a szervezetet VISSZAFOKOZZUK az 'free' csomagra az `apply_plan_purchase('free')` RPC-n
 * keresztül (lásd `supabase/migrations/20260817_subscription_cancellation.sql`) -- ez a
 * felhasználó KIFEJEZETT kérése ("ha valaki leiratkozik... a kifizetett részig
 * használhatja a rendszert, utána biztosan nem"): enélkül egy lejárt előfizetésű
 * szervezet a régi `plan_tier`-en (pl. Profi) maradt volna ÖRÖKRE, mert ez a handler
 * korábban SOHA nem nyúlt a `plan_tier`-hez. A `stripe_subscription_id` is törlésre
 * kerül (NULL-ra) -- ha a szervezet később ÚJRA előfizet, a checkout egy ÚJ Subscription
 * objektumot hoz létre, a régi, már lezárt ID-t nem szabad megtartani.
 *
 * `subscription.metadata.organizationId` -- a `checkout/route.ts` `subscription_data.
 * metadata`-ja tölti ki ÚJ előfizetésnél; megújuláskor/státuszváltáskor a Stripe
 * megőrzi ugyanezt a metadata-t a Subscription objektumon, tehát később érkező
 * `updated`/`deleted` eseményeknél is jelen van. Ha valamiért hiányzik (pl. egy a
 * checkout route bővítése ELŐTT indult, réges-régi előfizetés), az eseményt kihagyjuk --
 * ugyanaz az elv, mint `handleCheckoutSessionCompleted`-nél a hiányzó
 * `metadata.organizationId`-nál.
 *
 * `subscription.items.data[0]?.current_period_end` -- az újabb Stripe API-verziókban
 * (ez a projekt a `stripe` npm csomag v22-jét használja) a számlázási ciklus vége MÁR NEM
 * a Subscription objektum tetején él (`subscription.current_period_end` nem is létezik a
 * jelenlegi TypeScript típusokban), hanem soronként (SubscriptionItem) -- mivel ennek a
 * projektnek minden előfizetése egyetlen price-ot tartalmaz, az első (és egyetlen) tétel
 * ciklus-vége megegyezik a "teljes előfizetés" lejáratával. Egy VÉGLEGESEN lezárt
 * (`canceled`) előfizetésnél ez a mező jellemzően `undefined`, ezért `null`-ra esik.
 */
async function handleSubscriptionEvent(subscription: Stripe.Subscription): Promise<void> {
  const organizationId = subscription.metadata?.organizationId;

  if (!organizationId) {
    console.error(
      '[stripe/webhook] customer.subscription.* esemény metadata.organizationId nélkül -- kihagyva.',
      { subscriptionId: subscription.id }
    );
    return;
  }

  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const currentPeriodEndUnix = subscription.items.data[0]?.current_period_end;
  const isPermanentlyCanceled = subscription.status === 'canceled';

  const supabaseAdmin = createAdminClient();

  // `.upsert(..., { onConflict: 'organization_id' })` -- ha a szervezetnek MÉG NINCS
  // `user_credits` sora (pl. egy vadonatúj szervezet, ami a checkout.session.completed
  // ELŐTT/UTÁN, de ezzel majdnem egyidőben kapja meg ezt az eseményt -- a két esemény
  // sorrendje Stripe-nál NEM garantált), létrehozza az alapértelmezett (free) sort ezekkel
  // a mezőkkel kiegészítve. Csak a LENTI mezők érintettek -- a plan_tier/kvóta-oszlopok a
  // meglévő soron VÁLTOZATLANOK maradnak (lásd a fenti JSDoc-ot), újonnan létrejövő sornál
  // pedig a tábla-alapértékeket (free/5/3 stb.) kapják, amíg a checkout.session.completed
  // esemény be nem állítja a tényleges csomagot. `isPermanentlyCanceled` esetén a
  // `stripe_subscription_id`-t explicit NULL-ra állítjuk -- lásd a fenti JSDoc-ot.
  const { error } = await supabaseAdmin.from('user_credits').upsert(
    {
      organization_id: organizationId,
      stripe_customer_id: customerId,
      stripe_subscription_id: isPermanentlyCanceled ? null : subscription.id,
      subscription_status: subscription.status,
      subscription_current_period_end: currentPeriodEndUnix
        ? new Date(currentPeriodEndUnix * 1000).toISOString()
        : null,
      cancel_at_period_end: isPermanentlyCanceled ? false : subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  );

  if (error) {
    console.error('[stripe/webhook] user_credits Stripe-mezők frissítése sikertelen:', {
      organizationId,
      subscriptionId: subscription.id,
      error,
    });
    throw new Error(`user_credits Stripe-mező frissítés sikertelen: ${error.message}`);
  }

  console.log('[stripe/webhook] Előfizetés-állapot szinkronizálva:', {
    organizationId,
    subscriptionId: subscription.id,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });

  // Lásd a fenti JSDoc "Előfizetés lemondása" szakaszát -- a VÉGLEGESEN lezárt
  // előfizetésű szervezetet visszafokozzuk 'free'-re, hogy a fizetett csomag ne
  // maradjon örökre aktív egy lejárt előfizetésnél.
  if (isPermanentlyCanceled) {
    const { error: downgradeError } = await supabaseAdmin
      .rpc('apply_plan_purchase', { p_organization_id: organizationId, p_plan_action: 'free' })
      .maybeSingle();

    if (downgradeError) {
      console.error('[stripe/webhook] Visszafokozás \'free\'-re sikertelen (lejárt előfizetés):', {
        organizationId,
        subscriptionId: subscription.id,
        downgradeError,
      });
      throw new Error(`apply_plan_purchase('free') sikertelen: ${downgradeError.message}`);
    }

    console.log('[stripe/webhook] Szervezet visszafokozva \'free\' csomagra (lejárt előfizetés):', {
      organizationId,
      subscriptionId: subscription.id,
    });
  }
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
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      // 2026-08-11, "Platform Admin kredit/előfizetés-kezelés" lépés -- lásd a fenti
      // `handleSubscriptionEvent` JSDoc-ját. `invoice.payment_failed`-et ez a lépés
      // TOVÁBBRA sem kezel (nem volt része a mostani kérésnek).
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionEvent(subscription);
    }

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
