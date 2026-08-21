'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { iconHitSlopClass } from '@/components/ui/IconButton';

interface RemovablePhotoThumbnailProps {
  previewUrl: string;
  onRemove: () => void;
  alt?: string;
  removeLabel?: string;
  /** Igaz, ha a `previewUrl` egy videóra mutat (2026-08-21, "Videó-tömörítés + QR-kódos
   * telefonos feltöltés" lépés -- lásd `StepGeneralPhotos.tsx`, az EGYETLEN jelenlegi hívó,
   * ahol a média videó is lehet) -- ilyenkor `<video>`-t renderelünk `<img>` helyett, hogy a
   * kép ne törjön el egy videó URL-lel. */
  isVideo?: boolean;
}

/**
 * Négyzetes fotó-előnézet kártya, sarokban törlés-gombbal -- korábban szó szerint
 * duplikálva volt `StepServiceHistory.tsx` és `StepGeneralPhotos.tsx` fájlokban, `h-6 w-6`
 * (24px) érintési területtel -- lásd `docs/ux-touch-targets-plan-2026-08-14.md` C) pontját.
 *
 * KÉTRÉTEGŰ DOM SZÁNDÉKOSAN: a KÜLSŐ konténeren NINCS `overflow-hidden` (csak a BELSŐ,
 * kizárólag a képet tartalmazó rétegen) -- ha a vágás a törlés-gomb szülőjén lenne, az
 * `iconHitSlopClass` láthatatlan hit-slop pszeudo-eleme levágódna a konténer határánál, és
 * a bővített érintési terület a gyakorlatban NEM működne a vizuális kép-határon túl (lásd a
 * touch target terv C) pontjának "Kritikus technikai buktató" megjegyzését).
 *
 * Grid-elrendezésben (2 oszlop mobilon, `gap-3` = 12px) használva a hit-slop legfeljebb
 * 4px-cel nyúlik túl a kártya vizuális határán -- ez biztonságos, nem ér át a szomszédos
 * thumbnail saját hit-zónájába.
 */
export function RemovablePhotoThumbnail({
  previewUrl,
  onRemove,
  alt = '',
  removeLabel = 'Fotó eltávolítása',
  isVideo = false,
}: RemovablePhotoThumbnailProps) {
  return (
    <div className="relative aspect-square rounded-md border border-linear-hairline bg-linear-surface-2">
      <div className="absolute inset-0 overflow-hidden rounded-md">
        {isVideo ? (
          <video src={previewUrl} className="h-full w-full object-cover" muted />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- kliens-oldali object URL / meglévő Storage URL előnézet
          <img src={previewUrl} alt={alt} className="h-full w-full object-cover" />
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className={cn(
          'absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90',
          iconHitSlopClass(24)
        )}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
