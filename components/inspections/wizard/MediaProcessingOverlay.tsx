'use client';

import { Loader2 } from 'lucide-react';
import { MAX_VIDEO_DURATION_SECONDS } from '@/lib/inspections/videoCompression';
import type { MediaSelectionModalState } from '@/lib/inspections/mediaSelection';

interface MediaProcessingOverlayProps {
  state: MediaSelectionModalState;
}

/**
 * A `useMediaSelection` hook (`lib/inspections/mediaSelection.ts`) `modalState`-jét jeleníti
 * meg -- `StepGeneralPhotos.tsx` ÉS `StepDefects.tsx` EGYARÁNT ezt a KÖZÖS, prezentációs
 * komponenst rendereli a hook `modalState`-jével, hogy a vágás-megerősítő/tömörítési
 * folyamatjelző/hibaüzenet UI ne duplikálódjon a két hívóhely között.
 */
export function MediaProcessingOverlay({ state }: MediaProcessingOverlayProps) {
  if (state.kind === 'none') return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Videó feldolgozása"
    >
      <div className="w-full max-w-sm rounded-lg border border-linear-hairline bg-linear-surface-1 p-5 shadow-xl">
        {state.kind === 'trim-confirm' && (
          <>
            <p className="text-[16px] font-semibold text-linear-ink">Hosszú videó</p>
            <p className="mt-2 text-[13px] leading-relaxed text-linear-ink-subtle">
              A kiválasztott videó {Math.round(state.durationSeconds)} másodperc hosszú. A feltölthető
              videók legfeljebb {MAX_VIDEO_DURATION_SECONDS} másodpercesek lehetnek -- szeretnéd, hogy a
              videó ELEJÉT vágjuk erre a hosszra?
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={state.onCancel}
                className="h-9 flex-1 rounded-md border border-linear-hairline-strong text-[13px] font-medium text-linear-ink-subtle transition-colors hover:bg-linear-surface-3"
              >
                Mégse
              </button>
              <button
                type="button"
                onClick={state.onConfirm}
                className="h-9 flex-1 rounded-md bg-linear-primary text-[13px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
              >
                Vágás és tömörítés
              </button>
            </div>
          </>
        )}

        {state.kind === 'progress' && (
          <>
            <div className="flex items-center gap-2.5">
              <Loader2 className="h-5 w-5 animate-spin text-linear-primary" />
              <p className="text-[14px] font-medium text-linear-ink">{state.progress.message}</p>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-linear-surface-3">
              <div
                className="h-full rounded-full bg-linear-primary transition-[width]"
                style={{ width: `${Math.round(state.progress.ratio * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-[12px] text-linear-ink-subtle">
              Ne zárd be az oldalt, amíg a tömörítés folyamatban van.
            </p>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <p className="text-[16px] font-semibold text-linear-ink">⚠️ Videó feldolgozása sikertelen</p>
            <p className="mt-2 text-[13px] leading-relaxed text-linear-ink-subtle">{state.message}</p>
            <button
              type="button"
              onClick={state.onClose}
              className="mt-4 h-9 w-full rounded-md bg-linear-primary text-[13px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
            >
              Rendben
            </button>
          </>
        )}
      </div>
    </div>
  );
}
