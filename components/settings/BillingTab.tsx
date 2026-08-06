'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Mail, Zap } from 'lucide-react';
import { formatHuf } from '@/lib/format';
import type { QuotaSummarySuccessResponse } from '@/app/api/quotas/summary/route';
import type { QuotaPlanTier } from '@/types/quotas';

interface BillingTabProps {
  /** Csak Menedzsernek látszanak a vásárlási gombok (PROJEKT_INSTRUKCIOK.md "Frontend
   * Fizetési Modal / Billing Felület" lépés, explicit szabály). A `SettingsTabs.tsx` maga
   * a teljes "Előfizetés" fület is csak Menedzsernek jeleníti meg, ez a prop egy MÁSODIK,
   * belső védelmi réteg, ha ez a komponens valaha egy Átvizsgálónak is látható helyre
   * kerülne. */
  role: 'manager' | 'inspector';
  /** A Stripe Price ID-k a szerver-oldali env változókból (`STRIPE_PRICE_ID_*`) -- ez a
   * kliens-komponens nem olvashatja őket közvetlenül (nincs `NEXT_PUBLIC_` előtag,
   * szándékosan, lásd `.env.local.example`), ezért a szülő Server Component
   * (`app/settings/_components/SettingsPageContent.tsx`) adja át prop-ként. `null`, ha az
   * adott ár még nincs beállítva a Vercel környezeti változói között -- ilyenkor a
   * hozzá tartozó gomb `disabled` marad, hibaüzenet helyett.
   *
   * **2026-08-06, "Árazási struktúra bővítés" lépés:** `growthPriceId` (új, `growth` havi
   * csomag) + 3 AI-kredit-csomag ár (`aiTopup5/15/40PriceId`) hozzáadva -- lásd
   * `supabase/migrations/20260806_pricing_tiers_growth_business_ai_credits.sql`
   * `apply_plan_purchase` RPC-jének bővített `p_plan_action` enumját. A `business` tier
   * SZÁNDÉKOSAN nem kap price ID-t -- egyedi ártárgyalás, nem önkiszolgáló Stripe
   * Checkout tétel (lásd lent a `plans` tömb `business` bejegyzését). */
  starterPriceId: string | null;
  growthPriceId: string | null;
  proPriceId: string | null;
  topupPriceId: string | null;
  aiTopup5PriceId: string | null;
  aiTopup15PriceId: string | null;
  aiTopup40PriceId: string | null;
  /** `?success=true`/`?canceled=true` a Stripe Checkout `success_url`/`cancel_url`
   * visszairányításából (lásd `app/api/stripe/checkout/route.ts`) -- a szülő oldal
   * (`app/settings/billing/page.tsx`) olvassa ki a `searchParams`-ból. */
  banner: 'success' | 'canceled' | null;
}

/** `plan_tier` -> magyar megjelenítendő címke -- ugyanaz a forrás, mint
 * `CreditDashboardModal.tsx`-ben (a két felület szándékosan azonos szóhasználatot ad). */
const PLAN_TIER_LABELS: Record<QuotaPlanTier, string> = {
  starter: 'Starter csomag',
  growth: 'Growth csomag',
  pro: 'Pro Előfizetés',
  business: 'Business csomag',
};

type LoadState = 'loading' | 'ready' | 'error';

interface PlanCardDef {
  key: 'starter' | 'growth' | 'pro' | 'business';
  title: string;
  /** `null` a `business` tier-nél -- egyedi ártárgyalás, nincs fix, nyilvánosan
   * megjelenített ár (lásd a kártya renderelésénél a "Egyedi ajánlat" ágat). */
  price: number | null;
  priceSuffix: string;
  priceId: string | null;
  features: string[];
  isCurrentPlan?: boolean;
  highlight?: boolean;
}

interface AiPackDef {
  key: 'ai_topup5' | 'ai_topup15' | 'ai_topup40';
  credits: number;
  price: number;
  priceId: string | null;
}

