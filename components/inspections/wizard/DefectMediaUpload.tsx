'use client';

import { useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { isVideoUrl } from '@/lib/reports/media';
import { cn } from '@/lib/utils';
import { iconHitSlopClass } from '@/components/ui/IconButton';
import { QrUploadPanel } from '@/components/inspections/wizard/QrUploadPanel';
import { MediaProcessingOverlay } from '@/components/inspections/wizard/MediaProcessingOverlay';
import { useMediaSelection } from '@/lib/inspections/mediaSelection';

interface DefectMediaUploadProps {
  file: File | null;
  previewUrl: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
  /** A hívó szervezet videó-csatolási jogosultsága, lásd `StepGeneralPhotos.tsx`
   * `videoAllowed` propjának JSDoc-ját, ugyanaz a wizard-szintű, egyszer lekérdezett érték.
   * Opcionális, alapértéke `false`, a `DamageCanvas.tsx` sérülés-pont fotóinál (ahol a
   * videó/QR-feltöltés NINCS a hatókörben, lásd a felhasználói kérés "Általános fotók ÉS
   * Hiba-média" pontját) egyszerűen kihagyható. */
  videoAllowed?: boolean;
  /** `defect:${clientId}`, a `qr_upload_sessions.target` oszlopba kerülő, EBBE a konkrét
   * hiba-kártyába célzó azonosító, lásd `QrUploadPanel.tsx`. Opcionális, ha nincs megadva
   * (pl. `DamageCanvas.tsx` sérülés-pont fotóinál), a "Feltöltés telefonról" panel EGYSZERŰEN
   * nem jelenik meg. */
  qrTarget?: string;
  /** A QR-kódos telefonos feltöltésből érkező, MÁR feltöltött média befogadása, a szülő
   * (`StepDefects.tsx`) ezt `file: null, previewUrl: item.url`-lel írja a `DefectState`-be,
   * ugyanabban az alakban, mint egy piszkozat szerkesztésekor visszaolvasott, korábban már
   * feltöltött média (lásd `draftPersistence.ts`). Opcionális, lásd a `qrTarget` JSDoc-ját. */
  onReceiveFromQr?: (item: { url: string; type: 'photo' | 'video' }) => void;
}

/**
 * Fotó/videó választó a hiba-kártyához. A tényleges Supabase Storage feltöltés
 * (`inspection-media` bucket) csak a wizard végleges beküldésekor történik meg (lásd
 * InspectionWizard.tsx `handleSubmit`), itt csak a fájl kiválasztása és kliens-oldali
 * előnézete zajlik, hogy a felhasználó a lépések közti navigáció közben ne generáljon
 * felesleges storage-hívásokat. **Kivétel a QR-kódos telefonos feltöltés** (`QrUploadPanel`):
 * az MÁR ténylegesen feltöltött Storage URL-t ad vissza, mert a fájl egy MÁSIK eszközön
 * (a felhasználó telefonján) él, nem lehet kliens-oldali `File`-ként "hazahozni" a wizard
 * böngészőjébe.
 *
 * Piszkozat szerkesztésekor (`/inspections/[id]`) a `previewUrl` egy már meglévő Storage
 * publikus URL is lehet `file` nélkül (a médiát korábban töltötték fel), ilyenkor a
 * `file.type` nem elérhető, a videó/fotó eldöntése az URL kiterjesztése alapján történik
 * (`isVideoUrl`, ugyanaz a segédfüggvény, mint a publikus riportban).
 *
 * **2026-08-21, "Videó-tömörítés + QR-kódos telefonos feltöltés" lépés:** a videó
 * kiválasztásának jogosultság-ellenőrzését/tömörítését a `useMediaSelection` hook végzi
 * (lásd `lib/inspections/mediaSelection.ts`), `onSelect` mostantól MINDIG egy MÁR
 * tömörített (vagy változatlan kép-) `File`-lal hívódik.
 */
export function DefectMediaUpload({
  file,
  previewUrl,
  onSelect,
  onRemove,
  videoAllowed = false,
  qrTarget,
  onReceiveFromQr,
}: DefectMediaUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isVideo = file ? file.type.startsWith('video/') : previewUrl ? isVideoUrl(previewUrl) : false;
  const { selectMediaFile, modalState } = useMediaSelection({ videoAllowed });

  async function handleFileChange(selected: File) {
    const result = await selectMediaFile(selected);
    if (result) onSelect(result);
  }

  if (previewUrl) {
    return (
      // A KÜLSŐ konténeren SZÁNDÉKOSAN nincs `overflow-hidden`, csak a BELSŐ rétegen,
      // ami kizárólag a videó/kép vágásáért felel. Ha a vágás itt, a törlés-gomb szülőjén
      // lenne, a gomb `iconHitSlopClass` hit-slop pszeudo-eleme levágódna, és a bővített
      // érintési terület a gyakorlatban nem működne, lásd
      // docs/ux-touch-targets-plan-2026-08-14.md C) pontjának technikai buktatóját.
      <div className="relative w-full max-w-[220px] rounded-md border border-linear-hairline bg-linear-surface-2">
        <div className="overflow-hidden rounded-md">
          {isVideo ? (
            <video src={previewUrl} controls className="aspect-video w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element, kliens-oldali object URL előnézet, nem optimalizálható a next/image-vel
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
    <div className="flex w-full max-w-[220px] flex-col gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-linear-hairline-strong bg-linear-surface-2 px-4 py-6 text-center transition-colors hover:border-linear-primary hover:bg-linear-surface-3"
      >
        <ImagePlus className="h-5 w-5 text-linear-ink-subtle" />
        {/* A gomb szövege NEM említi a videót, ha a szervezet nem jogosult rá, korábban ez
            a szöveg MINDIG "Fotó / videó feltöltése" volt, függetlenül a jogosultságtól, és
            csak az `accept` attribútum tért el csendben, ez a felhasználó szerint nem volt
            egyértelmű (2026-08-21-i visszajelzés: "legyen egyértelműbb... hogy a nem jogosult
            csomagok nem tudnak feltölteni videót"). A tényleges kikényszerítés VÁLTOZATLANUL
            a szerveren történik (lásd `useMediaSelection`/`assertVideoUploadAllowed`), ez itt
            KIZÁRÓLAG a szöveg, hogy a felhasználó már a gomb megpillantásakor tudja, mire
            számíthat, ne csak egy elutasított feltöltési kísérlet után. */}
        <span className="text-[12px] font-medium text-linear-ink-subtle">
          {videoAllowed ? 'Fotó / videó feltöltése' : 'Fotó feltöltése'}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={videoAllowed ? 'image/*,video/*' : 'image/*'}
          className="hidden"
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) void handleFileChange(selected);
            e.target.value = '';
          }}
        />
      </button>

      {qrTarget && onReceiveFromQr && <QrUploadPanel target={qrTarget} onReceive={onReceiveFromQr} />}
      <MediaProcessingOverlay state={modalState} />
    </div>
  );
}
