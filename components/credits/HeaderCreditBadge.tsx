'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, Zap } from 'lucide-react';
import { CreditDashboardModal } from '@/components/credits/CreditDashboardModal';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Fejléc kredit-jelvény (PROJEKT_INSTRUKCIOK.md "Felhasználói Kredit & Előfizetés
 * Dashboard" lépés) -- `⚡ [X] AI kredit` gomb a Szakértői Munkaterület (Linear Dark
 * Design Style) fejléceiben (`DashboardHeader.tsx`, `/inspections/new`, `/inspections/[id]`
 * piszkozat-szerkesztő fejléce). Kattintásra megnyitja a `CreditDashboardModal`-t.
 *
 * **Szándékosan ÖNÁLLÓAN, kliens-oldalon tölti be** az egyenleget a `/api/credits/summary`
 * végpontról (`useEffect`, mount-kor), NEM egy Server Component-től kapott prop-ként --
 * ez a projekt eddigi SSR-first adatlekérési konvenciójától (lásd pl. `DashboardHeader`
 * props-ai, amiket `app/dashboard/page.tsx` tölt be szerver-oldalon) tudatos eltérés: a
 * badge 3 KÜLÖNBÖZŐ, egymástól független Server Component oldal fejlécében jelenik meg
 * (Dashboard, Új vizsgálat, Piszkozat-szerkesztő), és mindegyiknek külön kellene
 * lekérdeznie+átadnia az egyenleget prop-drilling-gel -- egyetlen, önmagát ellátó kliens-
 * komponensként újrafelhasználva ez a duplikáció (és a jövőbeli 4. felhasználási hely
 * hozzáadásakor felmerülő módosítási felület) elkerülhető. A `lib/credits.ts` maga NEM
 * hívható közvetlenül kliens-komponensből (a `next/headers`-re épülő szerver-oldali
 * Supabase klienst használja), ezért a `/api/credits/summary` REST végpont a hídelem.
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
 */
export function HeaderCreditBadge() {
  const [state, setState] = useState<LoadState>('loading');
  const [totalCredits, setTotalCredits] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/credits/summary');
        const json = (await response.json().catch(() => null)) as
          | { success: true; balance: { totalCreditsAvailable: number } }
          | { success: false }
          | null;

        if (cancelled) return;

        if (response.ok && json?.success) {
          setTotalCredits(json.balance.totalCreditsAvailable);
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
    <div className="flex shrink-0 items-center gap-2">
      <Link
        href="/settings/billing"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-linear-hairline px-3 text-[13px] font-medium text-linear-ink-subtle transition-colors hover:bg-linear-surface-2 hover:text-linear-ink"
        aria-label="Ugrás az Előfizetés oldalra"
      >
        <CreditCard className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Előfizetés</span>
      </Link>

      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        disabled={state === 'loading'}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-linear-hairline bg-linear-surface-2 px-3 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-3 disabled:cursor-wait disabled:opacity-70"
        aria-label="AI kredit egyenleg -- kattints a részletekért"
      >
        <Zap className="h-3.5 w-3.5 text-linear-primary" />
        <span>{state === 'loading' ? '…' : totalCredits} AI kredit</span>
      </button>

      {isModalOpen && <CreditDashboardModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
}
