'use client';

import { useRef } from 'react';
import { FileText, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { TextField, TextareaField } from '@/components/inspections/wizard/FormControls';
import { SERVICE_ENTRY_TYPE_SUGGESTIONS, SERVICE_HISTORY_STATUS_DESCRIPTION, SERVICE_HISTORY_STATUS_LABEL } from '@/lib/inspections/constants';
import { sanitizeServiceDate, sanitizeServiceMileage } from '@/lib/inspections/validation';
import { CREATE_GENERAL_PHOTO, EMPTY_SERVICE_HISTORY_ENTRY, type ServiceHistoryState, type ServiceHistoryStatus } from '@/lib/inspections/types';

interface StepServiceHistoryProps {
  value: ServiceHistoryState;
  onChange: (value: ServiceHistoryState) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
}

const STATUS_OPTIONS: ServiceHistoryStatus[] = ['full', 'partial', 'digital', 'none'];

/**
 * LÉPÉS -- Szervizmúlt & Dokumentumok modul (PROJEKT_INSTRUKCIOK.md, "Szervizmúlt &
 * Dokumentumok modul" lépés). 3 alappillér:
 *  A) Általános státusz -- 4 választható rádiógomb-kártya (`SERVICE_HISTORY_STATUS_LABEL`).
 *  B) Fotófeltöltés -- a szervizkönyv/számlák lefotózása, ugyanaz a minta, mint a
 *     `StepGeneralPhotos.tsx`-nél (több kép egyszerre, kliens-oldali előnézet, a tényleges
 *     Storage-feltöltés csak a végleges mentéskor történik).
 *  C) Manuális Idővonal -- dinamikus, dátum/km óra állás/típus/megjegyzés bejegyzés-kártyák,
 *     ugyanaz a minta, mint a `StepDiagnostics.tsx` hibakód-listájánál.
 */
export function StepServiceHistory({ value, onChange, onBack, onNext, nextLabel }: StepServiceHistoryProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function setStatus(status: ServiceHistoryStatus) {
    onChange({ ...value, status });
  }

  function handleFilesSelected(files: FileList) {
    const newPhotos = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => CREATE_GENERAL_PHOTO(file));
    if (newPhotos.length > 0) onChange({ ...value, photos: [...value.photos, ...newPhotos] });
  }

  function handleRemovePhoto(clientId: string) {
    const target = value.photos.find((photo) => photo.clientId === clientId);
    if (target?.file && target.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
    onChange({ ...value, photos: value.photos.filter((photo) => photo.clientId !== clientId) });
  }

  function addEntry() {
    onChange({ ...value, entries: [...value.entries, EMPTY_SERVICE_HISTORY_ENTRY()] });
  }

  function updateEntry(id: string, patch: Partial<{ date: string; mileage: string; type: string; notes: string }>) {
    onChange({
      ...value,
      entries: value.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  }

  function removeEntry(id: string) {
    onChange({ ...value, entries: value.entries.filter((entry) => entry.id !== id) });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Szervizmúlt & Dokumentumok</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Rögzítsd a jármű szervizmúltjának állapotát, a dokumentumok fotóit, és -- ha rendelkezésre áll --
          a korábbi szerviz-események idővonalát.
        </p>
      </div>

      {/* A) Általános státusz */}
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">Általános státusz</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {STATUS_OPTIONS.map((status) => {
            const isSelected = value.status === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatus(status)}
                aria-pressed={isSelected}
                className={
                  'flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors ' +
                  (isSelected
                    ? 'border-linear-primary bg-linear-primary/10'
                    : 'border-linear-hairline bg-linear-surface-1 hover:bg-linear-surface-2')
                }
              >
                <span className={'text-[14px] font-medium ' + (isSelected ? 'text-linear-ink' : 'text-linear-ink')}>
                  {SERVICE_HISTORY_STATUS_LABEL[status]}
                </span>
                <span className="text-[12px] text-linear-ink-subtle">{SERVICE_HISTORY_STATUS_DESCRIPTION[status]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* B) Fotófeltöltés */}
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Dokumentumok fotói (szervizkönyv, számlák)
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {value.photos.map((photo) => (
            <div
              key={photo.clientId}
              className="relative aspect-square overflow-hidden rounded-md border border-linear-hairline bg-linear-surface-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- kliens-oldali object URL / meglévő Storage URL előnézet */}
              <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemovePhoto(photo.clientId)}
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
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
            />
          </button>
        </div>
      </div>

      {/* C) Manuális Idővonal */}
      <div className="flex flex-col gap-4">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Manuális idővonal ({value.entries.length} bejegyzés)
        </p>

        {value.entries.map((entry, index) => (
          <div key={entry.id} className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
                <FileText className="h-3.5 w-3.5" />#{index + 1}. bejegyzés
              </span>
              <button
                type="button"
                onClick={() => removeEntry(entry.id)}
                aria-label="Bejegyzés törlése"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-linear-ink-subtle transition-colors hover:bg-linear-surface-2 hover:text-linear-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Dátum"
                name={`svc-date-${entry.id}`}
                placeholder="pl. 2024 vagy 2024-06-15"
                value={entry.date}
                onChange={(e) => updateEntry(entry.id, { date: sanitizeServiceDate(e.target.value) })}
              />
              <TextField
                label="Km óra állás"
                name={`svc-mileage-${entry.id}`}
                inputMode="numeric"
                placeholder="pl. 84000"
                value={entry.mileage}
                onChange={(e) => updateEntry(entry.id, { mileage: sanitizeServiceMileage(e.target.value) })}
              />
              <div className="sm:col-span-2">
                <TextField
                  label="Típus"
                  name={`svc-type-${entry.id}`}
                  list={`svc-type-suggestions-${entry.id}`}
                  placeholder="pl. Olajcsere"
                  value={entry.type}
                  onChange={(e) => updateEntry(entry.id, { type: e.target.value })}
                />
                <datalist id={`svc-type-suggestions-${entry.id}`}>
                  {SERVICE_ENTRY_TYPE_SUGGESTIONS.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </div>
              <div className="sm:col-span-2">
                <TextareaField
                  label="Megjegyzés (opcionális)"
                  name={`svc-notes-${entry.id}`}
                  placeholder="pl. Márkaszervizben végezve, garanciális munka"
                  value={entry.notes}
                  onChange={(e) => updateEntry(entry.id, { notes: e.target.value })}
                />
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addEntry}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-linear-hairline-strong bg-linear-surface-1 px-4 py-3 text-[14px] font-medium text-linear-ink-subtle transition-colors hover:border-linear-primary hover:text-linear-ink"
        >
          <Plus className="h-4 w-4" />
          Új szerviz-bejegyzés rögzítése
        </button>
      </div>

      <div className="flex flex-wrap justify-between gap-3 border-t border-linear-hairline pt-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 items-center rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-5 text-[14px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-2"
        >
          Vissza
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex h-10 items-center rounded-md bg-linear-primary px-5 text-[14px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
        >
          Tovább – {nextLabel}
        </button>
      </div>
    </div>
  );
}
