'use client';

import { Plus, Trash2 } from 'lucide-react';
import { SelectField, TextareaField } from '@/components/inspections/wizard/FormControls';
import { DefectMediaUpload } from '@/components/inspections/wizard/DefectMediaUpload';
import { WizardStepFooter } from '@/components/inspections/wizard/WizardBottomBar';
import { DEFECT_CATEGORIES } from '@/lib/inspections/constants';
import { EMPTY_DEFECT, type DefectState } from '@/lib/inspections/types';
import { HintCallout } from '@/components/onboarding/HintCallout';

interface StepDefectsProps {
  value: DefectState[];
  onChange: (value: DefectState[]) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
}

/** LÉPÉS -- Hibák és Média rögzítése (PROJEKT_INSTRUKCIOK.md 5.B.3). */
export function StepDefects({ value, onChange, onBack, onNext, nextLabel }: StepDefectsProps) {
  function updateDefect(clientId: string, patch: Partial<DefectState>) {
    onChange(value.map((defect) => (defect.clientId === clientId ? { ...defect, ...patch } : defect)));
  }

  function addDefect() {
    onChange([...value, EMPTY_DEFECT()]);
  }

  function removeDefect(clientId: string) {
    const target = value.find((defect) => defect.clientId === clientId);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    onChange(value.filter((defect) => defect.clientId !== clientId));
  }

  function handleSelectFile(clientId: string, file: File) {
    const previewUrl = URL.createObjectURL(file);
    updateDefect(clientId, { file, previewUrl });
  }

  function handleRemoveMedia(clientId: string) {
    const target = value.find((defect) => defect.clientId === clientId);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    updateDefect(clientId, { file: null, previewUrl: null });
  }

  const hasIncompleteRow = value.some((defect) => defect.category.trim() === '' || defect.description.trim() === '');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Hibák és Média rögzítése</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Rögzítsd a mechanikai és elektronikai hibákat leírással, képpel vagy videóval. (A felületi
          sérüléseket az előző, Hibatérkép lépésben jelöld). Ha nincs hiba, lépj tovább.
        </p>
      </div>

      <HintCallout id="defects" title="Tipp: diktálhatod is a hibaleírást">
        A leírás mezőnél a mikrofon ikonnal bediktálhatod a hibát, az AI automatikusan nyelvtanilag is
        kisimítja a szöveget.
      </HintCallout>

      <div className="flex flex-col gap-4">
        {value.map((defect, index) => (
          <div key={defect.clientId} className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
                #{index + 1}. hiba
              </span>
              <button
                type="button"
                onClick={() => removeDefect(defect.clientId)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-linear-ink-subtle transition-colors hover:bg-linear-surface-2 hover:text-linear-danger"
                aria-label="Hiba törlése"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex flex-1 flex-col gap-4">
                <SelectField
                  label="Hiba kategória"
                  name={`category-${defect.clientId}`}
                  options={DEFECT_CATEGORIES}
                  placeholder="Válassz kategóriát…"
                  value={defect.category}
                  onChange={(e) => updateDefect(defect.clientId, { category: e.target.value })}
                />
                <TextareaField
                  label="Hiba leírása"
                  name={`description-${defect.clientId}`}
                  placeholder="pl. Karcolás a jobb hátsó ajtón, kb. 8 cm."
                  value={defect.description}
                  onChange={(e) => updateDefect(defect.clientId, { description: e.target.value })}
                />
              </div>

              <div className="sm:w-[220px] sm:shrink-0">
                <span className="mb-1.5 block text-[13px] font-medium text-linear-ink-muted">Fotó / videó</span>
                <DefectMediaUpload
                  file={defect.file}
                  previewUrl={defect.previewUrl}
                  onSelect={(file) => handleSelectFile(defect.clientId, file)}
                  onRemove={() => handleRemoveMedia(defect.clientId)}
                />
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addDefect}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-linear-hairline-strong bg-linear-surface-1 px-4 py-3 text-[14px] font-medium text-linear-ink-subtle transition-colors hover:border-linear-primary hover:text-linear-ink"
        >
          <Plus className="h-4 w-4" />
          Új hiba rögzítése
        </button>
      </div>

      <WizardStepFooter
        onBack={onBack}
        onNext={onNext}
        nextLabel={nextLabel}
        nextDisabled={hasIncompleteRow}
        nextTitle={hasIncompleteRow ? 'Tölts ki minden hiba-kártyát, vagy töröld az üreseket.' : undefined}
      />
    </div>
  );
}
