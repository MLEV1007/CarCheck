'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { CAR_DIAGRAM_VIEWBOX, CAR_DIAGRAM_WHEELS, CAR_DIAGRAM_WINDOWS, CAR_PANEL_ZONES } from '@/lib/inspections/carDiagram';
import { PAINT_STATUS_LABEL } from '@/lib/inspections/constants';
import { sanitizeMicron } from '@/lib/inspections/validation';
import type { PaintStatus } from '@/lib/inspections/types';

/** Egy zóna kiszámolt/tárolt adata -- a szülő komponens (wizard VAGY publikus riport)
 * számolja ki és adja át, hogy a diagram maga "buta" prezentációs komponens maradjon,
 * ugyanazt a `getPaintPanelAverage`/`getPaintStatus` logikát használva mindkét helyen
 * (lásd `lib/inspections/constants.ts`). A `points` KIZÁRÓLAG akkor van megadva, ha a 3
 * nyers mérési pont ténylegesen elérhető -- egy régi, a 3-pontos átalakítás ELŐTTI
 * publikus riport-sornál `null`, hogy a részletes nézet ne hazudjon 3 (valójában soha
 * nem mért) pontot az ügyfélnek.
 */
export interface CarDiagramPanelData {
  status: PaintStatus | null;
  average: number | null;
  points?: [string, string, string] | null;
}

interface CarDiagramProps {
  data: Record<string, CarDiagramPanelData>;
  /** `edit`: koppintásra 3 szerkeszthető mérési pont mező nyílik (Wizard).
   * `view`: koppintásra csak a mért értékek olvashatók (Publikus riport). */
  mode: 'edit' | 'view';
  /** KÖTELEZŐ `edit` módban -- minden billentyűleütésnél hívódik. */
  onChangePoint?: (elementName: string, field: 'p1' | 'p2' | 'p3', value: string) => void;
  /** `dark` = Linear design tokenek (Wizard), `light` = BMW design tokenek (Publikus riport). */
  theme: 'dark' | 'light';
  className?: string;
}

const STATUS_FILL: Record<PaintStatus, string> = {
  gyari: '#166534',
  ujrafujt: '#92400e',
  gittelt: '#991b1b',
};

const STATUS_STROKE: Record<PaintStatus, string> = {
  gyari: '#14532d',
  ujrafujt: '#78350f',
  gittelt: '#7f1d1d',
};

const NEUTRAL_COLORS = {
  dark: { fill: '#1c1d21', stroke: '#35373d', text: '#75777e' },
  light: { fill: '#eef1f4', stroke: '#d7dbe0', text: '#8a94a3' },
};

const LEGEND_ITEMS: Array<{ status: PaintStatus; range: string }> = [
  { status: 'gyari', range: '80–150 µm' },
  { status: 'ujrafujt', range: '151–250 µm' },
  { status: 'gittelt', range: '250+ µm' },
];

const POINT_FIELDS: Array<{ key: 'p1' | 'p2' | 'p3'; label: string }> = [
  { key: 'p1', label: '1. pont' },
  { key: 'p2', label: '2. pont' },
  { key: 'p3', label: '3. pont' },
];

/**
 * Interaktív, színkódolt autó-diagram a rétegvastagság-méréshez (PROJEKT_INSTRUKCIOK.md,
 * "Vizualizált autó-diagram a Rétegvastagság-mérő modulban" lépés). Mindkét felületen
 * (Wizard 6. lépés + Publikus riport) UGYANEZ a komponens fut, csak `mode`/`theme`
 * propokkal paraméterezve -- ez garantálja, hogy a vizsgáló és az ügyfél PONTOSAN
 * ugyanazt a vizuális térképet lássa.
 *
 * A kiválasztott zóna állapotát (melyik elem részlet-panelje van nyitva) a komponens
 * BELSŐ state-ként tárolja (`useState`) -- a szülőnek csak a kiszámolt `data`-t kell
 * biztosítania, nem kell a kiválasztást felfelé menedzselnie.
 */
