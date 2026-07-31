'use client';

import { useEffect } from 'react';
import { isVideoUrl } from '@/lib/reports/media';

interface MediaLightboxProps {
  url: string;
  onClose: () => void;
}

/**
 * Kattintásra felugró kép-/videónézegető a hiba médiákhoz (PROJEKT_INSTRUKCIOK.md 5.C).
 * `print:hidden`, mert a nyomtatott/PDF kimenetben a lightbox soha nincs releváns
 * állapotban -- a fotók maguktól, a `DefectsGallery` sorában is látszanak.
 */
export function MediaLightbox({ url, onClose }: MediaLightboxProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 print:hidden sm:p-10"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Bezárás"
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-none border border-white/40 text-[22px] text-white transition-colors hover:bg-white/10 sm:right-8 sm:top-8"
      >
        ×
      </button>
      <div className="max-h-[85vh] max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
        {isVideoUrl(url) ? (
          <video
            src={url}
            controls
            autoPlay
            className="max-h-[85vh] max-w-[92vw] rounded-none bg-black"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="max-h-[85vh] max-w-[92vw] rounded-none object-contain" />
        )}
      </div>
    </div>
  );
}
