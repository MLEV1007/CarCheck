import { Check } from 'lucide-react';
import type { WizardStep } from '@/lib/inspections/types';

const STEPS: { step: WizardStep; label: string }[] = [
  { step: 1, label: 'Autó adatok' },
  { step: 2, label: 'Fotók' },
  { step: 3, label: 'Diagnosztika' },
  { step: 4, label: 'Felszereltség' },
  { step: 5, label: 'Gumiabroncsok' },
  { step: 6, label: 'Festékvastagság' },
  { step: 7, label: 'Hibák & Média' },
  { step: 8, label: 'Összegzés' },
];

/**
 * Linear design system: kompakt, funkcionális lépés-jelző. Az aktuális lépés
 * `linear-primary` kitöltést kap, a korábbiak pipát, a hátralévők tompított
 * hairline-keretes kört -- mobilon a címkék elrejtve, csak a számozott körök
 * és az összekötő vonal marad, hogy kis szélességen is beférjen egy sorba.
 *
 * 8 lépésnél (3 új szakértői modul óta) 320px-en a `gap-2` + `h-7 w-7` körök
 * számszerűen kilógnának a rendelkezésre álló szélességből -- ezért mobilon
 * kisebb kör (`h-6 w-6`) és szűkebb gap (`gap-1`) van, `sm:` felett visszaáll
 * az eredeti, tágasabb méretre.
 */
export function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <ol className="flex items-center gap-1 sm:gap-3">
      {STEPS.map(({ step, label }, index) => {
        const isDone = step < current;
        const isActive = step === current;
        return (
          <li key={step} className="flex flex-1 items-center gap-1 sm:gap-3">
            <div className="flex items-center gap-2">
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
                  'hidden text-[13px] font-medium sm:inline ' +
                  (isActive ? 'text-linear-ink' : 'text-linear-ink-subtle')
                }
              >
                {label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div className={'h-px flex-1 ' + (isDone ? 'bg-linear-success/30' : 'bg-linear-hairline')} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
