'use client';

import { getPaintStatus } from '@/lib/inspections/constants';
import { PaintStatusBadge } from '@/components/inspections/wizard/PaintStatusBadge';
import type { PaintMeasurementState } from '@/lib/inspections/types';

interface StepPaintMeasurementsProps {
  value: PaintMeasurementState[];
  onChange: (value: PaintMeasurementState[]) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
}

/** LÉPÉS -- Festékvastagság-mérés (PROJEKT_INSTRUKCIOK.md 5.B.2). */
export function StepPaintMeasurements({ value, onChange, onBack, onNext, nextLabel }: StepPaintMeasurementsProps) {
  function setMicronValue(index: number, micronValue: string) {
    const next = [...value];
    next[index] = { ...next[index], micronValue };
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Festékvastagság-mérés</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Add meg a mért mikron (µm) értékeket. A státusz automatikusan számolódik: 0–160 µm Gyári,
          161–300 µm Újrafújt, 300 µm felett Gittelt / Sérült. Az üresen hagyott elemek nem kerülnek
          be a riportba.
        </p>
      </div>

      <ul className="divide-y divide-linear-hairline overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1">
        {value.map((panel, index) => {
          const parsed = panel.micronValue.trim() === '' ? null : Number(panel.micronValue);
          const status = parsed !== null && !Number.isNaN(parsed) ? getPaintStatus(parsed) : null;

          return (
            <li
              key={panel.elementName}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <span className="text-[14px] font-medium text-linear-ink">{panel.elementName}</span>

              {/* `flex-wrap`: 320px-es képernyőn a fix szélességű input (w-28) + badge
                  (w-[124px]) együtt kilógna a kártya szélességéből -- így a badge inkább
                  új sorra kerül, minthogy a kártya vízszintesen görgethetővé váljon. */}
              <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={2000}
                    placeholder="µm"
                    value={panel.micronValue}
                    onChange={(e) => setMicronValue(index, e.target.value)}
                    className="h-10 w-28 rounded-md border border-linear-hairline bg-linear-surface-2 px-3 pr-8 text-[14px] text-linear-ink placeholder:text-linear-ink-subtle transition-colors focus:border-linear-primary focus:outline-none focus:ring-2 focus:ring-linear-primary/30"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-linear-ink-subtle">
                    µm
                  </span>
                </div>

                <div className="w-[124px] shrink-0">{status && <PaintStatusBadge status={status} />}</div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap justify-between gap-3 border-t border-linear-hairline pt-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 items-center rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-5 text-[14px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-2"
        >
          Vissza
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex h-10 items-center rounded-md bg-linear-primary px-5 text-[14px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
        >
          Tovább – {nextLabel}
        </button>
      </div>
    </div>
  );
}
