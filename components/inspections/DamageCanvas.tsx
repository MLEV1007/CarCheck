'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Trash2, X, ZoomIn } from 'lucide-react';
import { CAR_IMAGE_HEIGHT, CAR_IMAGE_SRC, CAR_IMAGE_WIDTH } from '@/lib/inspections/carImageMap';
import { DAMAGE_TYPE_COLOR, DAMAGE_TYPE_LABEL, DAMAGE_TYPES } from '@/lib/inspections/constants';
import { DefectMediaUpload } from '@/components/inspections/wizard/DefectMediaUpload';
import type { DamagePointState, DamageType } from '@/lib/inspections/types';

interface DamageCanvasProps {
  points: DamagePointState[];
  /** `edit`: kattintásra a képen BÁRHOL új sérülés-pontot vehet fel (Wizard), egy meglévő
   * markerre kattintva pedig szerkesztheti/törölheti azt -- UGYANAZ az interakciós minta,
   * mint a `PaintCanvas.tsx`-nél.
   * `view`: kizárólag olvasásra -- kattintásra a meglévő pont adatai (kategória, cím,
   * leírás, fotó) megtekinthetők, de nem hozható létre új pont és nem módosítható/törölhető
   * a meglévő (Publikus riport). */
  mode: 'edit' | 'view';
  /** KÖTELEZŐ `edit` módban -- minden pont-hozzáadás/-módosítás/-törlés után hívódik a
   * TELJES, frissített tömbbel. */
  onChange?: (points: DamagePointState[]) => void;
  /** `dark` = Linear design tokenek (Wizard), `light` = BMW design tokenek (Publikus riport). */
  theme: 'dark' | 'light';
  className?: string;
  /** `view` módban, ha a felhasználó a modalban a fotóra kattint -- a szülő ilyenkor tudja
   * megnyitni a `MediaLightbox`-ot (ugyanaz a minta, mint a `DefectsGallery.tsx`-nél).
   * `edit` módban nincs szükség rá, mert ott a `DefectMediaUpload` maga kezeli az előnézetet. */
  onOpenPhoto?: (url: string) => void;
}

/** A popoverben/modalban szerkesztés alatt álló pont -- `id: null` egy MÉG NEM mentett,
 * most kattintott új pontot jelöl (a `x`/`y` a kattintás helye, a többi mező üres/alapérték),
 * `id: string` egy MEGLÉVŐ, a `points` tömbben már szereplő pont szerkesztését/törlését
 * (VAGY `view` módban a puszta megtekintését). */
interface PendingDamage {
  id: string | null;
  x: number;
  y: number;
  type: DamageType;
  title: string;
  description: string;
  file: File | null;
  previewUrl: string | null;
}

const ACCENT = { dark: '#5e6ad2', light: '#1c69d4' };

/**
 * Sérülés- és Hibatérkép "Szabadkézi" (Free-form Canvas) komponens -- PONTOSAN a
 * `PaintCanvas.tsx` mintáját követi (NINCS előre definiált elem/hotspot a `cars.webp`
 * referenciaképen, a felhasználó a kép TETSZŐLEGES pontjára kattinthat), de itt minden
 * ponthoz egy kategória (karcolás/horpadás/rozsda/kavicsfelverődés/repedés/egyéb), egy
 * kötelező rövid cím, egy opcionális leírás és egy opcionális fotó is tartozik.
 *
 * SZÁNDÉKOS ELTÉRÉS a `PaintCanvas`-tól: ott egy apró, a kattintott ponthoz horgonyzott
 * (`position: absolute`, % koordinátás) popover elég volt egyetlen szám mezőhöz -- itt a
 * jóval gazdagabb tartalom (select + 2 szövegmező + fotó-feltöltő + gombok) miatt egy
 * KÖZÉPRE IGAZÍTOTT, `fixed` pozíciójú modal (a `MediaLightbox.tsx`-hez hasonló minta)
 * a robusztusabb megoldás -- egy kis, a kattintás helyéhez horgonyzott popover a kép
 * SZÉLÉN/ALJÁN, KIFEJEZETTEN mobilon (a projekt mobil-first célközönsége, garázsban,
 * telefonon dolgozó szakemberek) könnyen kilógna/levágódna ennyi tartalommal.
 */
