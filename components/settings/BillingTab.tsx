'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Zap } from 'lucide-react';
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
   * hozzá tartozó gomb `disabled` marad, hibaüzenet helyett. */
  starterPriceId: string | null;
  proPriceId: string | null;
  topupPriceId: string | null;
  /** `?success=true`/`?canceled=true` a Stripe Checkout `success_url`/`cancel_url`
   * visszairányításából (lásd `app/api/stripe/checkout/route.ts`) -- a szülő oldal
   * (`app/settings/billing/page.tsx`) olvassa ki a `searchParams`-ból. */
  banner: 'success' | 'canceled' | null;
}

const PLAN_TIER_LABELS: Record<QuotaPlanTier, string> = {
  starter: 'Starter csomag',
  pro: 'Pro Előfizetés',
};

type LoadState = 'loading' | 'ready' | 'error';

interface PlanCardDef {
  key: 'starter' | 'pro' | 'topup10';
  title: string;
  price: number;
  priceSuffix: string;
  priceId: string | null;
  features: string[];
  isCurrentPlan?: boolean;
}

/**
 * Beállítások > Előfizetés (Billing) felület (PROJEKT_INSTRUKCIOK.md "Frontend Fizetési
 * Modal / Billing Felület" lépés, 2026-08-04) -- Stripe design system (`stripe.md`, mert a
 * `/settings` alatti felület, lásd PROJEKT_INSTRUKCIOK.md 4.1 pontja): jelenlegi csomag +
 * hátralévő vizsgálati/AI keret, majd a 3 vásárolható csomag kártyája.
 *
 * Önállóan, kliens-oldalon tölti be a `/api/quotas/summary` adatot (ugyanaz a minta, mint
 * `CreditDashboardModal.tsx`/`HeaderCreditBadge.tsx` a régi kredit-rendszernél) -- MINDEN
 * fül-váltáskor/oldal-betöltéskor friss adatot mutat, nem egy esetlegesen elavult
 * pillanatképet.
 */
export function BillingTab({ role, starterPriceId, proPriceId, topupPriceId, banner }: BillingTabProps) {
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
      features: ['20 vizsgálat / hó', '3 AI-hívás / hó', 'Publikus ügyfélriport', 'Alap támogatás'],
      isCurrentPlan: currentPlanTier === 'starter',
    },
    {
      key: 'pro',
      title: 'Pro',
      price: 37990,
      priceSuffix: '/hó',
      priceId: proPriceId,
      features: ['50 vizsgálat / hó', '50 AI-hívás / hó', 'Publikus ügyfélriport', 'Kiemelt támogatás'],
      isCurrentPlan: currentPlanTier === 'pro',
    },
    {
      key: 'topup10',
      title: '+10 Autó',
      price: 5900,
      priceSuffix: ' / csomag',
      priceId: topupPriceId,
      features: ['10 extra vizsgálat', 'Nem jár le', 'Bármely csomag mellé'],
    },
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
                  Hátralévő AI-hívás
                </p>
                <p className="mt-1 flex items-center gap-1 font-sohne text-[20px] font-medium tabular-nums text-stripe-ink">
                  <Zap className="h-4 w-4 text-stripe-primary" />
                  {data.quota.monthlyAiRemaining}
                  <span className="ml-1 font-sohne text-[13px] font-light text-stripe-ink-mute">
                    / {data.quota.monthlyAiLimit} havi
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3 csomag-kártya */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.key}
            className="flex flex-col gap-4 rounded-stripe-lg border border-stripe-hairline bg-white p-6 shadow-stripe-1"
          >
            <div>
              <h3 className="font-sohne text-[15px] font-medium text-stripe-ink">{plan.title}</h3>
              <p className="mt-1 font-sohne text-[24px] font-medium tabular-nums text-stripe-ink">
                {formatHuf(plan.price)}
                <span className="font-sohne text-[13px] font-light text-stripe-ink-mute">{plan.priceSuffix}</span>
              </p>
            </div>

            <ul className="flex flex-1 flex-col gap-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 font-sohne text-[13px] font-light text-stripe-ink-secondary">
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
              ) : (
                <button
                  type="button"
                  onClick={() => handlePurchase(plan.priceId, plan.key)}
                  disabled={checkoutLoadingKey === plan.key || !plan.priceId}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-stripe-primary px-4 font-sohne text-[13px] font-normal text-white transition-colors hover:bg-stripe-primary-deep disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checkoutLoadingKey === plan.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {plan.key === 'topup10' ? 'Vásárlás' : 'Váltás erre a csomagra'}
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

      {checkoutError && (
        <p role="status" className="rounded-stripe-md border border-red-200 bg-red-50 px-4 py-3 font-sohne text-[13px] text-red-700">
          {checkoutError}
        </p>
      )}
    </div>
  );
}
