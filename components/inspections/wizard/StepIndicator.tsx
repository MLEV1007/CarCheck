import { Check } from 'lucide-react';
import { WIZARD_STEP_META } from '@/lib/inspections/constants';
import type { WizardStep } from '@/lib/inspections/types';

/**
 * Linear design system: kompakt, funkcionális lépés-jelző. Az aktuális lépés
 * `linear-primary` kitöltést kap, a korábbiak pipát, a hátralévők tompított
 * hairline-keretes kört.
 *
 * "Wizard Stepper UI fix" -- 11 lépésnél (a legutóbbi modulok óta) a korábbi
 * `flex-1` egyenlő-elosztásos elrendezés SZÁMOLÁSSAL IGAZOLTAN szétcsúszott/kilógott
 * keskeny (320-400px-es) mobil képernyőkön, még a címkék elrejtésével is. Ehelyett:
 *  - a lépések MINDIG a saját természetes szélességüket foglalják (`shrink-0`, NEM
 *    `flex-1`), a cím SOHA nem törik sorba (`whitespace-nowrap`) és SOHA nem takarja ki
 *    egymást a szomszédos lépés;
 *  - a `nav` `overflow-x-auto`-val VÍZSZINTESEN GÖRGETHETŐ, ha a lépések összesen nem
 *    férnek ki egy sorban -- ez garantáltan törésmentes bármilyen szélességen, a rejtett
 *    natív görgetősávval (`[scrollbar-width:none]`/`[&::-webkit-scrollbar]:hidden`).
 *    **FONTOS (2026-08-02, javítás):** ez a görgethetőség KORÁBBAN csak a legszűkebb
 *    (`< sm`) nézeten volt bekapcsolva -- `sm:overflow-visible`-re váltott utána, ami
 *    azt jelentette, hogy 640px felett (vagyis GYAKORLATILAG MINDEN nem-telefon
 *    képernyőn) a 11 lépés natúr szélessége (jóval szélesebb, mint a `max-w-3xl`
 *    wizard-konténer) egyszerűen KILÓGOTT/túlcsordult a konténer jobb szélén (`overflow-
 *    visible` nem vág, nem görget, csak láthatóan kilógni hagyja a tartalmat) -- a
 *    felhasználó screenshotján pontosan ez látszott. A javítás: a görgethetőség
 *    (`overflow-x-auto` + rejtett scrollbar) MINDEN képernyőméreten aktív marad, a
 *    lépések SOHA nem törhetnek ki a konténer szélessége fölé, csak (ha kell)
 *    vízszintesen görgethetők maradnak belül.
 *  - emellett az `InspectionWizard.tsx` a lépés-tartalom felett egy kompakt, mindig
 *    látható "X / 11 lépés · Cím" szöveges visszajelzőt is mutat mobilon.
 */
export function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <nav aria-label="Vizsgálati lépések" className="w-full min-w-0">
      <ol
        className={
          'flex w-full min-w-0 items-center gap-1.5 overflow-x-auto pb-1 sm:gap-3 ' +
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        }
      >
        {WIZARD_STEP_META.map(({ step, shortLabel }, index) => {
          const isDone = step < current;
          const isActive = step === current;
          return (
            <li key={step} className="flex shrink-0 items-center gap-1.5 sm:gap-3">
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <span
                  className={
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors sm:h-7 sm:w-7 sm:text-[12px] ' +
                    (isActive
                      ? 'bg-linear-primary text-white'
                      : isDone
                        ? 'bg-linear-success/15 text-linear-success'
                        : 'border border-linear-hairline-strong bg-linear-surface-1 text-linear-ink-subtle')
                  }
                >
                  {isDone ? <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : step}
                </span>
                <span
                  className={
                    'whitespace-nowrap text-[12px] font-medium sm:text-[13px] ' +
                    (isActive ? 'text-linear-ink' : 'text-linear-ink-subtle')
                  }
                >
                  {shortLabel}
                </span>
              </div>
              {index < WIZARD_STEP_META.length - 1 && (
                <div
                  className={'h-px w-6 shrink-0 sm:w-8 ' + (isDone ? 'bg-linear-success/30' : 'bg-linear-hairline')}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
