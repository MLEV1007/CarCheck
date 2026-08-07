'use client';

import { useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { TeamManagement } from '@/components/settings/TeamManagement';
import { BillingTab } from '@/components/settings/BillingTab';

type SettingsTabKey = 'company' | 'team' | 'billing';

interface SettingsTabsProps {
  role: 'manager' | 'inspector';
  organizationId: string;
  currentUserId: string;
  /** Platform Admin entitlement (2026-08-03, "Platform Admin + Csapatkezelés-
   * entitlement" lépés) -- az üzemeltető (`/admin`) engedélyezi ügyfelenként
   * (`organizations.team_management_enabled`). `false` esetén a fül LÁTSZIK (a
   * Menedzser tudja, hogy a funkció létezik), de zárolt állapotot mutat a tényleges
   * csapattag-lista/meghívás helyett. */
  teamManagementEnabled: boolean;
  /** Melyik fül legyen kezdetben aktív -- `app/settings/billing/page.tsx` (a Stripe
   * Checkout `success_url`/`cancel_url` célja) ezt `'billing'`-re állítja, hogy a
   * fizetésből visszatérő Menedzser rögtön az Előfizetés fület lássa, ne a
   * Cégbeállításokat. Alapértelmezetten `'company'` (lásd `app/settings/page.tsx`). */
  initialTab?: SettingsTabKey;
  /** Az "Előfizetés" fül Stripe Price ID-jai + a Checkout után visszairányított
   * success/canceled banner -- lásd `components/settings/BillingTab.tsx` JSDoc-ját.
   * `growthPriceId` + a 3 AI-kredit-csomag ár (2026-08-06, "Árazási struktúra bővítés"
   * lépés) -- a `business` tier szándékosan nem kap price ID-t (egyedi ajánlat). */
  starterPriceId: string | null;
  growthPriceId: string | null;
  proPriceId: string | null;
  /** Éves Price ID-k -- lásd `components/settings/BillingTab.tsx` JSDoc-ját (2026-08-07,
   * "Havi/éves kapcsoló" lépés). */
  starterYearlyPriceId: string | null;
  growthYearlyPriceId: string | null;
  proYearlyPriceId: string | null;
  topupPriceId: string | null;
  aiTopup5PriceId: string | null;
  aiTopup15PriceId: string | null;
  aiTopup40PriceId: string | null;
  billingBanner: 'success' | 'canceled' | null;
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
export function SettingsTabs({
  role,
  organizationId,
  currentUserId,
  teamManagementEnabled,
  initialTab = 'company',
  starterPriceId,
  growthPriceId,
  proPriceId,
  starterYearlyPriceId,
  growthYearlyPriceId,
  proYearlyPriceId,
  topupPriceId,
  aiTopup5PriceId,
  aiTopup15PriceId,
  aiTopup40PriceId,
  billingBanner,
  children,
}: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(initialTab);

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
        <button
          type="button"
          onClick={() => setActiveTab('billing')}
          className={`rounded-full px-4 py-1.5 font-sohne text-[13px] font-normal transition-colors ${
            activeTab === 'billing'
              ? 'bg-stripe-primary text-white'
              : 'text-stripe-ink-secondary hover:bg-stripe-canvas-soft'
          }`}
        >
          Előfizetés
        </button>
      </div>

      {activeTab === 'company' && children}
      {activeTab === 'team' &&
        (teamManagementEnabled ? (
          <TeamManagement organizationId={organizationId} currentUserId={currentUserId} />
        ) : (
          <TeamManagementLocked />
        ))}
      {activeTab === 'billing' && (
        <BillingTab
          role={role}
          starterPriceId={starterPriceId}
          growthPriceId={growthPriceId}
          proPriceId={proPriceId}
          starterYearlyPriceId={starterYearlyPriceId}
          growthYearlyPriceId={growthYearlyPriceId}
          proYearlyPriceId={proYearlyPriceId}
          topupPriceId={topupPriceId}
          aiTopup5PriceId={aiTopup5PriceId}
          aiTopup15PriceId={aiTopup15PriceId}
          aiTopup40PriceId={aiTopup40PriceId}
          banner={billingBanner}
        />
      )}
    </div>
  );
}

/** Zárolt állapot, ha az üzemeltető MÉG NEM engedélyezte a csapatkezelést ennek a
 * szervezetnek (`team_management_enabled = false`, lásd fent) -- a Menedzser lássa,
 * hogy a funkció LÉTEZIK (nem tűnik el nyomtalanul), de ne tudja használni. */
function TeamManagementLocked() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-stripe-lg border border-stripe-hairline bg-white p-10 text-center shadow-stripe-1">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-stripe-canvas-soft">
        <Lock className="h-5 w-5 text-stripe-ink-mute" />
      </div>
      <p className="font-sohne text-[15px] font-medium text-stripe-ink">A Csapatkezelés még nincs engedélyezve</p>
      <p className="max-w-sm font-sohne text-[13px] font-light text-stripe-ink-mute">
        Ez a funkció csomag-bővítéssel érhető el. Vedd fel a kapcsolatot velünk, ha
        szeretnéd, hogy Átvizsgáló csapattagokat is meghívhass a fiókodhoz.
      </p>
    </div>
  );
}
