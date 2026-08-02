'use client';

import { useEffect, useState } from 'react';

interface InsufficientCreditsModalProps {
  onClose: () => void;
}

/**
 * "Elfogytak az AI krediteid" figyelmeztető modal (PROJEKT_INSTRUKCIOK.md "402
 * INSUFFICIENT_CREDITS Handler" lépés) -- akkor jelenik meg, amikor bármelyik `/api/ai/*`
 * route `402`-t ad vissza (`code: 'INSUFFICIENT_CREDITS'`, lásd `app/api/ai/parse-equipment/
 * route.ts` "Autentikáció + kredit-védelem" JSDoc-ját). Lásd `InsufficientCreditsProvider.tsx`
 * -- ez a komponens SOSEM közvetlenül példányosított, mindig a Provideren keresztül.
 *
 * Linear Dark Design Style, mert a 4 AI-hívó hely (`VoiceInputButton`, `StepEquipment`,
 * `StepCarInfo`, `StepFinalAssessment`) kizárólag a Szakértői Munkaterületen
 * (`/inspections/*`) belül él.
 */
export function InsufficientCreditsModal({ onClose }: InsufficientCreditsModalProps) {
  const [placeholderNotice, setPlaceholderNotice] = useState<string | null>(null);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (!placeholderNotice) return;
    const timer = setTimeout(() => setPlaceholderNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [placeholderNotice]);

  function handlePlaceholderClick(action: string) {
    setPlaceholderNotice(`${action} -- a Stripe fizetési integráció hamarosan érkezik.`);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
      role="presentation"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Elfogytak az AI kredited"
        className="w-full max-w-sm rounded-lg border border-linear-hairline bg-linear-surface-1 p-5 shadow-xl"
      >
        <p className="text-[16px] font-semibold text-linear-ink">🔒 Elfogytak az AI krediteid!</p>
        <p className="mt-2 text-[13px] leading-relaxed text-linear-ink-subtle">
          A hangalapú diktáláshoz és a VIN szkennerhez töltsd fel az egyenlegedet vagy válts Pro csomagra.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => handlePlaceholderClick('Előfizetés váltása')}
            className="flex-1 rounded-md border border-linear-hairline px-3.5 py-2 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-2"
          >
            Előfizetés váltása
          </button>
          <button
            type="button"
            onClick={() => handlePlaceholderClick('Kredit vásárlása')}
            className="flex-1 rounded-md bg-linear-primary px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
          >
            Kredit vásárlása
          </button>
        </div>

        {placeholderNotice && (
          <p
            role="status"
            className="mt-3 rounded-md border border-linear-primary/30 bg-linear-primary/10 px-3 py-2 text-center text-[12px] text-linear-primary"
          >
            {placeholderNotice}
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full text-center text-[12px] font-medium text-linear-ink-subtle transition-colors hover:text-linear-ink"
        >
          Bezárás
        </button>
      </div>
    </div>
  );
}
