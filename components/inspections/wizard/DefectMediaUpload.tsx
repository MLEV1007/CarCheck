'use client';

import { useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { isVideoUrl } from '@/lib/reports/media';
import { cn } from '@/lib/utils';
import { iconHitSlopClass } from '@/components/ui/IconButton';

interface DefectMediaUploadProps {
  file: File | null;
  previewUrl: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
}

/**
 * Fotó/videó választó a hiba-kártyához. A tényleges Supabase Storage feltöltés
 * (`inspection-media` bucket) csak a wizard végleges beküldésekor történik meg
 * (lásd InspectionWizard.tsx `handleSubmit`) -- itt csak a fájl kiválasztása és
 * kliens-oldali előnézete zajlik, hogy a felhasználó a lépések közti navigáció
 * közben ne generáljon felesleges storage-hívásokat.
 *
 * Piszkozat szerkesztésekor (`/inspections/[id]`) a `previewUrl` egy már meglévő
 * Storage publikus URL is lehet `file` nélkül (a médiát korábban töltötték fel) --
 * ilyenkor a `file.type` nem elérhető, a videó/fotó eldöntése az URL kiterjesztése
 * alapján történik (`isVideoUrl`, ugyanaz a segédfüggvény, mint a publikus riportban).
 */
export function DefectMediaUpload({ file, previewUrl, onSelect, onRemove }: DefectMediaUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isVideo = file ? file.type.startsWith('video/') : previewUrl ? isVideoUrl(previewUrl) : false;

  if (previewUrl) {
    return (
      // A KÜLSŐ konténeren SZÁNDÉKOSAN nincs `overflow-hidden` -- csak a BELSŐ rétegen,
      // ami kizárólag a videó/kép vágásáért felel. Ha a vágás itt, a törlés-gomb szülőjén
      // lenne, a gomb `iconHitSlopClass` hit-slop pszeudo-eleme levágódna, és a bővített
      // érintési terület a gyakorlatban nem működne -- lásd
      // docs/ux-touch-targets-plan-2026-08-14.md C) pontjának technikai buktatóját.
      <div className="relative w-full max-w-[220px] rounded-md border border-linear-hairline bg-linear-surface-2">
        <div className="overflow-hidden rounded-md">
          {isVideo ? (
            <video src={previewUrl} controls className="aspect-video w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- kliens-oldali object URL előnézet, nem optimalizálható a next/image-vel
            <img src={previewUrl} alt={file?.name ?? 'Feltöltött média'} className="aspect-video w-full object-cover" />
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Média eltávolítása"
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

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="flex w-full max-w-[220px] flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-linear-hairline-strong bg-linear-surface-2 px-4 py-6 text-center transition-colors hover:border-linear-primary hover:bg-linear-surface-3"
    >
      <ImagePlus className="h-5 w-5 text-linear-ink-subtle" />
      <span className="text-[12px] font-medium text-linear-ink-subtle">Fotó / videó feltöltése</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) onSelect(selected);
          e.target.value = '';
        }}
      />
    </button>
  );
}
