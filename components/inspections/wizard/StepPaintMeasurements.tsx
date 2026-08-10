'use client';

import { DEFAULT_REPORT_THRESHOLDS } from '@/lib/inspections/constants';
import { PaintCanvas } from '@/components/inspections/PaintCanvas';
import { WizardStepFooter } from '@/components/inspections/wizard/WizardBottomBar';
import { HintCallout } from '@/components/onboarding/HintCallout';
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
 * törölhető.
 *
 * **Nincs "Teljes autó átlaga" kártya ezen a lépésen** (2026-08-10, felhasználói kérés
 * -- "7. lépésben az átlagot vedd ki. Erre nincs szükség") -- a korábban itt megjelenő
 * kiemelt összefoglaló kártyát eltávolítottuk. Az átlag SZÁMÍTÁSA (`getOverallPaintAverage`)
 * és a hozzá tartozó `getPaintStatus()` továbbra is megmarad/használt más helyeken
 * (`StepSummary.tsx`, `InspectionDetailView.tsx`, publikus riport), csak EZEN a
 * wizard-lépésen nem jelenítjük meg.
 */
export function StepPaintMeasurements({
  value,
  onChange,
  onBack,
  onNext,
  nextLabel,
  thresholds = DEFAULT_REPORT_THRESHOLDS,
}: StepPaintMeasurementsProps) {
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

      <HintCallout id="paint" title="Tipp: nem minden vizsgálathoz kell">
        Ha az adott vizsgálathoz (pl. vizsga előtti átvizsgálás) nincs szükség rétegvastagság-mérésre,
        egyszerűen lépj tovább -- kitöltés nélkül ez a szakasz nem jelenik meg az ügyfélriporton.
      </HintCallout>

      <PaintCanvas points={value} mode="edit" onChange={onChange} theme="dark" thresholds={thresholds} />

      <WizardStepFooter onBack={onBack} onNext={onNext} nextLabel={nextLabel} />
    </div>
  );
}