/**
 * Beállítások > Előfizetés (Billing) felület (PROJEKT_INSTRUKCIOK.md "Frontend Fizetési
 * Modal / Billing Felület" lépés, 2026-08-04) -- Stripe design system (`stripe.md`, mert a
 * `/settings` alatti felület, lásd PROJEKT_INSTRUKCIOK.md 4.1 pontja): jelenlegi csomag +
 * hátralévő vizsgálati/AI keret, majd a 4 előfizetési csomag kártyája, végül egy külön
 * "AI-kredit vásárlása" szekció.
 *
 * **2026-08-06, "Árazási struktúra bővítés" lépés -- a korábbi 3-kártyás (Starter/Pro/
 * +10 Autó) elrendezés helyett:**
 *   1) 4 ELŐFIZETÉSI csomag: Starter (20 vizsgálat / 6 AI-kredit havonta), Growth (ÚJ, 35
 *      vizsgálat / 14 AI-kredit), Pro (50 vizsgálat / 25 AI-kredit -- az AI-keret
 *      TUDATOSAN kevesebb, mint a vizsgálati keret MINDEN csomagnál, hogy ne lehessen az
 *      összes vizsgálatot AI-val elvégezni, lásd a felhasználóval egyeztetett
 *      "scarcity by design" elvet), Business (ÚJ, gyakorlatban korlátlan vizsgálat + 100
 *      AI-kredit, EGYEDI ártárgyalás -- kapcsolatfelvétel gomb, NEM Stripe Checkout).
 *   2) a "+10 Autó" eseti vizsgálat-Top-up KÜLÖN szekcióban marad (nem előfizetés).
 *   3) ÚJ: "AI-kredit vásárlása" szekció 3 csomaggal (5/15/40 kredit) -- a felhasználó
 *      explicit kérése volt egy ÖNÁLLÓAN vásárolható AI-kredit termék, hogy ha valakinek
 *      elfogy a havi AI-kerete, ne kelljen magasabb csomagra váltania, csak kredit-et
 *      vegyen. "1 AI-kredit = 1 vizsgálat" (a `lib/inspectionAiCredit.ts` "1 AI kredit = 1
 *      vizsgálat" elve alapján, TELJES vizsgálatra vonatkozik, nem egyedi AI-hívásra).
 *
 * Önállóan, kliens-oldalon tölti be a `/api/quotas/summary` adatot (ugyanaz a minta, mint
 * `CreditDashboardModal.tsx`/`HeaderCreditBadge.tsx`) -- MINDEN fül-váltáskor/oldal-
 * betöltéskor friss adatot mutat, nem egy esetlegesen elavult pillanatképet.
 */
