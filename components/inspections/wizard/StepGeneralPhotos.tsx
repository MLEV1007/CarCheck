'use client';

import { useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { WizardStepFooter } from '@/components/inspections/wizard/WizardBottomBar';
import { CREATE_GENERAL_PHOTO, type GeneralPhotoState } from '@/lib/inspections/types';
import { HintCallout } from '@/components/onboarding/HintCallout';

interface StepGeneralPhotosProps {
  value: GeneralPhotoState[];
  onChange: (value: GeneralPhotoState[]) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
}

/**
 * LÉPÉS 2 -- Általános autó fotók (PROJEKT_INSTRUKCIOK.md, "Általános autó fotók modul"
 * lépés). A hiba-fotóktól (StepDefects.tsx) függetlenül, egyetlen `inspections.general_photos`
 * szöveg-tömbbe kerülnek -- áttekintő képek a jármű állapotáról (elölről/hátulról/oldalról/
 * beltér/műszerfal), amik a publikus riport "Gépjármű fotók" galériájában jelennek meg.
 *
 * Több kép egyszerre kiválasztható (`multiple`); a tényleges Supabase Storage feltöltés,
 * ugyanúgy mint a hiba-médiánál, csak a wizard végleges beküldésekor történik meg (lásd
 * InspectionWizard.tsx `handleSubmit`) -- itt csak a kiválasztás és a kliens-oldali
 * előnézet (`URL.createObjectURL`) zajlik.
 */
export function StepGeneralPhotos({ value, onChange, onBack, onNext, nextLabel }: StepGeneralPhotosProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFilesSelected(files: FileList) {
    const newPhotos = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => CREATE_GENERAL_PHOTO(file));
    if (newPhotos.length > 0) onChange([...value, ...newPhotos]);
  }

  function handleRemove(clientId: string) {
    const target = value.find((photo) => photo.clientId === clientId);
    if (target?.file && target.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
    onChange(value.filter((photo) => photo.clientId !== clientId));
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
        Készíts képet elölről, hátulról, mindkét oldalról és a beltérről is -- ezek kerülnek az ügyfélnek
        küldött riport fotógalériájába.
      </HintCallout>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {value.map((photo) => (
          <div
            key={photo.clientId}
            className="relative aspect-square overflow-hidden rounded-md border border-linear-hairline bg-linear-surface-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- kliens-oldali object URL / meglévő Storage URL előnézet */}
            <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => handleRemove(photo.clientId)}
              aria-label="Fotó eltávolítása"
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
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
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFilesSelected(e.target.files);
              e.target.value = '';
            }}
          />
        </button>
      </div>

      <WizardStepFooter onBack={onBack} onNext={onNext} nextLabel={nextLabel} />
    </div>
  );
}