export function CarDiagram({ data, mode, onChangePoint, theme, className }: CarDiagramProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const neutral = NEUTRAL_COLORS[theme];
  const selectedZone = selected ? CAR_PANEL_ZONES.find((z) => z.elementName === selected) : undefined;
  const selectedData = selected ? data[selected] : undefined;

  function toggleSelect(elementName: string) {
    setSelected((current) => (current === elementName ? null : elementName));
  }

  function handleKeyDown(e: React.KeyboardEvent, elementName: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleSelect(elementName);
    }
  }

  return (
    <div className={className}>
      <div className="mx-auto w-full max-w-[420px]">
        <svg
          viewBox={CAR_DIAGRAM_VIEWBOX}
          role="img"
          aria-label="Az autó karosszéria-elemeinek rétegvastagság-térképe"
          className="h-auto w-full select-none"
        >
          {/* Díszítő kerekek -- nem interaktívak, csak vizuálisan teszik felismerhetővé az ábrát. */}
          {CAR_DIAGRAM_WHEELS.map((wheel, index) => (
            <rect
              key={`wheel-${index}`}
              x={wheel.x}
              y={wheel.y}
              width={wheel.w}
              height={wheel.h}
              rx={wheel.rx}
              fill={theme === 'dark' ? '#000000' : '#1a2129'}
              opacity={0.35}
              pointerEvents="none"
            />
          ))}

          {/* A 19 kattintható/koppintható karosszéria-zóna. */}
          {CAR_PANEL_ZONES.map((zone) => {
            const zoneData = data[zone.elementName];
            const status = zoneData?.status ?? null;
            const isSelected = selected === zone.elementName;
            const fill = status ? STATUS_FILL[status] : neutral.fill;
            const stroke = isSelected ? (theme === 'dark' ? '#5e6ad2' : '#1c69d4') : status ? STATUS_STROKE[status] : neutral.stroke;
            const labelLines = zone.shortLabel ? zone.shortLabel.split('\n') : [];
            const centerX = zone.x + zone.w / 2;
            const centerY = zone.y + zone.h / 2;
            const hasLabel = labelLines.length > 0;
            // A tényleges megjelenített sorok száma: a felirat sorai + (ha van mérve
            // átlag) egy plusz sor -- a blokkot ehhez a sorszámhoz igazítva közepítjük
            // függőlegesen a zóna közepére, 14 egységes sormagassággal.
            const totalLines = labelLines.length + (zoneData?.average != null ? 1 : 0);
            const startY = hasLabel ? centerY - ((totalLines - 1) * 14) / 2 : centerY;

            return (
              <g
                key={zone.elementName}
                role="button"
                tabIndex={0}
                aria-label={`${zone.elementName}${zoneData?.average != null ? `: ${zoneData.average} µm` : ': nincs mérve'}`}
                onClick={() => toggleSelect(zone.elementName)}
                onKeyDown={(e) => handleKeyDown(e, zone.elementName)}
                className="cursor-pointer outline-none"
              >
                <title>
                  {zone.elementName}
                  {zoneData?.average != null ? `: ${zoneData.average} µm` : ': nincs mérve'}
                </title>
                <rect
                  x={zone.x}
                  y={zone.y}
                  width={zone.w}
                  height={zone.h}
                  rx={zone.rx ?? 0}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isSelected ? 3 : 1.5}
                  className="transition-colors duration-150"
                />
                {hasLabel && (
                  <text
                    x={centerX}
                    y={startY}
                    textAnchor="middle"
                    fill={status ? '#ffffff' : neutral.text}
                    fontSize={12}
                    fontWeight={600}
                    style={{ pointerEvents: 'none' }}
                  >
                    {labelLines.map((line, i) => (
                      <tspan key={i} x={centerX} dy={i === 0 ? 0 : 14}>
                        {line}
                      </tspan>
                    ))}
                    {zoneData?.average != null && (
                      <tspan x={centerX} dy={14} fontSize={11} fontWeight={700}>
                        {zoneData.average} µm
                      </tspan>
                    )}
                  </text>
                )}
              </g>
            );
          })}

          {/* Díszítő szélvédő/hátsó ablak sávok. */}
          {CAR_DIAGRAM_WINDOWS.map((win, index) => (
            <rect
              key={`window-${index}`}
              x={win.x}
              y={win.y}
              width={win.w}
              height={win.h}
              fill={theme === 'dark' ? '#5e6ad2' : '#1c69d4'}
              opacity={0.25}
              pointerEvents="none"
            />
          ))}
        </svg>
      </div>

      {/* Jelmagyarázat. */}
      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2">
        {LEGEND_ITEMS.map((item) => (
          <span
            key={item.status}
            className={
              'flex items-center gap-2 text-[12px] ' +
              (theme === 'dark' ? 'font-medium text-linear-ink-subtle' : 'font-light text-bmw-muted')
            }
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_FILL[item.status] }} />
            {PAINT_STATUS_LABEL[item.status]} ({item.range})
          </span>
        ))}
      </div>

      {/* Kiválasztott elem részlet-panelje -- Wizardban szerkeszthető (3 mező), publikus
          riportban csak olvasható. */}
      {selectedZone && selectedData && (
        <div
          className={
            'mt-4 rounded-lg border p-4 ' +
            (theme === 'dark'
              ? 'border-linear-hairline-strong bg-linear-surface-2'
              : 'border-bmw-hairline-strong bg-bmw-surface-card')
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={theme === 'dark' ? 'text-[14px] font-semibold text-linear-ink' : 'text-[15px] font-bold text-bmw-ink'}>
                {selectedZone.elementName}
              </p>
              <p className={theme === 'dark' ? 'mt-0.5 text-[13px] text-linear-ink-subtle' : 'mt-0.5 text-[13px] font-light text-bmw-muted'}>
                {selectedData.average != null ? `Átlag: ${selectedData.average} µm` : 'Nincs rögzített mérés.'}
                {selectedData.status && ` · ${PAINT_STATUS_LABEL[selectedData.status]}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Bezárás"
              className={
                'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ' +
                (theme === 'dark'
                  ? 'text-linear-ink-subtle hover:bg-linear-surface-3 hover:text-linear-ink'
                  : 'text-bmw-muted hover:bg-bmw-surface-soft hover:text-bmw-ink')
              }
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {mode === 'edit' ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {POINT_FIELDS.map(({ key, label }, index) => (
                <div key={key} className="relative">
                  <span className="mb-1 block text-[11px] uppercase tracking-[0.3px] text-linear-ink-subtle">{label}</span>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="µm"
                      value={selectedData.points?.[index] ?? ''}
                      onChange={(e) => onChangePoint?.(selectedZone.elementName, key, sanitizeMicron(e.target.value))}
                      className="h-10 w-full rounded-md border border-linear-hairline bg-linear-surface-1 px-2.5 pr-7 text-[14px] text-linear-ink placeholder:text-linear-ink-subtle transition-colors focus:border-linear-primary focus:outline-none focus:ring-2 focus:ring-linear-primary/30"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-linear-ink-subtle">
                      µm
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            selectedData.points && (
              <div className="mt-3 flex gap-4">
                {POINT_FIELDS.map(({ key, label }, index) => (
                  <div key={key}>
                    <p className="text-[11px] font-bold uppercase tracking-[0.4px] text-bmw-muted">{label}</p>
                    <p className="mt-0.5 font-mono text-[15px] font-bold text-bmw-ink">{selectedData.points?.[index]} µm</p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