export function BillingTab({
  role,
  starterPriceId,
  growthPriceId,
  proPriceId,
  topupPriceId,
  aiTopup5PriceId,
  aiTopup15PriceId,
  aiTopup40PriceId,
  banner,
}: BillingTabProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<QuotaSummarySuccessResponse | null>(null);
  const [checkoutLoadingKey, setCheckoutLoadingKey] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/quotas/summary');
        const json = (await response.json().catch(() => null)) as QuotaSummarySuccessResponse | null;

        if (cancelled) return;

        if (response.ok && json?.success) {
          setData(json);
          setState('ready');
        } else {
          setState('error');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePurchase(priceId: string | null, key: string) {
    if (!priceId) {
      setCheckoutError('Ez a csomag jelenleg nem elérhető -- keress meg minket az aktiváláshoz.');
      return;
    }

    setCheckoutError(null);
    setCheckoutLoadingKey(key);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const json = (await response.json().catch(() => null)) as
        | { success: true; url: string }
        | { success: false; error: string }
        | null;

      if (response.ok && json?.success) {
        window.location.href = json.url;
        return;
      }

      setCheckoutError(json?.success === false ? json.error : 'Nem sikerült elindítani a fizetést.');
    } catch {
      setCheckoutError('Nem sikerült elindítani a fizetést. Ellenőrizd az internetkapcsolatot.');
    } finally {
      setCheckoutLoadingKey(null);
    }
  }

  const currentPlanTier = data?.quota.planTier;

  const plans: PlanCardDef[] = [
    {
      key: 'starter',
      title: 'Starter',
      price: 18990,
      priceSuffix: '/hó',
      priceId: starterPriceId,
      features: ['20 vizsgálat / hó', '6 AI-kredit / hó', 'Publikus ügyfélriport', 'Alap támogatás'],
      isCurrentPlan: currentPlanTier === 'starter',
    },
    {
      key: 'growth',
      title: 'Growth',
      price: 27990,
      priceSuffix: '/hó',
      priceId: growthPriceId,
      features: ['35 vizsgálat / hó', '14 AI-kredit / hó', 'Publikus ügyfélriport', 'Kiemelt támogatás'],
      isCurrentPlan: currentPlanTier === 'growth',
      highlight: true,
    },
    {
      key: 'pro',
      title: 'Pro',
      price: 37990,
      priceSuffix: '/hó',
      priceId: proPriceId,
      features: ['50 vizsgálat / hó', '25 AI-kredit / hó', 'Publikus ügyfélriport', 'Kiemelt támogatás'],
      isCurrentPlan: currentPlanTier === 'pro',
    },
    {
      key: 'business',
      title: 'Business',
      price: null,
      priceSuffix: '',
      priceId: null,
      features: ['Gyakorlatban korlátlan vizsgálat', '100 AI-kredit / hó', 'Dedikált támogatás', 'Egyedi feltételek'],
      isCurrentPlan: currentPlanTier === 'business',
    },
  ];

  const aiPacks: AiPackDef[] = [
    { key: 'ai_topup5', credits: 5, price: 4990, priceId: aiTopup5PriceId },
    { key: 'ai_topup15', credits: 15, price: 12990, priceId: aiTopup15PriceId },
    { key: 'ai_topup40', credits: 40, price: 29990, priceId: aiTopup40PriceId },
  ];

  return (
    <div className="flex flex-col gap-6">
      {banner === 'success' && (
        <div className="rounded-stripe-md border border-green-200 bg-green-50 px-4 py-3 font-sohne text-[13px] text-green-800">
          Sikeres fizetés -- a csomagod/keretkiegészítésed rövidesen aktiválódik (a Stripe visszaigazolása alapján).
        </div>
      )}
      {banner === 'canceled' && (
        <div className="rounded-stripe-md border border-stripe-hairline bg-stripe-canvas-soft px-4 py-3 font-sohne text-[13px] text-stripe-ink-secondary">
          A fizetés megszakadt -- semmi nem történt, bármikor újrapróbálhatod.
        </div>
      )}

      {/* Jelenlegi csomag + hátralévő keret */}
      <div className="rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1 sm:p-8">
        <h2 className="font-sohne text-[15px] font-medium text-stripe-ink">Jelenlegi csomag</h2>

        {state === 'loading' && (
          <div className="mt-4 flex items-center gap-2 font-sohne text-[13px] text-stripe-ink-mute">
            <Loader2 className="h-4 w-4 animate-spin" />
            Egyenleg betöltése…
          </div>
        )}

        {state === 'error' && (
          <p className="mt-4 font-sohne text-[13px] text-red-600">
            Nem sikerült betölteni az előfizetés-adatokat. Próbáld újra később.
          </p>
        )}

        {state === 'ready' && data && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-stripe-canvas-cream px-3 py-1 font-sohne text-[13px] font-medium text-stripe-lemon">
                {PLAN_TIER_LABELS[data.quota.planTier]}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-stripe-md border border-stripe-hairline px-4 py-3">
                <p className="font-sohne text-[12px] font-normal uppercase tracking-wide text-stripe-ink-mute">
                  Hátralévő vizsgálat
                </p>
                <p className="mt-1 font-sohne text-[20px] font-medium tabular-nums text-stripe-ink">
                  {data.quota.monthlyInspectionsRemaining + data.quota.purchasedInspectionsRemaining}
                  <span className="ml-1 font-sohne text-[13px] font-light text-stripe-ink-mute">
                    / {data.quota.monthlyInspectionsLimit} havi
                    {data.quota.purchasedInspectionsRemaining > 0
                      ? ` + ${data.quota.purchasedInspectionsRemaining} Top-up`
                      : ''}
                  </span>
                </p>
              </div>
              <div className="rounded-stripe-md border border-stripe-hairline px-4 py-3">
                <p className="font-sohne text-[12px] font-normal uppercase tracking-wide text-stripe-ink-mute">
                  Hátralévő AI-kredit
                </p>
                <p className="mt-1 flex items-center gap-1 font-sohne text-[20px] font-medium tabular-nums text-stripe-ink">
                  <Zap className="h-4 w-4 text-stripe-primary" />
                  {data.quota.totalAiAvailable}
                  <span className="ml-1 font-sohne text-[13px] font-light text-stripe-ink-mute">
                    / {data.quota.monthlyAiLimit} havi
                    {data.quota.purchasedAiRemaining > 0 ? ` + ${data.quota.purchasedAiRemaining} vásárolt` : ''}
                  </span>
                </p>
              </div>
            </div>
            <p className="font-sohne text-[12px] font-light text-stripe-ink-mute">
              1 AI-kredit egy TELJES vizsgálat összes AI-funkcióját fedezi (VIN-szkenneléstől a
              szakvélemény-összefoglalóig).
            </p>
          </div>
        )}
      </div>

      {/* 4 előfizetési csomag-kártya */}
      <div>
        <h2 className="mb-3 font-sohne text-[15px] font-medium text-stripe-ink">Előfizetési csomagok</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <div
              key={plan.key}
              className={`flex flex-col gap-4 rounded-stripe-lg border bg-white p-6 shadow-stripe-1 ${
                plan.highlight ? 'border-stripe-primary ring-1 ring-stripe-primary' : 'border-stripe-hairline'
              }`}
            >
              <div>
                {plan.highlight && (
                  <span className="mb-2 inline-flex items-center rounded-full bg-stripe-primary/10 px-2.5 py-0.5 font-sohne text-[11px] font-medium text-stripe-primary">
                    Legnépszerűbb
                  </span>
                )}
                <h3 className="font-sohne text-[15px] font-medium text-stripe-ink">{plan.title}</h3>
                {plan.price !== null ? (
                  <p className="mt-1 font-sohne text-[24px] font-medium tabular-nums text-stripe-ink">
                    {formatHuf(plan.price)}
                    <span className="font-sohne text-[13px] font-light text-stripe-ink-mute">{plan.priceSuffix}</span>
                  </p>
                ) : (
                  <p className="mt-1 font-sohne text-[20px] font-medium text-stripe-ink">Egyedi ajánlat</p>
                )}
              </div>

              <ul className="flex flex-1 flex-col gap-2">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 font-sohne text-[13px] font-light text-stripe-ink-secondary"
                  >
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stripe-primary" />
                    {feature}
                  </li>
                ))}
              </ul>

              {role === 'manager' ? (
                plan.isCurrentPlan ? (
                  <span className="inline-flex h-9 items-center justify-center rounded-full border border-stripe-hairline font-sohne text-[13px] font-normal text-stripe-ink-mute">
                    Aktív csomag
                  </span>
                ) : plan.key === 'business' ? (
                  <a
                    href="mailto:levente.manyi@buildmysite.hu?subject=Business%20csomag%20-%20egyedi%20aj%C3%A1nlat"
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-stripe-primary px-4 font-sohne text-[13px] font-normal text-stripe-primary transition-colors hover:bg-stripe-primary/5"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Kapcsolatfelvétel
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => handlePurchase(plan.priceId, plan.key)}
                    disabled={checkoutLoadingKey === plan.key || !plan.priceId}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-stripe-primary px-4 font-sohne text-[13px] font-normal text-white transition-colors hover:bg-stripe-primary-deep disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {checkoutLoadingKey === plan.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Váltás erre a csomagra
                  </button>
                )
              ) : (
                <span className="font-sohne text-[12px] font-light text-stripe-ink-mute">
                  Csak a Menedzser vásárolhat/válthat csomagot.
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Extra vizsgálat Top-up */}
      <div>
        <h2 className="mb-3 font-sohne text-[15px] font-medium text-stripe-ink">Extra vizsgálat</h2>
        <div className="flex flex-col gap-4 rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-sohne text-[15px] font-medium text-stripe-ink">+10 vizsgálat csomag</p>
            <p className="mt-1 font-sohne text-[13px] font-light text-stripe-ink-secondary">
              Ha elfogy a havi vizsgálati kereted, egyszeri vásárlással azonnal +10 vizsgálatot kapsz -- nem jár le,
              bármely csomag mellé megvehető.
            </p>
            <p className="mt-2 font-sohne text-[20px] font-medium tabular-nums text-stripe-ink">
              {formatHuf(8500)}
              <span className="font-sohne text-[13px] font-light text-stripe-ink-mute"> / csomag</span>
            </p>
          </div>
          {role === 'manager' ? (
            <button
              type="button"
              onClick={() => handlePurchase(topupPriceId, 'topup10')}
              disabled={checkoutLoadingKey === 'topup10' || !topupPriceId}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-stripe-primary px-5 font-sohne text-[13px] font-normal text-white transition-colors hover:bg-stripe-primary-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checkoutLoadingKey === 'topup10' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Vásárlás
            </button>
          ) : (
            <span className="font-sohne text-[12px] font-light text-stripe-ink-mute">
              Csak a Menedzser vásárolhat.
            </span>
          )}
        </div>
      </div>

      {/* AI-kredit vásárlása -- "1 AI kredit = 1 vizsgálat" */}
      <div>
        <h2 className="mb-1 font-sohne text-[15px] font-medium text-stripe-ink">AI-kredit vásárlása</h2>
        <p className="mb-3 font-sohne text-[13px] font-light text-stripe-ink-secondary">
          Ha elfogy a havi AI-kereted, nem kell csomagot váltanod -- vegyél külön AI-kreditet. 1 AI-kredit egy TELJES
          vizsgálat összes AI-funkcióját fedezi, és nem jár le.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {aiPacks.map((pack) => (
            <div
              key={pack.key}
              className="flex flex-col gap-3 rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1"
            >
              <div className="flex items-center gap-1.5 font-sohne text-[15px] font-medium text-stripe-ink">
                <Zap className="h-4 w-4 text-stripe-primary" />
                {pack.credits} AI-kredit
              </div>
              <p className="font-sohne text-[24px] font-medium tabular-nums text-stripe-ink">
                {formatHuf(pack.price)}
                <span className="font-sohne text-[13px] font-light text-stripe-ink-mute"> / csomag</span>
              </p>
              <p className="font-sohne text-[12px] font-light text-stripe-ink-mute">
                {formatHuf(Math.round(pack.price / pack.credits))} / kredit
              </p>
              {role === 'manager' ? (
                <button
                  type="button"
                  onClick={() => handlePurchase(pack.priceId, pack.key)}
                  disabled={checkoutLoadingKey === pack.key || !pack.priceId}
                  className="mt-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-stripe-primary px-4 font-sohne text-[13px] font-normal text-stripe-primary transition-colors hover:bg-stripe-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checkoutLoadingKey === pack.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Vásárlás
                </button>
              ) : (
                <span className="font-sohne text-[12px] font-light text-stripe-ink-mute">
                  Csak a Menedzser vásárolhat.
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {checkoutError && (
        <p
          role="status"
          className="rounded-stripe-md border border-red-200 bg-red-50 px-4 py-3 font-sohne text-[13px] text-red-700"
        >
          {checkoutError}
        </p>
      )}
    </div>
  );
}
