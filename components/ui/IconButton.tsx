import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Érintési célterület (touch target) közös alap, lásd
 * `docs/ux-touch-targets-plan-2026-08-14.md`. A HIG (44x44pt) / Material (48x48dp) / WCAG 2.5.5
 * (AAA, 44x44 CSS px) minimum a cél, DE a Linear design system (linear.md) tudatosan tömör
 * vizuális méreteket ír elő a Szakértői Munkaterületen (24/28/32px ikon-gombok), ezért a
 * VIZUÁLIS méretet és az ÉRINTÉSI területet szét kell választani: a gomb kinézete NEM
 * változik, csak egy láthatatlan `::before` pszeudo-elem bővíti ki a tényleges
 * kattintható/koppintható zónát 44x44px-re (a `(44 - vizuális méret) / 2` matek szerint).
 *
 * FONTOS KORLÁT: ha a gomb szülőjén `overflow-hidden` van (pl. egy fotó-thumbnail
 * lekerekített sarkainak vágásához), ez a technika NEM működik, a levágott terület sem
 * nem látszik, sem kattintást nem fogad el. Ilyen esetben a DOM-ot kétrétegűre kell
 * bontani, lásd `RemovablePhotoThumbnail.tsx` mintáját.
 */
export type IconHitTargetSize = 24 | 28 | 32;

const VISUAL_SIZE_CLASS: Record<IconHitTargetSize, string> = {
  24: 'h-6 w-6',
  28: 'h-7 w-7',
  32: 'h-8 w-8',
};

// (44 - méret) / 2, a legközelebbi Tailwind spacing tokenre kerekítve.
const HIT_SLOP_INSET_CLASS: Record<IconHitTargetSize, string> = {
  24: 'before:-inset-2.5', // 24 + 2*10 = 44
  28: 'before:-inset-2', // 28 + 2*8  = 44
  32: 'before:-inset-1.5', // 32 + 2*6  = 44
};

/**
 * A hit-slop pszeudo-elemhez szükséges class-ok, akkor használd közvetlenül (a szülő
 * `<button>`/`<a>` elemre rakva `cn(...)`-nel), ha az `IconButton` komponens saját
 * markup/stílus miatt nem illik (pl. egyedi `<a>` link, vagy már meglévő, egyedi vizuális
 * állapotokkal rendelkező gomb, mint a `VoiceInputButton` diktálás-jelzése vagy a
 * `PaintCanvas`/`DamageCanvas` popover-jeinek téma szerint váltakozó stílusa). Csak a
 * `relative`/`before:absolute`/`before:inset-*` osztályokat adja hozzá, a vizuális
 * méretet (`h-*`/`w-*`) a hívó félnek KELL megadnia.
 */
export function iconHitSlopClass(size: IconHitTargetSize) {
  return cn('relative', HIT_SLOP_INSET_CLASS[size], 'before:absolute before:content-[""]');
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Vizuális doboz mérete (px), lásd a fájl-JSDoc-ot. Az érintési terület a `size`-tól
   * függetlenül MINDIG 44x44px (láthatatlan hit-slop pszeudo-elemmel). */
  size?: IconHitTargetSize;
  variant?: 'ghost' | 'ghost-danger';
}

/**
 * Közös, semleges ("ghost") ikon-gomb primitíva a Linear munkaterülethez, a
 * `text-linear-ink-subtle hover:bg-linear-surface-2 hover:text-linear-ink[/danger]`
 * mintázatot egységesíti (korábban minden ikon-gomb egyedi, kézzel írt `className` string
 * volt, lásd a touch target terv "Root cause" fejezetét).
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = 32, variant = 'ghost', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md transition-colors',
          VISUAL_SIZE_CLASS[size],
          iconHitSlopClass(size),
          variant === 'ghost' && 'text-linear-ink-subtle hover:bg-linear-surface-2 hover:text-linear-ink',
          variant === 'ghost-danger' && 'text-linear-ink-subtle hover:bg-linear-surface-2 hover:text-linear-danger',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
IconButton.displayName = 'IconButton';
