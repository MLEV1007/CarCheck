'use client';

import { useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import { WizardStepFooter } from '@/components/inspections/wizard/WizardBottomBar';
import { CREATE_GENERAL_PHOTO, type GeneralPhotoState } from '@/lib/inspections/types';
import { HintCallout } from '@/components/onboarding/HintCallout';
import { RemovablePhotoThumbnail } from '@/components/inspections/wizard/RemovablePhotoThumbnail';
import { QrUploadPanel } from '@/components/inspections/wizard/QrUploadPanel';
import { MediaProcessingOverlay } from '@/components/inspections/wizard/MediaProcessingOverlay';
import { useMediaSelection } from '@/lib/inspections/mediaSelection';
import { isVideoUrl } from '@/lib/reports/media';

interface StepGeneralPhotosProps {
  value: GeneralPhotoState[];
  onChange: (value: GeneralPhotoState[]) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe, lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
  /** A hívó szervezet videó-csatolási jogosultsága (`user_credits.plan_tier` `pro`/`business`),
   * lásd `InspectionWizard.tsx`, ahol EGYSZER, a wizard szintjén kerül lekérdezésre
   * (`/api/quotas/summary`) és adódik tovább propként ide ÉS a `StepDefects.tsx`-nek. */
  videoAllowed: boolean;
}

/** Igaz, ha egy általános fotó-elem médiája videó, ugyanaz az elv, mint
 * `StepDefects.tsx` `isDefectVideo`-ja. */
function isGeneralPhotoVideo(photo: GeneralPhotoState): boolean {
  if (photo.file) return photo.file.type.startsWith('video/');
  return isVideoUrl(photo.previewUrl);
}

/**
 * LÉPÉS 2, Általános autó fotók (PROJEKT_INSTRUKCIOK.md, "Általános autó fotók modul"
 * lépés). A hiba-fotóktól (StepDefects.tsx) függetlenül, egyetlen `inspections.general_photos`
 * szöveg-tömbbe kerülnek, áttekintő képek a jármű állapotáról (elölről/hátulról/oldalról/
 * beltér/műszerfal), amik a publikus riport "Gépjármű fotók" galériájában jelennek meg.
 *
 * Több kép egyszerre kiválasztható (`multiple`); a tényleges Supabase Storage feltöltés,
 * ugyanúgy mint a hiba-médiánál, csak a wizard végleges beküldésekor történik meg (lásd
 * InspectionWizard.tsx `handleSubmit`), itt csak a kiválasztás és a kliens-oldali
 * előnézet (`URL.createObjectURL`) zajlik.
 *
 * **2026-08-21, "Videó-tömörítés + QR-kódos telefonos feltöltés" lépés:** a fájlválasztó
 * mostantól videót is elfogad (jogosult, Profi/Autóház, szervezeteknél), a
 * `useMediaSelection` hook végzi a jogosultság-ellenőrzést/tömörítést/vágás-megerősítést
 * (lásd `lib/inspections/mediaSelection.ts`). A "Feltöltés telefonról" QR-panel
 * (`QrUploadPanel.tsx`) a `target: 'general'`-lel érkező elemeket EGYENESEN a MÁR feltöltött
 * Storage URL alakjában (`file: null`, `previewUrl: <url>`) illeszti be, ugyanaz a
 * `draftPersistence.ts` által is támogatott, "már feltöltve" állapot, amit egy piszkozat
 * szerkesztésekor is látunk.
 */
export function StepGeneralPhotos({ value, onChange, onBack, onNext, nextLabel, videoAllowed }: StepGeneralPhotosProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { selectMediaFile, modalState } = useMediaSelection({ videoAllowed });

  async function handleFilesSelected(files: FileList) {
    const candidates = Array.from(files).filter(
      (file) => file.type.startsWith('image/') || file.type.startsWith('video/')
    );

    const newPhotos: GeneralPhotoState[] = [];
    for (const file of candidates) {
      // Szándékosan SZEKVENCIÁLIS (nem `Promise.all`), egyszerre csak EGY videó
      // tömörítése fusson (a `useMediaSelection` "generáció"-védelme is erre az esetre
      // készült, de a felhasználónak is egyértelműbb egy soros folyamatjelző, mint több
      // párhuzamos tömörítés versengő progress-üzenete).
      const result = await selectMediaFile(file);
      if (result) newPhotos.push(CREATE_GENERAL_PHOTO(result));
    }
    if (newPhotos.length > 0) onChange([...value, ...newPhotos]);
  }

  function handleRemove(clientId: string) {
    const target = value.find((photo) => photo.clientId === clientId);
    if (target?.file && target.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
    onChange(value.filter((photo) => photo.clientId !== clientId));
  }

  function handleQrReceive(item: { url: string; type: 'photo' | 'video' }) {
    onChange([...value, { clientId: crypto.randomUUID(), file: null, previewUrl: item.url }]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Általános autó fotók</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Tölts fel áttekintő képeket az autóról kívül-belül. A képek bekerülnek a publikus riport
          galériájába. (Opcionális)
        </p>
      </div>

      <HintCallout id="general-photos" title="Tipp: mutasd meg az egészet">
        Készíts képet elölről, hátulról, mindkét oldalról és a beltérről is. Ezek kerülnek az ügyfélnek
        küldött riport fotógalériájába.
      </HintCallout>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {value.map((photo) => (
          <RemovablePhotoThumbnail
            key={photo.clientId}
            previewUrl={photo.previewUrl}
            isVideo={isGeneralPhotoVideo(photo)}
            onRemove={() => handleRemove(photo.clientId)}
          />
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-linear-hairline-strong bg-linear-surface-1 px-2 text-center transition-colors hover:border-linear-primary hover:bg-linear-surface-3"
        >
          <ImagePlus className="h-5 w-5 text-linear-ink-subtle" />
          <span className="text-[12px] font-medium text-linear-ink-subtle">Fotók hozzáadása</span>
          <input
            ref={inputRef}
            type="file"
            accept={videoAllowed ? 'image/*,video/*' : 'image/*'}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleFilesSelected(e.target.files);
              e.target.value = '';
            }}
          />
        </button>
      </div>

      <QrUploadPanel target="general" onReceive={handleQrReceive} />
      <MediaProcessingOverlay state={modalState} />

      <WizardStepFooter onBack={onBack} onNext={onNext} nextLabel={nextLabel} />
    </div>
  );
}
