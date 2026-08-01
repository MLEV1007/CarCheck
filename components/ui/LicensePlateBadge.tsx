import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFAULT_LICENSE_PLATE_COUNTRY } from '@/lib/inspections/constants';

interface LicensePlateBadgeProps {
  value: string | null | undefined;
  className?: string;
  /** A kék sáv betűkódja (pl. "H", "SK", "Egyéb") -- lásd `lib/inspections/constants.ts`
   * `LICENSE_PLATE_COUNTRIES`. Ha nincs megadva, `DEFAULT_LICENSE_PLATE_COUNTRY` ("H") a
   * fallback -- ez csak a modul bevezetése ELŐTTI, `license_plate_country` nélküli
   * korábbi adatoknál fordulhat elő ténylegesen (a DB oszlop `not null default 'H'`). */
  countryCode?: string | null;
  /** `sm` a szűk helyeken (Dashboard táblázat sora) -- `md` (alapértelmezett) mindenhol
   * máshol (Wizard Áttekintés, `/inspections/[id]` adatlap, Publikus Riport hero). */
  size?: 'sm' | 'md';
}

/**
 * Rendszám "felségjelzés" (PROJEKT_INSTRUKCIOK.md, "Rendszám felségjelzés dropdown és
 * profilhoz kötött alapértelmezés" lépés) -- az EU rendszámtáblák bal oldali kék sávjának
 * vizuális utánzata (ország-jelölés betűkóddal + csillag), a rendszám szövege mellett.
 * Design-rendszer-FÜGGETLEN, direkt ezért él a `components/ui/`-ban (`Button.tsx`/
 * `Input.tsx` mintájára) -- Linear dark app (Wizard, `/inspections/[id]`), BMW light
 * Publikus Riport és a Dashboard lista is UGYANEZT használja: egy fizikai rendszámtábla
 * mindig fehér/kék/fekete, FÜGGETLENÜL a körülötte lévő felület design rendszerétől,
 * ezért itt szándékosan literal (nem design-token) színek szerepelnek.
 *
 * A kék sáv EGY SORBAN (nem stack-elve) jeleníti meg a csillagot + a betűkódot, mert a
 * `countryCode` 1-5 karakter hosszú is lehet ("H"-tól "Egyéb"-ig) -- egy vízszintes
 * elrendezés magától szélesedik a tartalommal, míg egy függőlegesen egymásra rakott
 * elrendezésnél a hosszabb kódok (pl. "Egyéb") kicsorbultak/tördelődtek volna a kis
 * badge-ben.
 *
 * Ha nincs megadva rendszám, egyszerű "—" jelenik meg badge nélkül (ugyanaz a fallback,
 * mint a rendszám eddigi sima szöveges megjelenítésénél).
 */
export function LicensePlateBadge({ value, className, countryCode, size = 'md' }: LicensePlateBadgeProps) {
  if (!value) return <span className={className}>—</span>;

  const isCompact = size === 'sm';
  const resolvedCountryCode = countryCode?.trim() || DEFAULT_LICENSE_PLATE_COUNTRY;

  return (
    <span
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-[3px] border border-black/15 align-middle shadow-sm',
        className
      )}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center gap-[3px] bg-[#003399] whitespace-nowrap',
          isCompact ? 'px-1 py-0.5' : 'px-1.5 py-1'
        )}
      >
        <Star className={cn('shrink-0 fill-[#ffcc00] text-[#ffcc00]', isCompact ? 'h-[6px] w-[6px]' : 'h-2 w-2')} />
        <span className={cn('font-bold leading-none text-white', isCompact ? 'text-[8px]' : 'text-[9px]')}>
          {resolvedCountryCode}
        </span>
      </span>
      <span
        className={cn(
          'min-w-0 truncate bg-white font-mono font-bold leading-none tracking-wider text-black',
          isCompact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-[14px] tracking-wide'
        )}
      >
        {value}
      </span>
    </span>
  );
}
