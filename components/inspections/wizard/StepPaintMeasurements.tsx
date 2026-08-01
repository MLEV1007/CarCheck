'use client';

import { getOverallPaintAverage, getPaintPanelAverage, getPaintStatus } from '@/lib/inspections/constants';
import { sanitizeMicron } from '@/lib/inspections/validation';
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

const POINT_FIELDS: Array<{ key: 'p1' | 'p2' | 'p3'; label: string }> = [
  { key: 'p1', label: '1. pont' },
  { key: 'p2', label: '2. pont' },
  { key: 'p3', label: '3. pont' },
];

/**
 * LÉPÉS -- Rétegvastagság-mérő modul (PROJEKT_INSTRUKCIOK.md, "Rétegvastagság-mérő
 * modul újratervezése" lépés). Minden karosszéria elemhez 3 mérési pont (µm) tartozik,
 * az elem átlaga automatikusan számolódik -- ehhez mindhárom pontot ki kell tölteni,
 * részlegesen kitöltött elem "–" átlagot mutat és nem kerül be a mentésbe. A lépés
 * tetején egy kiemelt kártya mutatja a TELJES AUTÓ ÁTLAGÁT (a kitöltött elemek
 * átlagainak átlaga) a hozzá tartozó színkódolt státusszal.
 */
export function StepPaintMeasurements({ value, onChange, onBack, onNext, nextLabel }: StepPaintMeasurementsProps) {
  function setPoint(index: number, field: 'p1' | 'p2' | 'p3', raw: string) {
    const next = [...value];
    next[index] = { ...next[index], [field]: sanitizeMicron(raw) };
    onChange(next);
  }

  const overallAverage = getOverallPaintAverage(value);
  const overallStatus = overallAverage !== null ? getPaintStatus(overallAverage) : null;
  const measuredCount = value.filter((panel) => getPaintPanelAverage(panel) !== null).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Festékvastagság-mérés</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Add meg mindhárom mérési pont (µm) értékét karosszéria elemenként. Az elem átlaga csak akkor
          számolódik, ha mind a 3 pont ki van töltve. Státusz: 80–150 µm Gyári, 151–250 µm Újrafújt /
          Javított, 250 µm felett Gittelt / Sérült.
        </p>
      </div>

      {/* Kiemelt összefoglaló kártya -- TELJES AUTÓ ÁTLAGA. */}
      <div className="flex flex-col gap-3 rounded-lg border border-linear-hairline-strong bg-linear-surface-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.5px] text-linear-ink-subtle">
            Összes elem átlaga
          </p>
          <p className="mt-1 text-[28px] font-semibold tabular-nums text-linear-ink">
            {overallAverage !== null ? overallAverage : '—'}
            {overallAverage !== null && <span className="ml-1 text-[16px] font-normal text-linear-ink-subtle">µm</span>}
          </p>
          <p className="mt-0.5 text-[12px] text-linear-ink-subtle">
            {measuredCount} / {value.length} elem mérve
          </p>
        </div>
        {overallStatus && <PaintStatusBadge status={overallStatus} />}
      </div>

      <ul className="flex flex-col gap-3">
        {value.map((panel, index) => {
          const average = getPaintPanelAverage(panel);
          const status = average !== null ? getPaintStatus(average) : null;

          return (
            <li
              key={panel.elementName}
              className="flex flex-col gap-3 rounded-lg border border-linear-hairline bg-linear-surface-1 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] font-medium text-linear-ink">{panel.elementName}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] tabular-nums text-linear-ink-muted">
                    Átlag: {average !== null ? `${average} µm` : '—'}
                  </span>
                  {status && <PaintStatusBadge status={status} />}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {POINT_FIELDS.map(({ key, label }) => (
                  <div key={key} className="relative">
                    <span className="mb-1 block text-[11px] uppercase tracking-[0.3px] text-linear-ink-subtle">
                      {label}
                    </span>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="µm"
                        value={panel[key]}
                        onChange={(e) => setPoint(index, key, e.target.value)}
                        className="h-10 w-full rounded-md border border-linear-hairline bg-linear-surface-2 px-2.5 pr-7 text-[14px] text-linear-ink placeholder:text-linear-ink-subtle transition-colors focus:border-linear-primary focus:outline-none focus:ring-2 focus:ring-linear-primary/30"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-linear-ink-subtle">
                        µm
                      </span>
                    </div>
                  </div>
                ))}
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
