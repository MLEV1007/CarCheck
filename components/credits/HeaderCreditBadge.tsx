'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, CreditCard, Zap } from 'lucide-react';
import { CreditDashboardModal } from '@/components/credits/CreditDashboardModal';

type LoadState = 'loading' | 'ready' | 'error';

/** A jelvényhez ténylegesen szükséges 2 összesített szám -- lásd `types/quotas.ts`
 * `QuotaBalance` teljes alakját, itt csak a header-jelvényekhez kellő mezőket tartjuk
 * state-ben (nem a teljes objektumot, mert a `CreditDashboardModal` a saját, önálló
 * `/api/quotas/summary` hívásával tölti be a részletes bontást). */
interface HeaderQuotaSummary {
  totalAiAvailable: number;
  totalInspectionsAvailable: number;
}

/**
 * Fejléc kredit-jelvény (PROJEKT_INSTRUKCIOK.md "Felhasználói Kredit & Előfizetés
 * Dashboard" lépés) -- `⚡ [X] AI kredit` gomb a Szakértői Munkaterület (Linear Dark
 * Design Style) fejléceiben (`DashboardHeader.tsx`, `/inspections/new`, `/inspections/[id]`
 * piszkozat-szerkesztő fejléce). Kattintásra megnyitja a `CreditDashboardModal`-t.
 *
 * **2026-08-06, "AI kredit kijelzés javítása" lépés -- KRITIKUS hibajavítás:** korábban
 * a `/api/credits/summary` (régi, `user_credits.monthly_credits_remaining`/
 * `purchased_credits_remaining` alapú) végpontról töltötte az egyenleget -- élő adatban
 * megerősítve, hogy ez a szám TELJESEN FÜGGETLEN a valódi, Stripe-csomaghoz kötött AI-
 * kerettől (`monthly_ai_remaining`, amit a `/settings/billing` oldal mutat): egy fizető
 * Starter ügyfélnél a badge egy VÉLETLENSZERŰ, korábbi manuális teszt-feltöltésből
 * származó számot (pl. "95 AI kredit") mutatott, miközben az Előfizetés oldal helyesen
 * "2/3 AI-hívás"-t jelzett ugyanannak a szervezetnek -- két, egymásnak ellentmondó szám
 * ugyanarról a dologról. Mostantól a `/api/quotas/summary` (a TÉNYLEGES, Stripe-vásárlás
 * által frissített forrás, lásd `lib/quotas.ts`) `quota.totalAiAvailable`-jét mutatja
 * (havi + vásárolt AI-kredit összesen) -- UGYANAZ a szám, mint amit a Beállítások >
 * Előfizetés oldal "Hátralévő AI-hívás" kártyája mutat.
 *
 * **Szándékosan ÖNÁLLÓAN, kliens-oldalon tölti be** az egyenleget (`useEffect`,
 * mount-kor), NEM egy Server Component-től kapott prop-ként -- ez a projekt eddigi
 * SSR-first adatlekérési konvenciójától (lásd pl. `DashboardHeader` props-ai, amiket
 * `app/dashboard/page.tsx` tölt be szerver-oldalon) tudatos eltérés: a badge 3 KÜLÖNBÖZŐ,
 * egymástól független Server Component oldal fejlécében jelenik meg (Dashboard, Új
 * vizsgálat, Piszkozat-szerkesztő), és mindegyiknek külön kellene lekérdeznie+átadnia az
 * egyenleget prop-drilling-gel -- egyetlen, önmagát ellátó kliens-komponensként
 * újrafelhasználva ez a duplikáció elkerülhető. A `lib/quotas.ts` maga NEM hívható
 * közvetlenül kliens-komponensből (a `next/headers`-re épülő szerver-oldali Supabase
 * klienst használja), ezért a `/api/quotas/summary` REST végpont a hídelem.
 *
 * **Ismert, dokumentált korlát:** a badge egyszer, mountkor tölti be az egyenleget --
 * NEM frissül élőben, ha UGYANAZON az oldalon (pl. a wizardban) egy AI-hívás közben
 * kredit fogy el. Egy oldal-navigáció (pl. vissza a dashboardra) mindig friss adatot
 * mutat. Élő, hívás-utáni frissítés (pl. egy globális kredit-state/event-bus) egy
 * KÖVETKEZŐ finomítási lépés, ha a felhasználói visszajelzés ezt indokolja.
 *
 * Betöltési hiba esetén CSENDBEN `null`-t rendereli -- egy hibás/félrevezető számot mutató
 * jelvény rosszabb UX, mint egy hiányzó jelvény.
 *
 * **"Előfizetés" gomb a jelvény BAL oldalán (2026-08-04):** közvetlen link a
 * `/settings/billing` oldalra (`components/settings/BillingTab.tsx`) -- korábban az
 * előfizetés/keret-kezelő felület KIZÁRÓLAG a jelvényre kattintva megnyíló
 * `CreditDashboardModal.tsx` "Előfizetés / Keret kezelése" linkjén keresztül volt
 * elérhető (2 kattintás); ez a gomb egy MÁSODIK, közvetlen útvonalat ad ugyanoda (1
 * kattintás), hogy MINDKÉT helyről (a jelvény mellől ÉS a modalból) elérhető legyen a
 * felület. Ugyanaz a szerepkör-gate vonatkozik rá, mint magára a `HeaderCreditBadge`-re
 * (a hívó oldal -- `DashboardHeader.tsx`/`app/inspections/new/page.tsx`/
 * `app/inspections/[id]/page.tsx` -- eleve csak Menedzsernek renderel egyet).
 *
 * **Hátralévő vizsgálati keret jelvény (2026-08-06):** az AI kredit jelvény MELLETT
 * (attól balra) egy második, `ClipboardCheck` ikonos jelvény mutatja a szervezet
 * hátralévő VIZSGÁLATI keretét (`quota.totalInspectionsAvailable` -- havi + vásárolt
 * Top-up összesen, UGYANAZ a szám, mint a `CreditDashboardModal.tsx` "Vizsgálati keret"
 * kártyájának "Összesen elérhető" sora). Ugyanabból az egyetlen `/api/quotas/summary`
 * hívásból származik, mint az AI-kredit szám -- nincs külön hálózati kérés hozzá.
 * Kattintásra UGYANAZT a `CreditDashboardModal`-t nyitja meg, mint az AI-kredit
 * jelvény (mindkét szám ott, egy helyen, részletesen is megjelenik).
 */
