'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { VideoUpsellModal } from '@/components/credits/VideoUpsellModal';

interface VideoUpsellContextValue {
  /** A wizard bármelyik videó-kiválasztási helye (`StepGeneralPhotos.tsx`, `StepDefects.tsx`
   * a `DefectMediaUpload.tsx`-en keresztül, `QrUploadPanel.tsx`) ezt hívja, amikor a hívó
   * szervezet `user_credits.plan_tier`-je NEM `pro`/`business`, lásd
   * `lib/inspections/mediaSelection.ts`. */
  notifyVideoUpsell: () => void;
}

const VideoUpsellContext = createContext<VideoUpsellContextValue | null>(null);

/**
 * Globális Context/Provider a videó-csomag-upsell modalhoz, UGYANAZ az elv, mint az
 * `InsufficientCreditsProvider.tsx`-nél: a gyökér layoutban (`app/layout.tsx`) mindent
 * körbevesz, hogy a wizard mélyen beágyazott média-kiválasztó komponensei prop-drilling
 * NÉLKÜL, egy egyszerű `useVideoUpsell()` hívással tudják megnyitni a modalt.
 */
export function VideoUpsellProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const notifyVideoUpsell = useCallback(() => {
    setIsOpen(true);
  }, []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ notifyVideoUpsell }), [notifyVideoUpsell]);

  return (
    <VideoUpsellContext.Provider value={value}>
      {children}
      {isOpen && <VideoUpsellModal onClose={handleClose} />}
    </VideoUpsellContext.Provider>
  );
}

/** Lásd `VideoUpsellProvider` JSDoc-ját, kizárólag azon belül használható, a gyökér layout
 * mindenhol biztosítja ezt a feltételt. */
export function useVideoUpsell(): VideoUpsellContextValue {
  const ctx = useContext(VideoUpsellContext);
  if (!ctx) {
    throw new Error('useVideoUpsell() kizárólag VideoUpsellProvider-en belül használható.');
  }
  return ctx;
}
