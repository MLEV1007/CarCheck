import { Check } from 'lucide-react';
import { WIZARD_STEP_META } from '@/lib/inspections/constants';
import type { WizardStep } from '@/lib/inspections/types';

/**
 * Linear design system: kompakt, funkcionális lépés-jelző. Az aktuális lépés
 * `linear-primary` kitöltést kap, a korábbiak pipát, a hátralévők tompított
 * hairline-keretes kört.
 *
 * "Wizard Stepper UI fix" -- 8 lépésnél (3 új szakértői modul óta) a korábbi
 * `flex-1` egyenlő-elosztásos elrendezés SZÁMOLÁSSAL IGAZOLTAN szétcsúszott/kilógott
 * keskeny (320-400px-es) mobil képernyőkön, még a címkék elrejtésével is. Ehelyett:
 *  - a lépések MINDIG a saját természetes szélességüket foglalják (`shrink-0`, NEM
 *    `flex-1`), a cím SOHA nem törik sorba (`whitespace-nowrap`) és SOHA nem takarja ki
 *    egymást a szomszédos lépés;
 *  - a `nav` `overflow-x-auto`-val VÍZSZINTESEN GÖRGETHETŐ, ha a 8 lépés összesen nem
 *    fér ki egy sorban -- ez garantáltan törésmentes bármilyen szélességen, a rejtett
 *    natív görgetősávval (`[scrollbar-width:none]`/`[&::-webkit-scrollbar]:hidden`);
 *  - emellett az `InspectionWizard.tsx` a lépés-tartalom felett egy kompakt, mindig
 *    látható "X / 8 lépés · Cím" szöveges visszajelzőt is mutat mobilon.
 */
export function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <nav aria-label="Vizsgálati lépések">
      <ol
        className={
          'flex items-center gap-1.5 overflow-x-auto pb-1 sm:gap-3 sm:overflow-visible sm:pb-0 ' +
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        }
      >
        {WIZARD_STEP_META.map(({ step, shortLabel }, index) => {
          const isDone = step < current;
          const isActive = step === current;
          return (
            <li key={step} className="flex shrink-0 items-center gap-1.5 sm:flex-1 sm:gap-3">
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
                  className={
                    'h-px w-6 shrink-0 sm:w-auto sm:flex-1 ' + (isDone ? 'bg-linear-success/30' : 'bg-linear-hairline')
                  }
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
