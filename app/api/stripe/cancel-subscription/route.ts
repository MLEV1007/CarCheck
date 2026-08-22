import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { getUserRoleContext } from '@/lib/auth/roles';
import { getStripeClient } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Előfizetés lemondása / lemondás visszavonása végpont (2026-08-17, felhasználói kérés:
 * "hozd létre, hogy az előfizetést le is lehessen mondani... Csak biztos megoldás
 * érdekel, ha valaki leiratkozik, akkor még a kifizetett részig használhatja a
 * rendszert, utána biztosan nem. A fiókja természetesen megmarad."), a Beállítások >
 * Előfizetés fül (`BillingTab.tsx`) "Előfizetés lemondása"/"Lemondás visszavonása"
 * gombjai hívják.
 *
 * **A "biztos megoldás" a Stripe saját, beépített `cancel_at_period_end` mezője, NEM egy
 * azonnali `stripe.subscriptions.cancel()`:** ez garantálja, hogy a szervezet a MÁR
 * KIFIZETETT számlázási cikluson belül (a `subscription_current_period_end`-ig)
 * változatlanul teljes hozzáférést kap, utána viszont a Stripe SAJÁT szerverén,
 * automatikusan (semmilyen mi-oldali cron/időzített feladat nélkül, ami elmaradhatna/
 * hibázhatna) lezárja az előfizetést, és `customer.subscription.deleted` webhook-
 * eseményt küld, ezt `app/api/stripe/webhook/route.ts` `handleSubscriptionEvent`-je
 * kezeli: onnantól a szervezet VÉGLEGESEN (a fiók/korábbi vizsgálatok törlése NÉLKÜL,
 * lásd `DeleteAccountCard.tsx`-től eltérően) visszakerül az 'free' csomagra, a
 * `apply_plan_purchase('free')` RPC-ágon keresztül (lásd
 * `supabase/migrations/20260817_subscription_cancellation.sql`).
 *
 * **Szervezeti Guard, KIZÁRÓLAG Menedzser mondhat le/vonhat vissza előfizetést**,
 * ugyanaz a minta, mint `/api/stripe/checkout/route.ts`-nél.
 *
 * **`action: 'cancel' | 'resume'`:** a "Lemondás visszavonása" (resume) azért él ugyanezen
 * az endpointon, mert pontosan a Stripe `cancel_at_period_end` mezőjének ELLENKEZŐJÉT
 * állítja be (`false`), amíg a számlázási ciklus még nem járt le, ha a Menedzser
 * meggondolja magát, ne kelljen újra végigmennie a teljes Checkout folyamaton.
 *
 * **DB write-through:** a Stripe API hívás UTÁN ez a route KÖZVETLENÜL is frissíti a
 * `user_credits.cancel_at_period_end` mezőt a service-role admin klienssel (ugyanaz a
 * minta, mint a webhook route `handleSubscriptionEvent`-je), ez a UI-t AZONNAL, a
 * webhook kör-út (hálózati késleltetés, Vercel-en akár másodperces) megvárása nélkül
 * frissíti. A webhook a `customer.subscription.updated` eseménnyel ezt UTÓLAG úgyis
 * szinkronizálja (idempotens upsert), tehát ha ez a write-through bármiért elveszne, a
 * DB akkor sem marad tartósan inkonzisztens.
 */
export const runtime = 'nodejs';

interface CancelSubscriptionRequestBody {
  action?: unknown;
}

interface CancelSubscriptionSuccessResponse {
  success: true;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

interface CancelSubscriptionErrorResponse {
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
): Promise<NextResponse<CancelSubscriptionSuccessResponse | CancelSubscriptionErrorResponse>> {
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

  // SZERVEZETI GUARD, lásd a fenti JSDoc-ot. Csak Menedzser mondhat le/vonhat vissza.
  const roleContext = await getUserRoleContext(user.id);
  if (!roleContext || roleContext.role !== 'manager') {
    return NextResponse.json(
      { success: false, error: 'Ehhez a művelethez Menedzser jogosultság szükséges.', code: 'FORBIDDEN' },
      { status: 403 }
    );
  }

  let body: CancelSubscriptionRequestBody;
  try {
    body = (await request.json()) as CancelSubscriptionRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Érvénytelen JSON kérés törzs.' }, { status: 400 });
  }

  const action = body?.action === 'resume' ? 'resume' : 'cancel';

  try {
    const supabaseAdmin = createAdminClient();

    // A `stripe_subscription_id`-t a saját (RLS-szel védett) `user_credits` sorunkból
    // olvassuk, NEM a kliensből küldött értékből, hogy egy manipulált kérés ne tudjon
    // egy MÁSIK szervezet előfizetésén módosítani (lásd `checkout-session/route.ts`
    // hasonló "Biztonsági guard" JSDoc-ját).
    const { data: creditsRow, error: creditsError } = await supabaseAdmin
      .from('user_credits')
      .select('stripe_subscription_id, subscription_status')
      .eq('organization_id', roleContext.organizationId)
      .maybeSingle();

    if (creditsError) {
      throw new Error(`Nem sikerült lekérni az előfizetés-adatokat: ${creditsError.message}`);
    }

    const subscriptionId = creditsRow?.stripe_subscription_id;
    if (!subscriptionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Nincs aktív, Stripe-on keresztül indított előfizetésed, amit le lehetne mondani.',
          code: 'NO_ACTIVE_SUBSCRIPTION',
        },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    const subscription: Stripe.Subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: action === 'cancel',
    });

    const currentPeriodEndUnix = subscription.items.data[0]?.current_period_end;
    const currentPeriodEndIso = currentPeriodEndUnix ? new Date(currentPeriodEndUnix * 1000).toISOString() : null;

    // Write-through, lásd a fenti JSDoc "DB write-through" pontját.
    const { error: updateError } = await supabaseAdmin
      .from('user_credits')
      .update({
        cancel_at_period_end: subscription.cancel_at_period_end,
        subscription_status: subscription.status,
        subscription_current_period_end: currentPeriodEndIso,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', roleContext.organizationId);

    if (updateError) {
      // A Stripe-oldali állapotváltás ekkorra MÁR megtörtént, ezt a hibát csak
      // logoljuk, a webhook (`customer.subscription.updated`) úgyis utólag
      // szinkronizálja, ugyanaz az elv, mint a checkout webhook számla-email hibájánál.
      console.error('[stripe/cancel-subscription] user_credits write-through sikertelen (a Stripe-módosítás megtörtént):', {
        organizationId: roleContext.organizationId,
        subscriptionId,
        updateError,
      });
    }

    console.log('[stripe/cancel-subscription] Előfizetés-lemondás állapota módosítva:', {
      organizationId: roleContext.organizationId,
      subscriptionId,
      action,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });

    return NextResponse.json({
      success: true,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: currentPeriodEndIso,
    });
  } catch (error) {
    console.error('[stripe/cancel-subscription] Hiba az előfizetés lemondása/visszavonása közben:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          action === 'cancel'
            ? 'Nem sikerült lemondani az előfizetést.'
            : 'Nem sikerült visszavonni az előfizetés lemondását.',
        details: toErrorDetails(error),
      },
      { status: 500 }
    );
  }
}
