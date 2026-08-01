'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Trash2, X } from 'lucide-react';
import { CAR_IMAGE_HEIGHT, CAR_IMAGE_SRC, CAR_IMAGE_WIDTH } from '@/lib/inspections/carImageMap';
import { PAINT_STATUS_LABEL, getPaintStatus } from '@/lib/inspections/constants';
import { sanitizeMicron } from '@/lib/inspections/validation';
import type { PaintPointState, PaintStatus } from '@/lib/inspections/types';

interface PaintCanvasProps {
  points: PaintPointState[];
  /** `edit`: kattintásra a képen BÁRHOL új mérési pontot vehet fel (Wizard), egy
   * meglévő buborékra kattintva pedig szerkesztheti/törölheti azt.
   * `view`: kizárólag olvasásra -- kattintásra a meglévő buborék értéke megtekinthető,
   * de nem hozható létre új pont és nem módosítható/törölhető a meglévő (Publikus riport). */
  mode: 'edit' | 'view';
  /** KÖTELEZŐ `edit` módban -- minden pont-hozzáadás/-módosítás/-törlés után hívódik a
   * TELJES, frissített tömbbel. */
  onChange?: (points: PaintPointState[]) => void;
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

const ACCENT = { dark: '#5e6ad2', light: '#1c69d4' };

/** A popoverben szerkesztés alatt álló pont -- `id: null` egy MÉG NEM mentett, most
 * kattintott új pontot jelöl (a `x`/`y` a kattintás helye, `value` üres), `id: string`
 * egy MEGLÉVŐ, a `points` tömbben már szereplő pont szerkesztését/törlését. */
interface PendingPoint {
  id: string | null;
  x: number;
  y: number;
  value: string;
}

/**
 * Rétegvastagság-mérő "Szabadkézi" (Free-form Canvas) komponens (PROJEKT_INSTRUKCIOK.md,
 * "Rétegvastagság-mérő Szabadkézi (Free-form Canvas) átalakítása" lépés) -- a
 * `public/cars.webp` referenciaképre NINCS előre definiált elem/hotspot ráépítve, a
 * felhasználó a kép TETSZŐLEGES pontjára kattinthat, hogy ott felvegyen egy mérési
 * pontot. UGYANEZ a komponens fut a Wizard 6. lépésében ÉS a publikus riportban, csak
 * `mode`/`theme` propokkal paraméterezve (`mode="view"`-nál a konténer kattintása nem
 * hoz létre új pontot, csak a meglévő buborékok olvashatók).
 *
 * Interakció (edit mód):
 *  1. Kattintás a kép egy üres pontjára -> a kattintás relatív pozíciója (%) alapján
 *     megnyílik egy popover egy üres µm beviteli mezővel ("Mentés" gomb menti el).
 *  2. Kattintás egy MEGLÉVŐ, színes buborékra -> ugyanaz a popover nyílik meg, de a
 *     mező előre ki van töltve, és egy "Törlés" gomb is megjelenik.
 *  3. A buborék színe a mentett érték alapján élőben számolt zöld/sárga/piros
 *     (`getPaintStatus`).
 */
export function PaintCanvas({ points, mode, onChange, theme, className }: PaintCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingPoint | null>(null);
  const accent = ACCENT[theme];

  function closePending() {
    setPending(null);
  }

  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== 'edit') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const rawX = ((e.clientX - rect.left) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;
    const x = Math.min(100, Math.max(0, rawX));
    const y = Math.min(100, Math.max(0, rawY));
    setPending({ id: null, x, y, value: '' });
  }

  function handleBubbleClick(e: React.MouseEvent, point: PaintPointState) {
    e.stopPropagation();
    setPending({ id: point.id, x: point.x, y: point.y, value: String(point.value) });
  }

  function handleSave() {
    if (!pending || !onChange) return;
    const numeric = Number(pending.value);
    if (pending.value.trim() === '' || Number.isNaN(numeric) || numeric <= 0) return;
    if (pending.id) {
      onChange(points.map((p) => (p.id === pending.id ? { ...p, value: numeric } : p)));
    } else {
      onChange([...points, { id: crypto.randomUUID(), x: pending.x, y: pending.y, value: numeric }]);
    }
    closePending();
  }

  function handleDelete() {
    if (!pending?.id || !onChange) return;
    onChange(points.filter((p) => p.id !== pending.id));
    closePending();
  }

  // Popover-elhelyezés heurisztika: ha a kattintott pont a kép jobb/alsó felén van, a
  // popover balra/felfelé nyílik (és fordítva) -- így a fix pixel-szélességű popover
  // egy tisztán százalék-alapú, DOM-mérés nélküli heurisztikával sosem lóg ki a képből.
  function popoverPositionClasses(point: { x: number; y: number }) {
    const anchorLeft = point.x > 55;
    const anchorTop = point.y > 55;
    return [anchorLeft ? '-translate-x-full -ml-3' : 'ml-3', anchorTop ? '-translate-y-full -mt-3' : 'mt-3'].join(' ');
  }

