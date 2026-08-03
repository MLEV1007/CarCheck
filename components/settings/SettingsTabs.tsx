'use client';

import { useState, type ReactNode } from 'react';
import { TeamManagement } from '@/components/settings/TeamManagement';

interface SettingsTabsProps {
  role: 'manager' | 'inspector';
  organizationId: string;
  currentUserId: string;
  /** A meglévő "Cégbeállítások" kártyák (`SettingsForm`/`DefaultPreferencesCard`/
   * `PasskeyCard`) -- a szülő (`app/settings/page.tsx`) adja át, hogy a Server Component
   * ott maradjon felelős a kezdeti adatok betöltéséért, ez a komponens csak a fül-váltás
   * kliens-oldali állapotát kezeli. */
  children: ReactNode;
}

/**
 * "Csapatkezelés" fül a Beállítások oldalon (PROJEKT_INSTRUKCIOK.md "Csapatkezelő
 * Felület a Menedzsernek" lépés) -- KIZÁRÓLAG `role === 'manager'`-nek látható, az
 * Átvizsgáló a fül-sáv NÉLKÜL, közvetlenül a meglévő "Cégbeállítások" kártyákat látja
 * (a projektben eddig sem volt fül-mechanizmus, lásd `app/settings/page.tsx` korábbi
 * egyszerű, egymás alatti kártya-elrendezését -- Átvizsgálónak ez VÁLTOZATLAN marad).
 *
 * Stripe design system (stripe.md): `rounded-full` pill tab-gombok, aktív fül
 * `bg-stripe-primary` kitöltéssel, inaktív fül halvány, hairline szegéllyel.
 */
export function SettingsTabs({ role, organizationId, currentUserId, children }: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<'company' | 'team'>('company');

  if (role !== 'manager') {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="inline-flex w-fit items-center gap-1 rounded-full border border-stripe-hairline bg-white p-1 shadow-stripe-1">
        <button
          type="button"
          onClick={() => setActiveTab('company')}
          className={`rounded-full px-4 py-1.5 font-sohne text-[13px] font-normal transition-colors ${
            activeTab === 'company'
              ? 'bg-stripe-primary text-white'
              : 'text-stripe-ink-secondary hover:bg-stripe-canvas-soft'
          }`}
        >
          Cégbeállítások
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('team')}
          className={`rounded-full px-4 py-1.5 font-sohne text-[13px] font-normal transition-colors ${
            activeTab === 'team'
              ? 'bg-stripe-primary text-white'
              : 'text-stripe-ink-secondary hover:bg-stripe-canvas-soft'
          }`}
        >
          Csapatkezelés
        </button>
      </div>

      {activeTab === 'company' ? (
        children
      ) : (
        <TeamManagement organizationId={organizationId} currentUserId={currentUserId} />
      )}
    </div>
  );
}
