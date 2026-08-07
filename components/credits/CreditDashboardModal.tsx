'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, X, Zap } from 'lucide-react';
import type { QuotaSummarySuccessResponse } from '@/app/api/quotas/summary/route';
import type { QuotaPlanTier } from '@/types/quotas';

interface CreditDashboardModalProps {
  onClose: () => void;
}

/** `plan_tier` -> magyar megjelenítendő címke -- 2026-08-06, "Árazási struktúra bővítés"
 * lépés óta a `QuotaPlanTier`-t követi (`starter`/`growth`/`pro`/`business`), NEM a régi,
 * elavult `PlanTier`-t (`free`/`starter`/`pro`/`enterprise`, `types/credits.ts`), lásd a
 * fájl-JSDoc "KRITIKUS hibajavítás" szakaszát. */
const PLAN_TIER_LABELS: Record<QuotaPlanTier, string> = {
  starter: 'Egyéni csomag',
  growth: 'Műhely / Kereskedői csomag',
  pro: 'Profi csomag',
  business: 'Autóház csomag',
};

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Kredit & Előfizetés Dashboard modal -- a `HeaderCreditBadge.tsx`-re kattintva nyílik meg
 * (PROJEKT_INSTRUKCIOK.md "Felhasználói Kredit & Előfizetés Dashboard" lépés). Linear Dark
 * Design Style, mert a badge (és ezzel a modal megnyitása) kizárólag a Szakértői
 * Munkaterület (`/dashboard`, `/inspections/*`) fejléceiben jelenik meg.
 *
 * **2026-08-06, "AI kredit kijelzés javítása" lépés -- KRITIKUS hibajavítás:** korábban a
 * `/api/credits/summary` (régi, `user_credits.monthly_credits_remaining`/`profiles.
 * plan_tier` alapú) végpontról töltötte az adatot -- élő adatban megerősítve, hogy ez a
 * felület egy fizető Starter ügyfélnek "Díjmentes fiók"-ot ÉS egy a valós csomagtól
 * teljesen független kredit-számot mutatott (a `profiles.plan_tier` sosem frissül a
 * Stripe-vásárláskor, az csak `user_credits.plan_tier`-t írja). Mostantól a
 * `/api/quotas/summary` (a TÉNYLEGES, Stripe-vásárlás által frissített forrás) adatait
 * mutatja, UGYANAZT a két számot (hátralévő vizsgálat + hátralévő AI-kredit), mint a
 * Beállítások > Előfizetés oldal "Jelenlegi csomag" kártyája -- a korábbi "AI használati
 * előzmények" táblázat (a régi, hívásonkénti `usage_logs` audit alapján) eltávolítva,
 * mert 2026-08-06 óta (lásd `lib/inspectionAiCredit.ts` "1 AI kredit = 1 vizsgálat")
 * ehelyett a "1 AI kredit = 1 vizsgálat" elv érvényes: nem AI-HÍVÁSONKÉNT, hanem
 * VIZSGÁLATONKÉNT fogy 1 kredit, a régi, hívásonkénti napló ezért félrevezető lenne.
 *
 * Önállóan, kliens-oldalon tölti be a `/api/quotas/summary` végpontról a friss adatot
 * MINDEN megnyitáskor (nem a badge-től kapott, esetleg már elavult adatot használja) --
 * ez garantálja, hogy egy AI-hívás UTÁN megnyitva mindig a ténylegesen aktuális egyenleg
 * látszik, nem egy oldal-betöltéskori pillanatkép.
 *
 * A "Előfizetés kezelése" gomb a `/settings/billing` oldalra visz (`app/settings/billing/
 * page.tsx` + `components/settings/BillingTab.tsx`), ahol a Menedzser ténylegesen
 * válthat csomagot/vásárolhat Top-up-ot vagy AI-kredit csomagot. Ez a modal MAGA nem
 * hívja a Stripe checkout API-t közvetlenül, csak átirányít a felületre.
 */
