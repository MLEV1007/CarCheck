'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Plus, X } from 'lucide-react';
import { CAR_IMAGE_HEIGHT, CAR_IMAGE_HOTSPOTS, CAR_IMAGE_SRC, CAR_IMAGE_WIDTH } from '@/lib/inspections/carImageMap';
import { PAINT_STATUS_LABEL } from '@/lib/inspections/constants';
import { sanitizeMicron } from '@/lib/inspections/validation';
import type { PaintStatus } from '@/lib/inspections/types';

/** Egy hotspot kiszámolt/tárolt adata -- a szülő (Wizard VAGY publikus riport) számolja
 * ki és adja át (ugyanazt a `getPaintPanelAverage`/`getPaintStatus` logikát használva
 * mindkét helyen, lásd `lib/inspections/constants.ts`), hogy ez a komponens "buta"
 * prezentációs maradjon. `points` KIZÁRÓLAG akkor van megadva, ha a 3 nyers mérési pont
 * ténylegesen elérhető -- egy régi, a 3-pontos átalakítás ELŐTTI publikus riport-sornál
 * `null`, hogy a részletes nézet ne hazudjon 3 (valójában soha nem mért) pontot az
 * ügyfélnek. */
export interface CarDiagramPanelData {
  status: PaintStatus | null;
  average: number | null;
  points?: [string, string, string] | null;
}

interface ImageHotspotDiagramProps {
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
  gyari: '#16a34a',
  ujrafujt: '#d97706',
  gittelt: '#dc2626',
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

const ACCENT = { dark: '#5e6ad2', light: '#1c69d4' };

/**
 * Képalapú (image-based) interaktív rétegvastagság hőtérkép (PROJEKT_INSTRUKCIOK.md,
 * "Képalapú interaktív rétegvastagság-mérő hőtérkép" lépés) -- a `public/cars.webp`
 * referenciaképre pozicionált hotspot-buborékok. UGYANEZ a komponens fut a Wizard 6.
 * lépésében ÉS a publikus riportban, csak `mode`/`theme` propokkal paraméterezve, hogy
 * a vizsgáló és az ügyfél PONTOSAN ugyanazt a vizuális térképet lássa.
 *
 * Üres állapot: szaggatott keretű, pulzáló kör "+" ikonnal -- jelzi, hogy oda lehet
 * koppintani. Kitöltött állapot: színes, árnyékolt buborék az elem átlagával (µm,
 * kerekítve). Koppintásra egy kis, a hotspot mellé pozicionált popover nyílik (3
 * szerkeszthető mérési pont Wizardban, csak olvasható értékek a riportban).
 */
export function ImageHotspotDiagram({ data, mode, onChangePoint, theme, className }: ImageHotspotDiagramProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const accent = ACCENT[theme];
  const selectedHotspot = selected ? CAR_IMAGE_HOTSPOTS.find((h) => h.elementName === selected) : undefined;
  const selectedData = selected ? data[selected] : undefined;

  function toggleSelect(elementName: string) {
    setSelected((current) => (current === elementName ? null : elementName));
  }

  function handleKeyDown(e: React.KeyboardEvent, elementName: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleSelect(elementName);
    } else if (e.key === 'Escape') {
      setSelected(null);
    }
  }

  // Popover-elhelyezés heurisztika: ha a hotspot a kép jobb felén van, a popover balra
  // nyílik (és fordítva); ha a kép alsó részén van, felfelé nyílik -- így a popover
  // (fix pixel-szélesség) sosem lóg ki a képből egy tisztán százalék-alapú, DOM-mérés
  // nélküli heurisztikával.
  function popoverPositionClasses(hotspot: { left: number; top: number }) {
    const anchorLeft = hotspot.left > 55;
    const anchorTop = hotspot.top > 55;
    return [
      anchorLeft ? '-translate-x-full -ml-3' : 'ml-3',
      anchorTop ? '-translate-y-full -mt-3' : 'mt-3',
    ].join(' ');
  }

