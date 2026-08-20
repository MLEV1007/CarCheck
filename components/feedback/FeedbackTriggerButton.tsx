'use client';

import { MessageSquarePlus } from 'lucide-react';

/**
 * Explicit "Visszajelzés" akció a Dashboard fejlécben (2026-08-20, "Formbricks
 * visszajelzés-widget" lépés, lásd docs/formbricks-feedback-widget-elemzes-2026-08-20.md
 * 3.5/5. pontját) -- a Formbricks-oldalon a felmérést "Code Action" trigger-re kell
 * állítani, erre az eseménynévre (`feedback_button_clicked`) kötve, "Page view"/
 * automatikus trigger NÉLKÜL. Ez KIZÁRJA az alapértelmezett, magától megjelenő lebegő
 * gombot, tehát nincs z-index-ütközés a wizard mobil alsó sávjával
 * (`InspectionWizard.tsx`, `z-50, fixed bottom-0`) -- a widget vizuális megjelenése
 * ehelyett 100%-ban ez a Linear design-rendszerű gomb irányítja.
 *
 * Ugyanaz a méret-/label-mintázat, mint a `DashboardHeader.tsx` "Beállítások" linkjén
 * (44x44px érintési célterület < 1024px-en, lásd docs/ux-touch-targets-plan-2026-08-14.md).
 */
export function FeedbackTriggerButton() {
  function handleClick() {
    import('@formbricks/js')
      .then(({ default: formbricks }) => formbricks.track('feedback_button_clicked'))
      .catch((error) => console.error('[Formbricks] track() hiba:', error));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Hiba bejelentése vagy javaslat küldése"
      className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-linear-ink-subtle transition-colors hover:bg-linear-surface-1 hover:text-linear-ink lg:h-8 lg:min-w-0 lg:justify-start lg:px-3"
    >
      <MessageSquarePlus className="h-4 w-4" />
      <span className="hidden lg:inline">Visszajelzés</span>
    </button>
  );
}