export function DamageCanvas({ points, mode, onChange, theme, className, onOpenPhoto }: DamageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingDamage | null>(null);
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
    setPending({ id: null, x, y, type: 'scratch', title: '', description: '', file: null, previewUrl: null });
  }

  function handleMarkerClick(e: React.MouseEvent, point: DamagePointState) {
    e.stopPropagation();
    setPending({
      id: point.id,
      x: point.x,
      y: point.y,
      type: point.type,
      title: point.title,
      description: point.description,
      file: point.file,
      previewUrl: point.previewUrl,
    });
  }

  function handleSave() {
    if (!pending || !onChange || pending.title.trim() === '') return;
    if (pending.id) {
      onChange(
        points.map((p) =>
          p.id === pending.id
            ? {
                ...p,
                type: pending.type,
                title: pending.title,
                description: pending.description,
                file: pending.file,
                previewUrl: pending.previewUrl,
              }
            : p
        )
      );
    } else {
      onChange([
        ...points,
        {
          id: crypto.randomUUID(),
          x: pending.x,
          y: pending.y,
          type: pending.type,
          title: pending.title,
          description: pending.description,
          file: pending.file,
          previewUrl: pending.previewUrl,
        },
      ]);
    }
    closePending();
  }

  function handleDelete() {
    if (!pending?.id || !onChange) return;
    const target = points.find((p) => p.id === pending.id);
    if (target?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
    onChange(points.filter((p) => p.id !== pending.id));
    closePending();
  }

  function handleSelectPhoto(file: File) {
    if (!pending) return;
    setPending({ ...pending, file, previewUrl: URL.createObjectURL(file) });
  }

  function handleRemovePhoto() {
    if (!pending) return;
    if (pending.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(pending.previewUrl);
    setPending({ ...pending, file: null, previewUrl: null });
  }

  const panelClass =
    theme === 'dark' ? 'border-linear-hairline-strong bg-linear-surface-2' : 'border-bmw-hairline-strong bg-white';
  const headingClass = theme === 'dark' ? 'text-[14px] font-semibold text-linear-ink' : 'text-[14px] font-bold text-bmw-ink';
  const closeButtonClass =
    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ' +
    (theme === 'dark'
      ? 'text-linear-ink-subtle hover:bg-linear-surface-3 hover:text-linear-ink'
      : 'text-bmw-muted hover:bg-bmw-surface-soft hover:text-bmw-ink');
  const fieldLabelClass = theme === 'dark' ? 'text-[12px] font-medium text-linear-ink-muted' : 'text-[12px] font-medium text-bmw-muted';
  const fieldClass =
    theme === 'dark'
      ? 'h-9 w-full rounded-md border border-linear-hairline bg-linear-surface-1 px-2.5 text-[13px] text-linear-ink placeholder:text-linear-ink-subtle transition-colors focus:border-linear-primary focus:outline-none focus:ring-2 focus:ring-linear-primary/30'
      : 'h-9 w-full rounded-md border border-bmw-hairline bg-white px-2.5 text-[13px] text-bmw-ink placeholder:text-bmw-muted-soft transition-colors focus:border-bmw-primary focus:outline-none focus:ring-2 focus:ring-bmw-primary/30';

  return (
    <div className={className}>
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        role={mode === 'edit' ? 'button' : undefined}
        aria-label={mode === 'edit' ? 'Kattints a képre egy sérülés-/hiba pont felvételéhez' : undefined}
        className={
          'relative mx-auto w-full max-w-[560px] overflow-visible rounded-lg bg-white ' +
          (mode === 'edit' ? 'cursor-crosshair' : '')
        }
        style={{ aspectRatio: `${CAR_IMAGE_WIDTH} / ${CAR_IMAGE_HEIGHT}` }}
      >
        <Image
          src={CAR_IMAGE_SRC}
          alt="Autó öt nézete (elöl, hátul, felül, bal oldal, jobb oldal) a sérülések/hibák jelöléséhez"
          fill
          sizes="(max-width: 640px) 100vw, 560px"
          className="pointer-events-none select-none object-contain"
          priority={false}
        />

        {points.map((point) => {
          const isSelected = pending?.id === point.id;
          return (
            <button
              key={point.id}
              type="button"
              aria-label={`${DAMAGE_TYPE_LABEL[point.type]}: ${point.title}`}
              onClick={(e) => handleMarkerClick(e, point)}
              style={{
                left: `${point.x}%`,
                top: `${point.y}%`,
                backgroundColor: DAMAGE_TYPE_COLOR[point.type],
                boxShadow: isSelected ? `0 0 0 3px ${accent}` : undefined,
              }}
              className={
                'absolute z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-md ring-2 ring-white outline-none transition-transform sm:h-6 sm:w-6 ' +
                (isSelected ? 'scale-110' : 'hover:scale-110')
              }
            />
          );
        })}

        {pending && pending.id === null && (
          <span
            style={{ left: `${pending.x}%`, top: `${pending.y}%`, borderColor: accent }}
            className="absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-dashed"
          />
        )}
      </div>

      {pending && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={closePending}
          onKeyDown={(e) => e.key === 'Escape' && closePending()}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={'w-full max-w-sm rounded-lg border p-4 shadow-xl sm:p-5 ' + panelClass}
          >
            <div className="flex items-center justify-between gap-2">
              <p className={headingClass}>
                {mode === 'edit' ? (pending.id ? 'Sérülés/hiba szerkesztése' : 'Új sérülés/hiba') : 'Sérülés/hiba'}
              </p>
              <button type="button" onClick={closePending} aria-label="Bezárás" className={closeButtonClass}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {mode === 'edit' ? (
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className={fieldLabelClass}>Kategória</span>
                  <select
                    value={pending.type}
                    onChange={(e) => setPending({ ...pending, type: e.target.value as DamageType })}
                    className={fieldClass + ' appearance-none'}
                  >
                    {DAMAGE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {DAMAGE_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className={fieldLabelClass}>Cím</span>
                  <input
                    type="text"
                    autoFocus
                    placeholder="pl. Kavicsfelverődés"
                    value={pending.title}
                    onChange={(e) => setPending({ ...pending, title: e.target.value })}
                    className={fieldClass}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className={fieldLabelClass}>Leírás (opcionális)</span>
                  <textarea
                    placeholder="Rövid megjegyzés a sérülésről…"
                    value={pending.description}
                    onChange={(e) => setPending({ ...pending, description: e.target.value })}
                    rows={2}
                    className={
                      theme === 'dark'
                        ? 'w-full resize-none rounded-md border border-linear-hairline bg-linear-surface-1 px-2.5 py-2 text-[13px] text-linear-ink placeholder:text-linear-ink-subtle transition-colors focus:border-linear-primary focus:outline-none focus:ring-2 focus:ring-linear-primary/30'
                        : 'w-full resize-none rounded-md border border-bmw-hairline bg-white px-2.5 py-2 text-[13px] text-bmw-ink placeholder:text-bmw-muted-soft transition-colors focus:border-bmw-primary focus:outline-none focus:ring-2 focus:ring-bmw-primary/30'
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className={fieldLabelClass}>Fotó (opcionális)</span>
                  <DefectMediaUpload
                    file={pending.file}
                    previewUrl={pending.previewUrl}
                    onSelect={handleSelectPhoto}
                    onRemove={handleRemovePhoto}
                  />
                </div>

                <div className="mt-1 flex gap-2">
                  {pending.id && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-linear-danger/40 text-[13px] font-medium text-linear-danger transition-colors hover:bg-linear-danger-soft"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Törlés
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={pending.title.trim() === ''}
                    className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-linear-primary text-[13px] font-medium text-white transition-colors hover:bg-linear-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Mentés
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <span
                  className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
                  style={{ backgroundColor: `${DAMAGE_TYPE_COLOR[pending.type]}22`, color: DAMAGE_TYPE_COLOR[pending.type] }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DAMAGE_TYPE_COLOR[pending.type] }} />
                  {DAMAGE_TYPE_LABEL[pending.type]}
                </span>
                <p className={theme === 'dark' ? 'text-[14px] font-semibold text-linear-ink' : 'text-[14px] font-bold text-bmw-ink'}>
                  {pending.title}
                </p>
                {pending.description && (
                  <p className={theme === 'dark' ? 'text-[13px] text-linear-ink-subtle' : 'text-[13px] font-light text-bmw-muted'}>
                    {pending.description}
                  </p>
                )}
                {pending.previewUrl && (
                  <button
                    type="button"
                    onClick={() => onOpenPhoto?.(pending.previewUrl!)}
                    className="group relative aspect-video w-full overflow-hidden rounded-md border border-black/10"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pending.previewUrl} alt={pending.title} className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
                      <ZoomIn className="h-6 w-6" />
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Jelmagyarázat -- mindig látszik, hogy a marker-színek jelentése edit ÉS view
          módban egyaránt egyértelmű legyen. */}
      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2">
        {DAMAGE_TYPES.map((type) => (
          <span
            key={type}
            className={
              'flex items-center gap-2 text-[12px] ' +
              (theme === 'dark' ? 'font-medium text-linear-ink-subtle' : 'font-light text-bmw-muted')
            }
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DAMAGE_TYPE_COLOR[type] }} />
            {DAMAGE_TYPE_LABEL[type]}
          </span>
        ))}
      </div>
    </div>
  );
}
