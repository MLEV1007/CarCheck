'use client';

import { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type VinScanToastVariant = 'success' | 'warning';

interface VinScanToastProps {
  variant: VinScanToastVariant;
  message: string;
  onDismiss: () => void;
}

/**
 * Siker/hiba visszajelzés a "Forgalmi vagy Alvázszám beszkennelése (AI)" (Gemini Vision,
 * lásd `app/api/ai/scan-vin/route.ts` és `StepCarInfo.tsx`) eredményéről. Linear Dark
 * Design Style (a wizard design rendszere -- PROJEKT_INSTRUKCIOK.md 4.2), a
 * `components/settings/SuccessToast.tsx` Stripe-stílusú mintájának Linear-tokenes
 * megfelelője.
 *
 * **Megjegyzés:** korábban a projekt EGY MÁSODIK, kliens-oldali Tesseract.js-alapú VIN OCR
 * módszert is használt ugyanezzel a toast-tal -- ezt a felhasználó kérésére eltávolítottuk
 * (`lib/inspections/vinOcr.ts` törölve, lásd a status.md megfelelő szakaszát), a Gemini
 * Vision AI szkenner maradt az EGYETLEN fotó-alapú felismerési mód.
 *
 * 5 másodperc után magától eltűnik, de kézzel is bezárható.
 */
export function VinScanToast({ variant, message, onDismiss }: VinScanToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const isSuccess = variant === 'success';

  return (
    <div
      role="status"
      className={cn(
        'fixed inset-x-4 top-4 z-50 flex items-center gap-2.5 rounded-md border px-4 py-3 shadow-lg sm:inset-x-auto sm:left-auto sm:right-6 sm:w-[400px]',
        isSuccess
          ? 'border-linear-success/30 bg-linear-success-soft'
          : 'border-linear-warning/30 bg-linear-warning-soft'
      )}
    >
      {isSuccess ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-linear-success" />
      ) : (
        <AlertTriangle className="h-5 w-5 shrink-0 text-linear-warning" />
      )}
      <p className={cn('flex-1 text-[14px] font-normal', isSuccess ? 'text-linear-success' : 'text-linear-warning')}>
        {message}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Bezárás"
        className={cn(
          'shrink-0 rounded-full p-1 transition-colors',
          isSuccess ? 'text-linear-success hover:bg-linear-success/10' : 'text-linear-warning hover:bg-linear-warning/10'
        )}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
