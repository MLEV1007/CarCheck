'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { InsufficientCreditsModal } from '@/components/credits/InsufficientCreditsModal';

/** Melyik keret fogyott ki -- a régi, generikus AI-kredit rendszer (`INSUFFICIENT_CREDITS`)
 * vagy az ÚJ, Stripe csomaghoz kötött havi AI-keret (`INSUFFICIENT_AI_QUOTA`, lásd
 * `lib/quotas.ts` "Keret-ellenőrző és fogyasztó logika" lépés, 2026-08-04) -- a két
 * rendszer TUDATOSAN PÁRHUZAMOSAN fut (lásd `status.md` 52. szakasz), a modalnak ezért meg
 * kell tudnia különböztetnie, melyik keret ürült ki, hogy pontos szöveget mutasson. */
export type InsufficientCreditsReason = 'credits' | 'ai_quota';

interface InsufficientCreditsContextValue {
  /** Bármelyik `/api/ai/*` hívóhely ezt hívja, amikor a válasz `402` -- `reason` a válasz
   * `code` mezője alapján (`'INSUFFICIENT_AI_QUOTA'` -> `'ai_quota'`, minden más,
   * elsősorban `'INSUFFICIENT_CREDITS'` -> `'credits'`, ami az alapértelmezett is, ha a
   * hívó nem adja meg). Lásd a hívóhelyeket: `VoiceInputButton.tsx`, `StepEquipment.tsx`,
   * `StepCarInfo.tsx`, `StepFinalAssessment.tsx`. */
  notifyInsufficientCredits: (reason?: InsufficientCreditsReason) => void;
}

const InsufficientCreditsContext = createContext<InsufficientCreditsContextValue | null>(null);

/**
 * Globális Context/Provider a "402 Handler" modalhoz (PROJEKT_INSTRUKCIOK.md, lásd
 * `InsufficientCreditsModal.tsx` JSDoc-ját). A gyökér layoutban (`app/layout.tsx`) MINDEN
 * oldalt körbevesz, hogy a wizard mélyen beágyazott AI-hívó komponensei
 * (`VoiceInputButton`, `StepEquipment` belső `EquipmentAiAssistant`, `StepCarInfo`,
 * `StepFinalAssessment`) prop-drilling NÉLKÜL, egy egyszerű `useInsufficientCredits()`
 * hívással tudják megnyitni a modalt -- ugyanaz az elv, mint a `ThemeProvider.tsx`-nél,
 * csak itt a "globális állapot" egy boolean (nyitva/zárva) + egy `reason` (2026-08-04-től).
 */
export function InsufficientCreditsProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<InsufficientCreditsReason>('credits');

  const notifyInsufficientCredits = useCallback((nextReason: InsufficientCreditsReason = 'credits') => {
    setReason(nextReason);
    setIsOpen(true);
  }, []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ notifyInsufficientCredits }), [notifyInsufficientCredits]);

  return (
    <InsufficientCreditsContext.Provider value={value}>
      {children}
      {isOpen && <InsufficientCreditsModal reason={reason} onClose={handleClose} />}
    </InsufficientCreditsContext.Provider>
  );
}

/** Lásd `InsufficientCreditsProvider` JSDoc-ját -- kizárólag azon belül használható,
 * a gyökér layout mindenhol biztosítja ezt a feltételt. */
export function useInsufficientCredits(): InsufficientCreditsContextValue {
  const ctx = useContext(InsufficientCreditsContext);
  if (!ctx) {
    throw new Error('useInsufficientCredits() kizárólag InsufficientCreditsProvider-en belül használható.');
  }
  return ctx;
}
