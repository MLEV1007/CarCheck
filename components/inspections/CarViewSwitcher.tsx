import { CAR_VIEWS, CAR_VIEW_LABEL } from '@/lib/inspections/carViews';
import type { CarPointView } from '@/lib/inspections/carViews';

interface CarViewSwitcherProps {
  view: CarPointView;
  onChange: (view: CarPointView) => void;
  /** `dark` = Linear (Wizard), `light` = BMW (Publikus riport), a BMW-nél a
   * PROJEKT_INSTRUKCIOK.md 4.3 szabálya szerint SZIGORÚAN 0px lekerekítés (`rounded-none`)
   * kötelező minden gombon, a Linear-nél a megszokott `rounded-md`. */
  theme: 'dark' | 'light';
  /** Nézetenkénti rögzített pontszám, kis jelvényként jelenik meg a gomb mellett, hogy
   * a szaki/vevő lássa, melyik nézeten van már rögzített mérés/hiba anélkül, hogy oda
   * kellene váltania. */
  counts?: Partial<Record<CarPointView, number>>;
}

/**
 * Nézetváltó segmented control a `CarViewImage.tsx`-hez (2026-08-17, 2. nekifutás, lásd
 * `lib/inspections/carViews.ts` fájl-JSDoc-ja a teljes előzményért), mindig csak EGY nézet
 * (elöl/bal oldal/hátul/jobb oldal/felül) látszik nagyban a `DamageCanvas.tsx` konténerében, a
 * korábbi, mind az 5 nézetet egy apró kompozit képbe zsúfoló `cars.webp`-vel szemben. Nézetet
 * `view`/`edit` módban EGYARÁNT lehet váltani, csak az ÚJ pont felvétele van `edit`-hez
 * kötve, a nézet közti navigáció nem.
 *
 * Ez a komponens változatlanul az EREDETI (2026-08-03-i, akkor be nem kötött) implementáció,
 * kizárólag az importja mutat MOSTANTÓL a `carViews.ts`-re a korábbi, továbbra is használaton
 * kívüli `carSilhouette.ts` helyett (4 helyett 5 nézet: a Bal/Jobb oldal itt külön nevesített,
 * lásd `carViews.ts`).
 */
export function CarViewSwitcher({ view, onChange, theme, counts }: CarViewSwitcherProps) {
  const wrapClass =
    theme === 'dark'
      ? 'inline-flex w-full gap-1 rounded-lg border border-linear-hairline bg-linear-surface-2 p-1'
      : 'inline-flex w-full gap-1 border border-bmw-hairline bg-bmw-surface-soft p-1';

  return (
    <div className={wrapClass} role="tablist" aria-label="Nézet választása">
      {CAR_VIEWS.map((v) => {
        const active = v === view;
        const count = counts?.[v];
        const buttonClass =
          theme === 'dark'
            ? 'flex-1 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ' +
              (active ? 'bg-linear-primary text-white' : 'text-linear-ink-subtle hover:bg-linear-surface-3 hover:text-linear-ink')
            : 'flex-1 px-2 py-1.5 text-[13px] font-medium transition-colors ' +
              (active ? 'bg-bmw-primary text-white' : 'text-bmw-muted hover:bg-white hover:text-bmw-ink');

        return (
          <button key={v} type="button" role="tab" aria-selected={active} onClick={() => onChange(v)} className={buttonClass}>
            {CAR_VIEW_LABEL[v]}
            {!!count && (
              <span
                className={
                  'ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ' +
                  (active ? 'bg-white/25 text-white' : theme === 'dark' ? 'bg-linear-surface-3 text-linear-ink-subtle' : 'bg-bmw-hairline text-bmw-muted')
                }
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