export function HeaderCreditBadge() {
  const [state, setState] = useState<LoadState>('loading');
  const [quota, setQuota] = useState<HeaderQuotaSummary | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/quotas/summary');
        const json = (await response.json().catch(() => null)) as
          | { success: true; quota: HeaderQuotaSummary }
          | { success: false }
          | null;

        if (cancelled) return;

        if (response.ok && json?.success) {
          setQuota({
            totalAiAvailable: json.quota.totalAiAvailable,
            totalInspectionsAvailable: json.quota.totalInspectionsAvailable,
          });
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

  if (state === 'error') return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <Link
        href="/settings/billing"
        className="hidden h-8 shrink-0 items-center gap-1.5 rounded-md border border-linear-hairline px-3 text-[13px] font-medium text-linear-ink-subtle transition-colors hover:bg-linear-surface-2 hover:text-linear-ink sm:inline-flex"
        aria-label="Ugrás az Előfizetés oldalra"
      >
        <CreditCard className="h-3.5 w-3.5" />
        <span>Előfizetés</span>
      </Link>

      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        disabled={state === 'loading'}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-linear-hairline bg-linear-surface-2 px-2 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-3 disabled:cursor-wait disabled:opacity-70 sm:gap-1.5 sm:px-3"
        aria-label="Hátralévő vizsgálati keret -- kattints a részletekért"
      >
        <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-linear-primary" />
        <span className="whitespace-nowrap">{state === 'loading' ? '…' : quota?.totalInspectionsAvailable} vizsgálat</span>
      </button>

      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        disabled={state === 'loading'}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-linear-hairline bg-linear-surface-2 px-2 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-3 disabled:cursor-wait disabled:opacity-70 sm:gap-1.5 sm:px-3"
        aria-label="AI kredit egyenleg -- kattints a részletekért"
      >
        <Zap className="h-3.5 w-3.5 shrink-0 text-linear-primary" />
        <span className="whitespace-nowrap">{state === 'loading' ? '…' : quota?.totalAiAvailable} AI kredit</span>
      </button>

      {isModalOpen && <CreditDashboardModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
}