  const closeButtonClass =
    'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ' +
    (theme === 'dark'
      ? 'text-linear-ink-subtle hover:bg-linear-surface-3 hover:text-linear-ink'
      : 'text-bmw-muted hover:bg-bmw-surface-soft hover:text-bmw-ink');

  return (
    <div className={className}>
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        role={mode === 'edit' ? 'button' : undefined}
        aria-label={mode === 'edit' ? 'Kattints a képre egy mérési pont felvételéhez' : undefined}
        className={
          'relative mx-auto w-full max-w-[560px] overflow-visible rounded-lg bg-white ' +
          (mode === 'edit' ? 'cursor-crosshair' : '')
        }
        style={{ aspectRatio: `${CAR_IMAGE_WIDTH} / ${CAR_IMAGE_HEIGHT}` }}
      >
        <Image
          src={CAR_IMAGE_SRC}
          alt="Autó öt nézete (elöl, hátul, felül, bal oldal, jobb oldal) a rétegvastagság-mérés jelöléséhez"
          fill
          sizes="(max-width: 640px) 100vw, 560px"
          className="pointer-events-none select-none object-contain"
          priority={false}
        />

        {points.map((point) => {
          const status = getPaintStatus(point.value);
          const isSelected = pending?.id === point.id;
          return (
            <button
              key={point.id}
              type="button"
              aria-label={`Mérési pont: ${point.value} µm (${PAINT_STATUS_LABEL[status]})`}
              onClick={(e) => handleBubbleClick(e, point)}
              style={{
                left: `${point.x}%`,
                top: `${point.y}%`,
                backgroundColor: STATUS_FILL[status],
                boxShadow: isSelected ? `0 0 0 3px ${accent}` : undefined,
              }}
              className={
                'absolute z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-md ring-2 ring-white outline-none transition-transform sm:h-9 sm:w-9 ' +
                (isSelected ? 'scale-110' : 'hover:scale-105')
              }
            >
              {Math.round(point.value)}
            </button>
          );
        })}

        {pending && pending.id === null && (
          <span
            style={{ left: `${pending.x}%`, top: `${pending.y}%`, borderColor: accent }}
            className="absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-dashed"
          />
        )}

        {pending && (
          <>
            {/* Láthatatlan teljes-képernyős hátlap -- kattintásra bezárja a popovert
                anélkül, hogy új pontot venne fel (a konténer saját onClick-je elé kerül,
                mert nagyobb z-index-szel rendelkezik). */}
            <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); closePending(); }} />
            <div
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.key === 'Escape' && closePending()}
              style={{ left: `${pending.x}%`, top: `${pending.y}%` }}
              className={
                'absolute z-30 w-[200px] max-w-[80vw] rounded-lg border p-3 shadow-xl ' +
                popoverPositionClasses(pending) +
                ' ' +
                (theme === 'dark' ? 'border-linear-hairline-strong bg-linear-surface-2' : 'border-bmw-hairline-strong bg-white')
              }
            >
              <div className="flex items-center justify-between gap-2">
                <p className={theme === 'dark' ? 'text-[12px] font-semibold text-linear-ink' : 'text-[12px] font-bold text-bmw-ink'}>
                  {mode === 'edit' ? (pending.id ? 'Pont szerkesztése' : 'Új mérési pont') : 'Mérési pont'}
                </p>
                <button type="button" onClick={closePending} aria-label="Bezárás" className={closeButtonClass}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {mode === 'edit' ? (
                <div className="mt-2.5 flex flex-col gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    placeholder="µm"
                    value={pending.value}
                    onChange={(e) => setPending({ ...pending, value: sanitizeMicron(e.target.value) })}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    className="h-9 w-full rounded-md border border-linear-hairline bg-linear-surface-1 px-2 text-center text-[13px] text-linear-ink placeholder:text-linear-ink-subtle transition-colors focus:border-linear-primary focus:outline-none focus:ring-2 focus:ring-linear-primary/30"
                  />
                  <div className="flex gap-2">
                    {pending.id && (
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-linear-danger/40 text-[12px] font-medium text-linear-danger transition-colors hover:bg-linear-danger-soft"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Törlés
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={pending.value.trim() === ''}
                      className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-linear-primary text-[12px] font-medium text-white transition-colors hover:bg-linear-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Mentés
                    </button>
                  </div>
                </div>
              ) : (
                <p className={theme === 'dark' ? 'mt-1 text-[12px] text-linear-ink-subtle' : 'mt-1 text-[12px] font-light text-bmw-muted'}>
                  {pending.value} µm · {PAINT_STATUS_LABEL[getPaintStatus(Number(pending.value))]}
                </p>
              )}
            </div>
          </>
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
