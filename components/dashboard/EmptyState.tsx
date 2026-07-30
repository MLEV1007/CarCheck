import Link from 'next/link';
import { ClipboardList, Plus } from 'lucide-react';

/**
 * Üres állapot, ha a bejelentkezett usernek még egyetlen vizsgálata sincs.
 * Linear design system: surface-1 kártya, tompított ikon-medál, egyetlen elsődleges CTA.
 */
export function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-linear-hairline bg-linear-surface-1 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-linear-surface-2">
        <ClipboardList className="h-5 w-5 text-linear-ink-subtle" />
      </div>
      <div>
        <p className="text-[15px] font-medium text-linear-ink">Még nincs rögzített autóvizsgálatod</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-linear-ink-subtle">
          Indítsd el az elsőt, és pár lépésben elkészítheted az első interaktív ügyfélriportot.
        </p>
      </div>
      <Link
        href="/inspections/new"
        className="inline-flex h-10 items-center gap-1.5 rounded-md bg-linear-primary px-4 text-[14px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
      >
        <Plus className="h-4 w-4" />
        Első vizsgálat indítása
      </Link>
    </div>
  );
}