export function CreditDashboardModal({ onClose }: CreditDashboardModalProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<QuotaSummarySuccessResponse | null>(null);

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

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
      role="presentation"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Kredit és előfizetés áttekintés"
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg border border-linear-hairline bg-linear-surface-1 shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-linear-hairline px-5 py-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-linear-primary" />
            <p className="text-[15px] font-semibold text-linear-ink">Kredit & Előfizetés</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Bezárás"
            className="rounded-md p-1 text-linear-ink-subtle transition-colors hover:bg-linear-surface-2 hover:text-linear-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state === 'loading' && (
            <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-linear-ink-subtle">
              <Loader2 className="h-4 w-4 animate-spin" />
              Egyenleg betöltése…
            </div>
          )}

          {state === 'error' && (
            <div className="rounded-md border border-linear-danger/30 bg-linear-danger-soft px-3 py-3 text-[13px] text-linear-danger">
              Nem sikerült betölteni a kredit-adatokat. Próbáld újra később.
            </div>
          )}

          {state === 'ready' && data && (
            <div className="flex flex-col gap-5">
              {/* Csomag Státusz */}
              <div className="flex items-center justify-between rounded-md border border-linear-hairline bg-linear-surface-2 px-3.5 py-3">
                <span className="text-[12px] font-medium uppercase tracking-wide text-linear-ink-subtle">
                  Csomag státusz
                </span>
                <span className="text-[13px] font-semibold text-linear-ink">
                  {PLAN_TIER_LABELS[data.quota.planTier]}
                </span>
              </div>

              {/* Vizsgálati keret */}
              <div>
                <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-linear-ink-subtle">
                  Vizsgálati keret
                </p>
                <div className="flex flex-col gap-1.5 rounded-md border border-linear-hairline px-3.5 py-3">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-linear-ink-subtle">Havi keretből maradt</span>
                    <span className="font-medium text-linear-ink">
                      {data.quota.monthlyInspectionsRemaining} / {data.quota.monthlyInspectionsLimit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-linear-ink-subtle">Vásárolt (extra) keretből maradt</span>
                    <span className="font-medium text-linear-ink">{data.quota.purchasedInspectionsRemaining}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-linear-hairline pt-1.5 text-[14px]">
                    <span className="font-medium text-linear-ink">Összesen elérhető</span>
                    <span className="font-semibold text-linear-ink">{data.quota.totalInspectionsAvailable}</span>
                  </div>
                </div>
              </div>

              {/* AI kredit keret -- "1 AI kredit = 1 vizsgálat" (2026-08-06) */}
              <div>
                <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-linear-ink-subtle">
                  AI kredit keret
                </p>
                <div className="flex flex-col gap-1.5 rounded-md border border-linear-hairline px-3.5 py-3">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-linear-ink-subtle">Havi keretből maradt</span>
                    <span className="font-medium text-linear-ink">
                      {data.quota.monthlyAiRemaining} / {data.quota.monthlyAiLimit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-linear-ink-subtle">Vásárolt AI-kreditből maradt</span>
                    <span className="font-medium text-linear-ink">{data.quota.purchasedAiRemaining}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-linear-hairline pt-1.5 text-[14px]">
                    <span className="font-medium text-linear-ink">Összesen elérhető</span>
                    <span className="flex items-center gap-1 font-semibold text-linear-primary">
                      <Zap className="h-3.5 w-3.5" />
                      {data.quota.totalAiAvailable}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-linear-ink-subtle">
                  1 AI-kredit egy TELJES vizsgálat összes AI-funkcióját fedezi (VIN-szkenneléstől a
                  szakvélemény-összefoglalóig) -- nem hívásonként fogy.
                </p>
              </div>

              {/* Előfizetés/Top-up -- valódi link a Billing felületre (2026-08-04-től) */}
              <Link
                href="/settings/billing"
                onClick={onClose}
                className="flex h-9 items-center justify-center rounded-md bg-linear-primary px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
              >
                Előfizetés / Keret kezelése
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
