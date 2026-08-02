'use client';

import { useEffect, useState } from 'react';
import { Loader2, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTimeHu } from '@/lib/format';
import type { CreditSummarySuccessResponse } from '@/app/api/credits/summary/route';
import type { PlanTier } from '@/types/credits';

interface CreditDashboardModalProps {
  onClose: () => void;
}

/** `plan_tier` -> magyar megjelenítendő címke (PROJEKT_INSTRUKCIOK.md 5.A "Beállítások"
 * -- ez a modul a jövőbeli `/settings` csomag-váltás UI-jának előfutára). */
const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  free: 'Díjmentes fiók',
  starter: 'Starter csomag',
  pro: 'Pro Előfizetés',
  enterprise: 'Enterprise csomag',
};

/** `usage_logs.feature_name` -> magyar, ügyfélnek/szakinak érthető funkció-név -- lásd
 * a `featureName` konstansokat a 4 `/api/ai/*` route-ban (`equipment_parse`/`vin_scan`/
 * `summary_generate`/`grammar_fix`). Ismeretlen (jövőbeli) `feature_name` esetén magát a
 * nyers kódot jelenítjük meg, hogy sose tűnjön el egy sor a táblázatból. */
const FEATURE_NAME_LABELS: Record<string, string> = {
  equipment_parse: 'Felszereltség AI-elemzés',
  vin_scan: 'VIN / Forgalmi szkennelés',
  summary_generate: 'AI szakvélemény-összefoglaló',
  grammar_fix: 'Hangalapú diktálás',
};

function featureLabel(featureName: string): string {
  return FEATURE_NAME_LABELS[featureName] ?? featureName;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Kredit & Előfizetés Dashboard modal -- a `HeaderCreditBadge.tsx`-re kattintva nyílik meg
 * (PROJEKT_INSTRUKCIOK.md "Felhasználói Kredit & Előfizetés Dashboard" lépés). Linear Dark
 * Design Style, mert a badge (és ezzel a modal megnyitása) kizárólag a Szakértői
 * Munkaterület (`/dashboard`, `/inspections/*`) fejléceiben jelenik meg.
 *
 * Önállóan, kliens-oldalon tölti be a `/api/credits/summary` végpontról a friss adatot
 * MINDEN megnyitáskor (nem a badge-től kapott, esetleg már elavult adatot használja) --
 * ez garantálja, hogy egy AI-hívás UTÁN megnyitva mindig a ténylegesen aktuális egyenleg
 * látszik, nem egy oldal-betöltéskori pillanatkép.
 *
 * A "Előfizetés váltása"/"Kredit vásárlása" gombok egyelőre PLACEHOLDER-ek (a felhasználói
 * kérés explicit így specifikálta) -- a tényleges Stripe checkout/customer portal
 * integráció egy KÖVETKEZŐ, külön fejlesztési lépés (lásd `status.md` "Következő lépés").
 */
export function CreditDashboardModal({ onClose }: CreditDashboardModalProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<CreditSummarySuccessResponse | null>(null);
  const [placeholderNotice, setPlaceholderNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/credits/summary');
        const json = (await response.json().catch(() => null)) as CreditSummarySuccessResponse | null;

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

  useEffect(() => {
    if (!placeholderNotice) return;
    const timer = setTimeout(() => setPlaceholderNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [placeholderNotice]);

  function handlePlaceholderClick(action: string) {
    setPlaceholderNotice(`${action} -- a Stripe fizetési integráció hamarosan érkezik.`);
  }

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
                  {PLAN_TIER_LABELS[data.planTier]}
                </span>
              </div>

              {/* Egyenleg Részletezés */}
              <div>
                <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-linear-ink-subtle">
                  Egyenleg részletezés
                </p>
                <div className="flex flex-col gap-1.5 rounded-md border border-linear-hairline px-3.5 py-3">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-linear-ink-subtle">Havi keretből maradt</span>
                    <span className="font-medium text-linear-ink">{data.balance.monthlyCreditsRemaining}</span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-linear-ink-subtle">Vásárolt keretből maradt</span>
                    <span className="font-medium text-linear-ink">{data.balance.purchasedCreditsRemaining}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-linear-hairline pt-1.5 text-[14px]">
                    <span className="font-medium text-linear-ink">Összesen elérhető</span>
                    <span className="flex items-center gap-1 font-semibold text-linear-primary">
                      <Zap className="h-3.5 w-3.5" />
                      {data.balance.totalCreditsAvailable}
                    </span>
                  </div>
                </div>
              </div>

              {/* Megújulás dátuma */}
              {data.balance.creditsResetAt && (
                <p className="text-[12px] text-linear-ink-subtle">
                  A havi keret megújulása:{' '}
                  <span className="font-medium text-linear-ink">
                    {formatDateTimeHu(data.balance.creditsResetAt)}
                  </span>
                </p>
              )}

              {/* AI Használati Előzmények */}
              <div>
                <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-linear-ink-subtle">
                  AI használati előzmények
                </p>
                {data.usageLogs.length === 0 ? (
                  <p className="rounded-md border border-dashed border-linear-hairline px-3.5 py-4 text-center text-[12px] text-linear-ink-subtle">
                    Még nem történt AI-funkció-használat.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-md border border-linear-hairline">
                    <table className="w-full text-left text-[12px]">
                      <thead>
                        <tr className="border-b border-linear-hairline bg-linear-surface-2 text-linear-ink-subtle">
                          <th className="px-3 py-2 font-medium">Dátum</th>
                          <th className="px-3 py-2 font-medium">Funkció</th>
                          <th className="px-3 py-2 text-right font-medium">Levonva</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.usageLogs.map((log) => (
                          <tr key={log.id} className="border-b border-linear-hairline last:border-b-0">
                            <td className="px-3 py-2 text-linear-ink-subtle">
                              {formatDateTimeHu(log.createdAt, true)}
                            </td>
                            <td className="px-3 py-2 text-linear-ink">{featureLabel(log.featureName)}</td>
                            <td className="px-3 py-2 text-right font-medium text-linear-ink">
                              -{log.creditsDeducted}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Gombok (Placeholder) */}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => handlePlaceholderClick('Előfizetés váltása')}
                  className="flex-1 rounded-md border border-linear-hairline px-3.5 py-2 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-2"
                >
                  Előfizetés váltása
                </button>
                <button
                  type="button"
                  onClick={() => handlePlaceholderClick('Kredit vásárlása')}
                  className="flex-1 rounded-md bg-linear-primary px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
                >
                  Kredit vásárlása
                </button>
              </div>

              {placeholderNotice && (
                <p
                  role="status"
                  className={cn(
                    'rounded-md border border-linear-primary/30 bg-linear-primary/10 px-3 py-2 text-center text-[12px] text-linear-primary'
                  )}
                >
                  {placeholderNotice}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
