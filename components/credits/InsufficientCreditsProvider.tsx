'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { InsufficientCreditsModal } from '@/components/credits/InsufficientCreditsModal';

interface InsufficientCreditsContextValue {
  /** Bármelyik `/api/ai/*` hívóhely ezt hívja, amikor a válasz `402` (`INSUFFICIENT_AI_QUOTA`),
   * lásd a hívóhelyeket: `VoiceInputButton.tsx`, `StepEquipment.tsx`, `StepCarInfo.tsx`,
   * `StepFinalAssessment.tsx`. **2026-08-06, "Árazási struktúra bővítés" lépés:** korábban két
   * KÜLÖNBÖZŐ okot (`'credits'`/`'ai_quota'`) különböztetett meg ez a callback, a régi,
   * generikus kredit-rendszer (`lib/credits.ts` `hasEnoughCredits`) gate-jét eltávolítottuk
   * az `/api/ai/*` route-okból (lásd `lib/inspectionAiCredit.ts` JSDoc-ját), így a `402` MOSTANTÓL
   * KIZÁRÓLAG az AI-kvóta elfogyását jelentheti, a paraméter feleslegessé vált, törölve. */
  notifyInsufficientCredits: () => void;
}

const InsufficientCreditsContext = createContext<InsufficientCreditsContextValue | null>(null);

/**
 * Globális Context/Provider a "402 Handler" modalhoz (PROJEKT_INSTRUKCIOK.md, lásd
 * `InsufficientCreditsModal.tsx` JSDoc-ját). A gyökér layoutban (`app/layout.tsx`) MINDEN
 * oldalt körbevesz, hogy a wizard mélyen beágyazott AI-hívó komponensei
 * (`VoiceInputButton`, `StepEquipment` belső `EquipmentAiAssistant`, `StepCarInfo`,
 * `StepFinalAssessment`) prop-drilling NÉLKÜL, egy egyszerű `useInsufficientCredits()`
 * hívással tudják megnyitni a modalt, ugyanaz az elv, mint a `ThemeProvider.tsx`-nél.
 */
export function InsufficientCreditsProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const notifyInsufficientCredits = useCallback(() => {
    setIsOpen(true);
  }, []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ notifyInsufficientCredits }), [notifyInsufficientCredits]);

  return (
    <InsufficientCreditsContext.Provider value={value}>
      {children}
      {isOpen && <InsufficientCreditsModal onClose={handleClose} />}
    </InsufficientCreditsContext.Provider>
  );
}

/** Lásd `InsufficientCreditsProvider` JSDoc-ját, kizárólag azon belül használható,
 * a gyökér layout mindenhol biztosítja ezt a feltételt. */
export function useInsufficientCredits(): InsufficientCreditsContextValue {
  const ctx = useContext(InsufficientCreditsContext);
  if (!ctx) {
    throw new Error('useInsufficientCredits() kizárólag InsufficientCreditsProvider-en belül használható.');
  }
  return ctx;
}
