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
 * **Csak ikon, minden töréspontnál (2026-08-20, "navbar szétcsúszás" javítás):** a
 * `HeaderCreditBadge.tsx` "X vizsgálat" / "Y AI kredit" feliratai NEM töréspont-függők
 * (mindig teljes szöveggel jelennek meg), így a jobb oldali fejléc-tartalom már ezek
 * nélkül is elég széles `lg:`--`xl:` között. Egy újabb, `lg:`-nél szöveges labellel
 * megjelenő elem (mint korábban ez a gomb) pont ezen a sávon billentette át a
 * fejlécet a `DashboardHeader.tsx` tetején leírt, gondosan hangolt `lg:`/`xl:`
 * egyensúlyt -- a középső logó (`xl:` only) rácsúszott/összecsúszott a jobb oldali
 * tartalommal. Javítás: ez a gomb szándékosan NEM kap szöveges labelt egyetlen
 * töréspontnál sem (a `Beállítások` linktől eltérően), így a lábnyoma állandóan
 * minimális marad -- az `aria-label`/`title` továbbra is biztosítja a
 * hozzáférhetőséget és a felfedezhetőséget.
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
      title="Hiba bejelentése vagy javaslat küldése"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-linear-ink-subtle transition-colors hover:bg-linear-surface-1 hover:text-linear-ink lg:h-8 lg:w-8"
    >
      <MessageSquarePlus className="h-4 w-4" />
    </button>
  );
}
