'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

/**
 * "Global layout & navigáció javítása" lépés -- a korábbi elrendezésben minden
 * wizard-lépés a SAJÁT fehér/sötét kártyájának ALJÁRA rajzolta a Vissza/Tovább gombjait
 * (`border-t border-linear-hairline pt-5` blokk minden `Step*.tsx` alján). Hosszú
 * lépéseknél (pl. Felszereltség, Hibák & Média) ez azt jelentette, hogy a
 * legfontosabb navigációs gombok csak hosszas görgetés UTÁN váltak elérhetővé, és
 * mobilon a gombok pozíciója lépésenként ugrált.
 *
 * Az új megoldás: EGYETLEN, mindig látható, rögzített (`fixed bottom-0`) alsó sáv
 * (lásd `InspectionWizard.tsx` `<div id="wizard-bottom-bar">`), amibe minden lépés a
 * SAJÁT Vissza/Tovább (vagy -- `StepSummary.tsx` esetén -- Vissza/Piszkozat/Publikálás)
 * gombjait React Portal-lal "kiteleportálja". Ez megőrzi, hogy MINDEN lépés a saját
 * validációs logikáját (pl. `hasIncompleteRow`/`hasInvalidDot`) a saját komponensében
 * tartsa -- csak a gombok VIZUÁLIS HELYE változik, a `onClick`/`disabled` logika nem.
 *
 * A portál cél-elemet (`#wizard-bottom-bar`) `document.getElementById`-dal keressük meg
 * -- ez csak kliens-oldalon (`useEffect`) biztonságos, ezért a komponens az első
 * render(ek)en még `null`-t ad vissza, amíg a cél-elem referenciája be nem áll. A
 * cél-div maga MINDIG jelen van a DOM-ban (nem lépés-függő feltétellel renderelve),
 * így a portál tartalma lépésváltáskor sem "villan" -- csak a benne lévő gombok
 * cserélődnek a React re-render során.
 */
export function WizardBottomBarPortal({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(document.getElementById('wizard-bottom-bar'));
  }, []);

  if (!container) return null;
  return createPortal(children, container);
}

interface WizardStepFooterProps {
  /** Ha nincs megadva (pl. az 1. lépésnél, `StepCarInfo.tsx`), a "Vissza" gomb helyén
   * üres hely marad, hogy a "Tovább" gomb mindig a jobb oldalon maradjon. */
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  nextTitle?: string;
}

/**
 * A wizard lépések TÖBBSÉGÉNÉL (a `StepSummary.tsx` kivételével, aminek 3 saját gombja
 * van) ugyanaz az egyszerű Vissza/Tovább pár -- ez a megosztott komponens portál-ba
 * rajzolja ki őket, hogy minden `Step*.tsx`-ben egyetlen sor legyen a hívás, ne
 * duplikálódjon a `fixed`/gombstílus Tailwind-osztály-lista 10 fájlban.
 */
export function WizardStepFooter({ onBack, onNext, nextLabel, nextDisabled, nextTitle }: WizardStepFooterProps) {
  return (
    <WizardBottomBarPortal>
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-11 shrink-0 items-center rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-5 text-[14px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-3"
          >
            Vissza
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        <button
          type="button"
          disabled={nextDisabled}
          onClick={onNext}
          title={nextTitle}
          className="inline-flex h-11 shrink-0 items-center rounded-md bg-linear-primary px-6 text-[14px] font-medium text-white transition-colors hover:bg-linear-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Tovább – {nextLabel}
        </button>
      </div>
    </WizardBottomBarPortal>
  );
}

interface WizardSummaryFooterProps {
  onBack: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  isSubmitting: boolean;
}

/** `StepSummary.tsx` (utolsó lépés) 3 gombos alsó sávja -- ugyanaz a `WizardBottomBarPortal`
 * cél-elem, csak Vissza/Mentés piszkozatként/Publikálás hármassal, betöltés-jelzővel. */
export function WizardSummaryFooter({ onBack, onSaveDraft, onPublish, isSubmitting }: WizardSummaryFooterProps) {
  return (
    <WizardBottomBarPortal>
      <div className="mx-auto flex w-full max-w-3xl flex-col-reverse gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="inline-flex h-11 items-center rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-5 text-[14px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Vissza
        </button>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={isSubmitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-5 text-[14px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Mentés piszkozatként
          </button>
          <button
            type="button"
            onClick={onPublish}
            disabled={isSubmitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-linear-primary px-5 text-[14px] font-medium text-white transition-colors hover:bg-linear-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Vizsgálat befejezése & Publikálás
          </button>
        </div>
      </div>
    </WizardBottomBarPortal>
  );
}
