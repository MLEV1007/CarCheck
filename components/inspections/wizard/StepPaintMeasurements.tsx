'use client';

import { DEFAULT_REPORT_THRESHOLDS, getOverallPaintAverage, getPaintStatus } from '@/lib/inspections/constants';
import { PaintCanvas } from '@/components/inspections/PaintCanvas';
import { PaintStatusBadge } from '@/components/inspections/wizard/PaintStatusBadge';
import { WizardStepFooter } from '@/components/inspections/wizard/WizardBottomBar';
import type { PaintPointState, ReportThresholds } from '@/lib/inspections/types';

interface StepPaintMeasurementsProps {
  value: PaintPointState[];
  onChange: (value: PaintPointState[]) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
  /** Riport küszöbértékek (2026-08-07) -- lásd `InspectionWizard.tsx` JSDoc-ját.
   * Alapértéke `DEFAULT_REPORT_THRESHOLDS`, ha a szülő nem adja át. */
  thresholds?: ReportThresholds;
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
export function StepPaintMeasurements({
  value,
  onChange,
  onBack,
  onNext,
  nextLabel,
  thresholds = DEFAULT_REPORT_THRESHOLDS,
}: StepPaintMeasurementsProps) {
  const overallAverage = getOverallPaintAverage(value);
  const overallStatus = overallAverage !== null ? getPaintStatus(overallAverage, thresholds) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Festékvastagság-mérés</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Kattints a képre a mérési pontok (µm) elhelyezéséhez. A meglévő pontokra kattintva
          módosíthatsz vagy törölhetsz. A státuszértékek (Gyári / Újrafújt / Gittelt) a Beállítások
          oldalon megadott dinamikus küszöbértékek alapján jelennek meg
          (Gyári: 0–{thresholds.paintGyariMaxMicron} µm, Újrafújt: {thresholds.paintGyariMaxMicron + 1}–
          {thresholds.paintUjrafujtMaxMicron} µm, Gittelt: {thresholds.paintUjrafujtMaxMicron}+ µm).
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

      <PaintCanvas points={value} mode="edit" onChange={onChange} theme="dark" thresholds={thresholds} />

      <WizardStepFooter onBack={onBack} onNext={onNext} nextLabel={nextLabel} />
    </div>
  );
}
