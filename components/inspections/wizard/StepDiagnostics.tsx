'use client';

import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { TextField } from '@/components/inspections/wizard/FormControls';
import { WizardStepFooter } from '@/components/inspections/wizard/WizardBottomBar';
import { VoiceInputButton } from '@/components/ui/VoiceInputButton';
import { sanitizeDiagnosticCode } from '@/lib/inspections/validation';
import { EMPTY_DIAGNOSTIC_CODE, type DiagnosticsState } from '@/lib/inspections/types';

interface StepDiagnosticsProps {
  value: DiagnosticsState;
  onChange: (value: DiagnosticsState) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
}

/**
 * LÉPÉS -- Diagnosztikai Hibakódok Modul (PROJEKT_INSTRUKCIOK.md, "3 új szakértői
 * modul" lépés, A pont). Ha az "OBD Tiszta" checkbox be van pipálva, a hibakód-lista
 * elrejtődik -- mentéskor (InspectionWizard.tsx) a `codes` ilyenkor figyelmen kívül
 * marad, függetlenül attól, hogy volt-e korábban beírt (majd elrejtett) sor.
 */
export function StepDiagnostics({ value, onChange, onBack, onNext, nextLabel }: StepDiagnosticsProps) {
  const hasIncompleteCode = !value.noDtc && value.codes.some((entry) => entry.code.trim() === '');

  function toggleNoDtc(noDtc: boolean) {
    onChange({ ...value, noDtc });
  }

  function addCode() {
    onChange({ ...value, codes: [...value.codes, EMPTY_DIAGNOSTIC_CODE()] });
  }

  function updateCode(clientId: string, patch: Partial<{ code: string; description: string }>) {
    onChange({
      ...value,
      codes: value.codes.map((entry) => (entry.clientId === clientId ? { ...entry, ...patch } : entry)),
    });
  }

  function removeCode(clientId: string) {
    onChange({ ...value, codes: value.codes.filter((entry) => entry.clientId !== clientId) });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Diagnosztikai hibakódok</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Rögzítsd az OBD diagnosztikai kiolvasás eredményét.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-linear-hairline bg-linear-surface-1 p-4 transition-colors hover:bg-linear-surface-2">
        <input
          type="checkbox"
          checked={value.noDtc}
          onChange={(e) => toggleNoDtc(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-linear-hairline-strong accent-linear-primary"
        />
        <span className="text-[14px] font-medium text-linear-ink">Nincs diagnosztikai hibakód</span>
      </label>

      {!value.noDtc && (
        <div className="flex flex-col gap-4">
          {value.codes.map((entry, index) => (
            <div key={entry.clientId} className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
                  #{index + 1}. hibakód
                </span>
                <button
                  type="button"
                  onClick={() => removeCode(entry.clientId)}
                  aria-label="Hibakód törlése"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-linear-ink-subtle transition-colors hover:bg-linear-surface-2 hover:text-linear-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
                <TextField
                  label="Kód"
                  name={`dtc-code-${entry.clientId}`}
                  placeholder="pl. P0300"
                  className="font-mono uppercase tracking-wider"
                  value={entry.code}
                  onChange={(e) => updateCode(entry.clientId, { code: sanitizeDiagnosticCode(e.target.value) })}
                />
                <div className="relative">
                  <TextField
                    label="Leírás"
                    name={`dtc-desc-${entry.clientId}`}
                    placeholder="pl. Égéskimaradás az 1. hengerben"
                    className="pr-9"
                    value={entry.description}
                    onChange={(e) => updateCode(entry.clientId, { description: e.target.value })}
                  />
                  <VoiceInputButton
                    value={entry.description}
                    onChange={(next) => updateCode(entry.clientId, { description: next })}
                    className="absolute bottom-2 right-2"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addCode}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-linear-hairline-strong bg-linear-surface-1 px-4 py-3 text-[14px] font-medium text-linear-ink-subtle transition-colors hover:border-linear-primary hover:text-linear-ink"
          >
            <Plus className="h-4 w-4" />
            Új hibakód rögzítése
          </button>

          {hasIncompleteCode && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-linear-danger/30 bg-linear-danger-soft px-3 py-2.5 text-[13px] text-linear-danger"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Tölts ki minden hibakód mezőt, vagy töröld az üreseket.
            </p>
          )}
        </div>
      )}

      <WizardStepFooter
        onBack={onBack}
        onNext={onNext}
        nextLabel={nextLabel}
        nextDisabled={hasIncompleteCode}
        nextTitle={hasIncompleteCode ? 'Tölts ki minden hibakód mezőt, vagy töröld az üreseket.' : undefined}
      />
    </div>
  );
}
