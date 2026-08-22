'use client';

import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';

interface FeedbackTriggerButtonProps {
  /**
   * `header-icon` -- `DashboardHeader.tsx`-ben, Linear Dark Design Style, KIZÁRÓLAG ikon,
   * SOSE kap szöveges labelt (egyetlen breakpointnál sem). Ez SZÁNDÉKOS: a korábbi,
   * 2026-08-20-án eltávolított Formbricks-kísérlet során egy `lg:`-nél szöveges labellel
   * megjelenő visszajelzés-gomb felborította a fejléc törékeny `lg:`/`xl:`
   * breakpoint-egyensúlyát, és ütközött a középre pozicionált CarPass logóval (lásd
   * `DashboardHeader.tsx` tetején a "Tablet-egymásracsúszás javítás" JSDoc-ot) -- ugyanaz
   * a hiba egy ikon-only gombbal nem reprodukálható, ezért marad ez a variáns örökre
   * csak-ikon.
   *
   * `settings-cta` -- a Beállítások oldalon, Stripe Design System, teljes szövegű pill
   * gomb egy önálló kártyában (lásd `components/settings/FeedbackCard.tsx`).
   */
  variant: 'header-icon' | 'settings-cta';
}

/**
 * A `FeedbackModal.tsx` nyitó/záró állapotát kezelő kliens-komponens -- UGYANAZ a minta,
 * mint `HeaderCreditBadge.tsx`-nél (`isModalOpen` state + feltételes render): a modal csak
 * AKKOR van a DOM-ban, amikor nyitva van, hogy a `useEffect`-jei (Escape-figyelés,
 * auto-close, felhasználó-lekérdezés) ne fussanak feleslegesen a háttérben.
 *
 * Két, egymástól teljesen független helyről nyitható meg UGYANAZ a modal (fejléc ikon +
 * Beállítások CTA-kártya) -- innen a `variant` prop, ami KIZÁRÓLAG a trigger-gomb
 * megjelenését váltja, a `FeedbackModal` maga mindkét esetben azonos.
 */
export function FeedbackTriggerButton({ variant }: FeedbackTriggerButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {variant === 'header-icon' ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Visszajelzés küldése"
          className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-linear-ink-subtle transition-colors hover:bg-linear-surface-1 hover:text-linear-ink lg:h-8 lg:min-w-0"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-full bg-stripe-primary px-4 font-sohne text-[13px] font-normal text-white transition-colors hover:bg-stripe-primary-deep"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Visszajelzés küldése
        </button>
      )}

      {isOpen && <FeedbackModal onClose={() => setIsOpen(false)} />}
    </>
  );
}
