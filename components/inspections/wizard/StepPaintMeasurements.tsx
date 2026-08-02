'use client';

import { getOverallPaintAverage, getPaintStatus } from '@/lib/inspections/constants';
import { PaintCanvas } from '@/components/inspections/PaintCanvas';
import { PaintStatusBadge } from '@/components/inspections/wizard/PaintStatusBadge';
import { WizardStepFooter } from '@/components/inspections/wizard/WizardBottomBar';
import type { PaintPointState } from '@/lib/inspections/types';

interface StepPaintMeasurementsProps {
  value: PaintPointState[];
  onChange: (value: PaintPointState[]) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
}

/**
 * LÉPÉS -- Rétegvastagság-mérő "Szabadkézi" (Free-form Canvas) modul
 * (PROJEKT_INSTRUKCIOK.md, "Rétegvastagság-mérő Szabadkézi (Free-form Canvas)
 * átalakítása" lépés). NINCS előre definiált karosszéria-elem -- a felhasználó a kép
 * TETSZŐLEGES pontjára kattinthat, hogy ott felvegyen egy mérési pontot (`PaintCanvas`,
 * `mode="edit"`). Egy meglévő, színes buborékra kattintva a pont módosítható vagy
 * törölhető. A lépés tetején egy kiemelt kártya mutatja a TELJES AUTÓ ÁTLAGÁT (az
 * összes felvett pont egyszerű matematikai átlaga) és a felvett pontok számát.
 */
export function StepPaintMeasurements({ value, onChange, onBack, onNext, nextLabel }: StepPaintMeasurementsProps) {
  const overallAverage = getOverallPaintAverage(value);
  const overallStatus = overallAverage !== null ? getPaintStatus(overallAverage) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Festékvastagság-mérés</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Kattints az autó-képen BÁRHOVA egy mérési pont (µm) felvételéhez -- nincs előre
          megadott elem, szabadon annyi pontot vehetsz fel, amennyire szükséged van. Egy
          meglévő buborékra kattintva módosíthatod az értékét, vagy törölheted a pontot.
          Státusz: 80–150 µm Gyári, 151–250 µm Újrafújt / Javított, 250 µm felett Gittelt
          / Sérült.
        </p>
      </div>

      {/* Kiemelt összefoglaló kártya -- TELJES AUTÓ ÁTLAGA. */}
      <div className="flex flex-col gap-3 rounded-lg border border-linear-hairline-strong bg-linear-surface-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.5px] text-linear-ink-subtle">
            Teljes autó átlaga
          </p>
          <p className="mt-1 text-[28px] font-semibold tabular-nums text-linear-ink">
            {overallAverage !== null ? overallAverage : '—'}
            {overallAverage !== null && <span className="ml-1 text-[16px] font-normal text-linear-ink-subtle">µm</span>}
          </p>
          <p className="mt-0.5 text-[12px] text-linear-ink-subtle">{value.length} pont mérve</p>
        </div>
        {overallStatus && <PaintStatusBadge status={overallStatus} />}
      </div>

      <PaintCanvas points={value} mode="edit" onChange={onChange} theme="dark" />

      <WizardStepFooter onBack={onBack} onNext={onNext} nextLabel={nextLabel} />
    </div>
  );
}
