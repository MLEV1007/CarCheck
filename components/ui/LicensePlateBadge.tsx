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
  /** `sm` a szűk helyeken (Dashboard táblázat sora, fix `h-7` magassággal) -- `md`
   * (alapértelmezett) mindenhol máshol (Wizard Áttekintés, `/inspections/[id]` adatlap,
   * Publikus Riport hero). */
  size?: 'sm' | 'md';
}

/**
 * Rendszám "felségjelzés" -- az EU rendszámtáblák bal oldali kék sávjának vizuális utánzata
 * (ország-jelölés betűkóddal + csillag), a rendszám szövege mellett. Design-rendszer-FÜGGETLEN,
 * direkt ezért él a `components/ui/`-ban (`Button.tsx`/`Input.tsx` mintájára) -- Linear dark
 * app (Wizard, `/inspections/[id]`), BMW light Publikus Riport és a Dashboard lista is
 * UGYANEZT használja: egy fizikai rendszámtábla mindig fehér/kék/fekete, FÜGGETLENÜL a
 * körülötte lévő felület design rendszerétől vagy világos/sötét témájától, ezért itt
 * SZÁNDÉKOSAN literal (nem `linear-*`/`bmw-*` design-token) Tailwind színek szerepelnek
 * (`slate-*`, `#003399`, `#ffcc00`) -- ez a "Dashboard táblázat teljes UX/UI újratervezése"
 * lépés explicit kérése egy "igazi autós rendszám" megjelenésre.
 *
 * A kék sáv EGY SORBAN (nem stack-elve) jeleníti meg a csillagot + a betűkódot, mert a
 * `countryCode` 1-5 karakter hosszú is lehet ("H"-tól "Egyéb"-ig) -- egy vízszintes
 * elrendezés magától szélesedik a tartalommal, míg egy függőlegesen egymásra rakott
 * elrendezésnél a hosszabb kódok (pl. "Egyéb") kicsorbultak/tördelődtek volna a kis
 * badge-ben. A `min-w-[24px]`/`min-w-[28px]` garantálja, hogy egyetlen karakteres kódnál
 * ("H") se legyen aránytalanul keskeny a sáv.
 *
 * A rendszám-szöveg `min-w-0 truncate`-et kap -- egy szokatlanul hosszú (pl. teszt-)
 * rendszám ellipszisre vágódik, sosem feszíti szét/lógat ki a badge dobozából.
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
        'inline-flex max-w-full items-center overflow-hidden rounded border border-slate-300 bg-white align-middle shadow-sm',
        isCompact ? 'h-7' : 'h-8',
        className
      )}
    >
      <span
        className={cn(
          'flex h-full shrink-0 items-center justify-center gap-0.5 whitespace-nowrap bg-[#003399] font-bold text-white',
          isCompact ? 'min-w-[24px] px-1.5 text-[10px]' : 'min-w-[28px] px-2 text-[11px]'
        )}
      >
        <Star className={cn('shrink-0 fill-[#ffcc00] text-[#ffcc00]', isCompact ? 'h-[7px] w-[7px]' : 'h-2 w-2')} />
        {resolvedCountryCode}
      </span>
      <span
        className={cn(
          'min-w-0 truncate px-2 font-mono font-bold uppercase tracking-wider text-slate-900',
          isCompact ? 'text-xs' : 'text-sm'
        )}
      >
        {value}
      </span>
    </span>
  );
}
