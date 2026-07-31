'use client';

import { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface SuccessToastProps {
  message: string;
  onDismiss: () => void;
}

/**
 * Zöld siker-toast a Cégbeállítások mentése után (PROJEKT_INSTRUKCIOK.md, "Sikeres
 * mentés visszajelzés"). 4 másodperc után magától eltűnik, de kézzel is bezárható.
 * Stripe design system: `rounded-stripe-md`, halvány zöld surface, hairline keret.
 */
export function SuccessToast({ message, onDismiss }: SuccessToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-4 z-50 flex items-center gap-2.5 rounded-stripe-md border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-stripe-2 sm:inset-x-auto sm:left-auto sm:right-6 sm:w-[400px]"
    >
      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
      <p className="flex-1 font-sohne text-[14px] font-normal text-emerald-800">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Bezárás"
        className="shrink-0 rounded-full p-1 text-emerald-600 transition-colors hover:bg-emerald-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
