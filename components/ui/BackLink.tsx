import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BackLinkProps {
  href: string;
  label?: string;
  className?: string;
}

/**
 * Fejléc "vissza" nyíl -- korábban 4 fájlban (InspectionDetailView.tsx, app/admin/page.tsx,
 * app/inspections/new/page.tsx, app/inspections/[id]/page.tsx) szó szerint duplikált
 * kódrészlet volt, `h-8 w-8` (32px) érintési területtel -- lásd
 * `docs/ux-touch-targets-plan-2026-08-14.md` F) pontját.
 *
 * A `IconButton.tsx`-től ELTÉRŐEN itt NEM láthatatlan hit-slopot használunk, hanem a
 * TÉNYLEGES dobozt növeljük 44x44px-re: a 64px magas fejlécekben (`h-16`) bőven van
 * felesleges függőleges hely, és ez egy önálló, semmivel nem szomszédos elem a fejléc bal
 * szélén -- ráadásul a 4 fájl amúgy is duplikált kódrészlet volt, tehát ez egyben a DRY-
 * kiemelés alkalma is. Az ikon mérete (`h-4 w-4`) VÁLTOZATLAN marad, csak a köré rajzolt
 * kattintható doboz nő -- a `-ml-1.5` a doboz-növelésből adódó vizuális eltolódást
 * kompenzálja, hogy az ikon a fejléc bal padding-jéhez képest pontosan ugyanott maradjon,
 * mint korábban (44-32=12px növekmény, ennek fele, 6px, a kompenzáció).
 */
export function BackLink({ href, label = 'Vissza a dashboardra', className }: BackLinkProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 -ml-1.5 items-center justify-center rounded-md text-linear-ink-subtle transition-colors hover:bg-linear-surface-1 hover:text-linear-ink',
        className
      )}
    >
      <ArrowLeft className="h-4 w-4" />
    </Link>
  );
}
