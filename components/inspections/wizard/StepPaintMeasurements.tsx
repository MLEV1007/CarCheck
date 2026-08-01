'use client';

import { useMemo } from 'react';
import { getOverallPaintAverage, getPaintPanelAverage, getPaintStatus } from '@/lib/inspections/constants';
import { ImageHotspotDiagram, type CarDiagramPanelData } from '@/components/inspections/ImageHotspotDiagram';
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

/**
 * LÉPÉS -- Rétegvastagság-mérő modul (PROJEKT_INSTRUKCIOK.md, "Vizualizált autó-diagram
 * a Rétegvastagság-mérő modulban" lépés). A korábbi sima kártyás lista helyett egy
 * interaktív, színkódolt autó-diagramon (`CarDiagram`, `mode="edit"`) koppintva nyílik
 * meg egy elem 3 mérési pontja -- az elem-átlag és a hozzá tartozó zöld/sárga/piros szín
 * élőben frissül minden billentyűleütésnél. A lépés tetején egy kiemelt kártya mutatja a
 * TELJES AUTÓ ÁTLAGÁT (a kitöltött elemek átlagainak átlaga).
 */
export function StepPaintMeasurements({ value, onChange, onBack, onNext, nextLabel }: StepPaintMeasurementsProps) {
  function setPoint(elementName: string, field: 'p1' | 'p2' | 'p3', raw: string) {
    const index = value.findIndex((panel) => panel.elementName === elementName);
    if (index === -1) return;
    const next = [...value];
    next[index] = { ...next[index], [field]: raw };
    onChange(next);
  }

  const diagramData: Record<string, CarDiagramPanelData> = useMemo(
    () =>
      Object.fromEntries(
        value.map((panel) => {
          const average = getPaintPanelAverage(panel);
          return [
            panel.elementName,
            {
              average,
              status: average !== null ? getPaintStatus(average) : null,
              points: [panel.p1, panel.p2, panel.p3] as [string, string, string],
            },
          ];
        })
      ),
    [value]
  );

  const overallAverage = getOverallPaintAverage(value);
  const overallStatus = overallAverage !== null ? getPaintStatus(overallAverage) : null;
  const measuredCount = value.filter((panel) => getPaintPanelAverage(panel) !== null).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Festékvastagság-mérés</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Koppints az autó-képen egy pontra (üres, pulzáló körök) a 3 mérési pont (µm) megadásához. Az
          elem átlaga csak akkor számolódik, ha mind a 3 pont ki van töltve -- ekkor a pont színes
          buborékká alakul. Státusz: 80–150 µm Gyári, 151–250 µm Újrafújt / Javított, 250 µm felett
          Gittelt / Sérült.
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

      <ImageHotspotDiagram data={diagramData} mode="edit" onChangePoint={setPoint} theme="dark" />

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
