import { TOTAL_WIZARD_STEPS, WIZARD_STEP_META } from '@/lib/inspections/constants';
import type { WizardStep } from '@/lib/inspections/types';

/**
 * Linear design system: lépés-előrehaladás jelző.
 *
 * **Teljes újratervezés (2026-08-02) -- a korábbi kör+címke sor kiváltása vékony
 * progress bar-ral.** A projekt 8, majd 11 lépésre bővült, és a korábbi, minden lépést
 * saját körrel + szöveges címkével kirajzoló "klasszikus stepper" ennyi lépésnél
 * SEMMILYEN fix szélességű konténerbe nem fér ki törésmentesen:
 *  - `overflow-visible`-lel a sor egyszerűen KILÓGOTT a `max-w-3xl` wizard-konténerből
 *    (lásd a korábbi javítási kísérlet screenshotját);
 *  - `overflow-x-auto`-val (rejtett scrollbarral) NEM lógott ki, de a rejtett scrollbar
 *    miatt semmilyen vizuális jel nem utalt arra, hogy van folytatás -- a sor egyszerűen
 *    abrupt módon "levágva" tűnt (pl. "Felszere" közepén), ami zavaróbb volt, mint a
 *    kilógás.
 *
 * A megoldás: NINCS TÖBBÉ lépésenkénti kör/címke lista. Helyette egyetlen vékony,
 * kitöltött sáv mutatja az előrehaladást (`current / TOTAL_WIZARD_STEPS` arányban), fölötte
 * pedig egy mindig látható szöveg ("5. lépés / 11 · Felszereltség állapota") -- ez a minta
 * (Stripe Checkout, Typeform és sok más SaaS hosszú wizard-ja) GARANTÁLTAN nem csúszhat
 * ki és nem törhet el semmilyen képernyőszélességen, mert a sáv szélessége mindig a
 * SZÜLŐ konténerhez igazodik (`w-full`), nincs benne semmilyen tartalom-alapú (natúr
 * szélességű) elem.
 */
export function StepIndicator({ current }: { current: WizardStep }) {
  const currentMeta = WIZARD_STEP_META.find((meta) => meta.step === current);
  const percent = Math.round((current / TOTAL_WIZARD_STEPS) * 100);

  return (
    <div
      className="flex w-full flex-col gap-2"
      role="progressbar"
      aria-label="Vizsgálati folyamat"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={TOTAL_WIZARD_STEPS}
    >
      <p className="text-[13px] font-medium text-linear-ink-subtle">
        <span className="font-semibold text-linear-ink">{current}. lépés</span> / {TOTAL_WIZARD_STEPS}
        {currentMeta && <> · {currentMeta.longLabel}</>}
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-linear-surface-2">
        <div
          className="h-full rounded-full bg-linear-primary transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
