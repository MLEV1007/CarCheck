import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LicensePlateBadgeProps {
  value: string | null | undefined;
  className?: string;
  /** `sm` a szűk helyeken (Dashboard táblázat sora) -- `md` (alapértelmezett) mindenhol
   * máshol (Wizard Áttekintés, `/inspections/[id]` adatlap, Publikus Riport hero). */
  size?: 'sm' | 'md';
}

/**
 * Rendszám "felségjelzés" (PROJEKT_INSTRUKCIOK.md, "Rendszám felségjelzés" lépés) --
 * az EU rendszámtáblák bal oldali kék sávjának vizuális utánzata ("H" ország-jelölés +
 * csillag), a rendszám szövege mellett. Design-rendszer-FÜGGETLEN, direkt ezért él a
 * `components/ui/`-ban (`Button.tsx`/`Input.tsx` mintájára) -- Linear dark app (Wizard,
 * `/inspections/[id]`), BMW light Publikus Riport és a Dashboard lista is UGYANEZT
 * használja: egy fizikai rendszámtábla mindig fehér/kék/fekete, FÜGGETLENÜL a körülötte
 * lévő felület design rendszerétől, ezért itt szándékosan literal (nem design-token)
 * színek szerepelnek.
 *
 * Ha nincs megadva rendszám, egyszerű "—" jelenik meg badge nélkül (ugyanaz a fallback,
 * mint a rendszám eddigi sima szöveges megjelenítésénél).
 */
export function LicensePlateBadge({ value, className, size = 'md' }: LicensePlateBadgeProps) {
  if (!value) return <span className={className}>—</span>;

  const isCompact = size === 'sm';

  return (
    <span
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-[3px] border border-black/15 align-middle shadow-sm',
        className
      )}
    >
      <span
        className={cn(
          'flex flex-col items-center justify-center gap-0.5 bg-[#003399]',
          isCompact ? 'px-[3px] py-0.5' : 'px-1 py-1'
        )}
      >
        <Star className={cn('fill-[#ffcc00] text-[#ffcc00]', isCompact ? 'h-[5px] w-[5px]' : 'h-2 w-2')} />
        <span className={cn('font-bold leading-none text-white', isCompact ? 'text-[6px]' : 'text-[8px]')}>H</span>
      </span>
      <span
        className={cn(
          'bg-white font-mono font-bold leading-none text-black',
          isCompact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-[14px] tracking-wide'
        )}
      >
        {value}
      </span>
    </span>
  );
}