  return (
    <div className={className}>
      <div
        className="relative mx-auto w-full max-w-[560px] overflow-visible rounded-lg bg-white"
        style={{ aspectRatio: `${CAR_IMAGE_WIDTH} / ${CAR_IMAGE_HEIGHT}` }}
      >
        <Image
          src={CAR_IMAGE_SRC}
          alt="Autó öt nézete (elöl, hátul, felül, bal oldal, jobb oldal) a rétegvastagság-mérés jelöléséhez"
          fill
          sizes="(max-width: 640px) 100vw, 560px"
          className="select-none object-contain"
          priority={false}
        />

        {CAR_IMAGE_HOTSPOTS.map((hotspot) => {
          const hotspotData = data[hotspot.elementName];
          const isMeasured = hotspotData?.average != null && hotspotData.status;
          const isSelected = selected === hotspot.elementName;

          return (
            <button
              key={hotspot.elementName}
              type="button"
              aria-label={`${hotspot.elementName}${hotspotData?.average != null ? `: ${hotspotData.average} µm` : ': nincs mérve, koppints a méréshez'}`}
              title={hotspot.elementName}
              onClick={() => toggleSelect(hotspot.elementName)}
              onKeyDown={(e) => handleKeyDown(e, hotspot.elementName)}
              style={{
                left: `${hotspot.left}%`,
                top: `${hotspot.top}%`,
                backgroundColor: isMeasured
                  ? STATUS_FILL[hotspotData!.status as PaintStatus]
                  : theme === 'dark'
                    ? 'rgba(94,106,210,0.15)'
                    : 'rgba(28,105,212,0.1)',
                borderColor: isMeasured ? undefined : accent,
                boxShadow: isSelected ? `0 0 0 3px ${accent}` : undefined,
              }}
              className={
                'absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none transition-transform ' +
                (isSelected ? 'scale-110' : 'hover:scale-105') +
                (isMeasured
                  ? ' h-8 w-8 text-[11px] font-bold text-white shadow-md ring-2 ring-white sm:h-9 sm:w-9'
                  : ' h-7 w-7 animate-pulse border-2 border-dashed sm:h-8 sm:w-8')
              }
            >
              {isMeasured ? Math.round(hotspotData!.average as number) : <Plus className="h-3.5 w-3.5" style={{ color: accent }} />}
            </button>
          );
        })}

        {selectedHotspot && selectedData && (
          <div
            className={
              'absolute z-20 w-[230px] max-w-[80vw] rounded-lg border p-3 shadow-xl sm:w-[260px] ' +
              popoverPositionClasses(selectedHotspot) +
              ' ' +
              (theme === 'dark' ? 'border-linear-hairline-strong bg-linear-surface-2' : 'border-bmw-hairline-strong bg-white')
            }
            style={{ left: `${selectedHotspot.left}%`, top: `${selectedHotspot.top}%` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className={theme === 'dark' ? 'text-[13px] font-semibold text-linear-ink' : 'text-[14px] font-bold text-bmw-ink'}>
                  {selectedHotspot.elementName}
                </p>
                <p className={theme === 'dark' ? 'mt-0.5 text-[12px] text-linear-ink-subtle' : 'mt-0.5 text-[12px] font-light text-bmw-muted'}>
                  {selectedData.average != null ? `Átlag: ${selectedData.average} µm` : 'Nincs rögzített mérés.'}
                  {selectedData.status && ` · ${PAINT_STATUS_LABEL[selectedData.status]}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Bezárás"
                className={
                  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ' +
                  (theme === 'dark'
                    ? 'text-linear-ink-subtle hover:bg-linear-surface-3 hover:text-linear-ink'
                    : 'text-bmw-muted hover:bg-bmw-surface-soft hover:text-bmw-ink')
                }
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {mode === 'edit' ? (
              <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                {POINT_FIELDS.map(({ key, label }, index) => (
                  <div key={key}>
                    <span className="mb-1 block text-[10px] uppercase tracking-[0.3px] text-linear-ink-subtle">{label}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="µm"
                      value={selectedData.points?.[index] ?? ''}
                      onChange={(e) => onChangePoint?.(selectedHotspot.elementName, key, sanitizeMicron(e.target.value))}
                      className="h-9 w-full rounded-md border border-linear-hairline bg-linear-surface-1 px-1.5 text-center text-[13px] text-linear-ink placeholder:text-linear-ink-subtle transition-colors focus:border-linear-primary focus:outline-none focus:ring-2 focus:ring-linear-primary/30"
                    />
                  </div>
                ))}
              </div>
            ) : (
              selectedData.points && (
                <div className="mt-2.5 flex gap-3">
                  {POINT_FIELDS.map(({ key, label }, index) => (
                    <div key={key}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.4px] text-bmw-muted">{label}</p>
                      <p className="mt-0.5 font-mono text-[13px] font-bold text-bmw-ink">{selectedData.points?.[index]} µm</p>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
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
    </div>
  );
}
