'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { QuotaSummarySuccessResponse } from '@/app/api/quotas/summary/route';
import type { OrganizationRole } from '@/types/credits';

interface VideoUpsellModalProps {
  onClose: () => void;
}

/**
 * "Videó csatolása csak magasabb csomaggal érhető el" figyelmeztető/upsell modal
 * (PLAN_video_qr_upload.md 6.3 pontja, a felhasználóval egyeztetett "Mindig látszik,
 * kattintásra upsell" UX-döntés), akkor jelenik meg, amikor egy Free/Egyéni/Növekedési
 * csomagú szervezet tagja videót próbál csatolni (asztali fájlválasztóból VAGY a QR-kódos
 * telefonos feltöltő gombra kattintva). Lásd `VideoUpsellProvider.tsx`, ez a komponens
 * SOSEM közvetlenül példányosított, mindig a Provideren keresztül.
 *
 * 1:1 UGYANAZ a minta (role-tudatos szöveg, `/api/quotas/summary` lekérdezés, Linear Dark
 * Design Style, Escape/háttér-kattintás zárás), mint az `InsufficientCreditsModal.tsx`-nél,
 * SZÁNDÉKOSAN nem lett belőle egy közös, paraméterezett komponens, mert a két eset
 * (elfogyott AI-kredit vs. csomag-szintű funkció-korlátozás) szemantikailag különbözik, és a
 * jövőbeli szövegezésük/CTA-juk könnyen szétválhat, a duplikált, de olvasható komponens
 * jobb csereút, mint egy korai, feleslegesen általánosított absztrakció.
 */
export function VideoUpsellModal({ onClose }: VideoUpsellModalProps) {
  const [role, setRole] = useState<OrganizationRole>('manager');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/quotas/summary');
        const json = (await response.json().catch(() => null)) as QuotaSummarySuccessResponse | null;
        if (!cancelled && response.ok && json?.success) {
          setRole(json.role);
        }
      } catch {
        // Csendben megtartjuk az alapértelmezett 'manager' szöveget, lásd
        // `InsufficientCreditsModal.tsx` azonos elvű JSDoc-ját.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const isInspector = role === 'inspector';

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
        aria-label="Videó csatolása csak magasabb csomaggal"
        className="w-full max-w-sm rounded-lg border border-linear-hairline bg-linear-surface-1 p-5 shadow-xl"
      >
        <p className="text-[16px] font-semibold text-linear-ink">🎬 Videó csatolása</p>
        <p className="mt-2 text-[13px] leading-relaxed text-linear-ink-subtle">
          {isInspector
            ? 'Videó csatolásához Profi vagy Autóház csomag szükséges. Kérjük, egyeztess a Menedzserrel a csomagváltásról!'
            : 'Videó csatolása (fotó mellett) kizárólag a Profi és az Autóház csomagban érhető el. Válts csomagot, hogy a vizsgálataidhoz videót is csatolhass.'}
        </p>

        {!isInspector && (
          <Link
            href="/settings/billing"
            onClick={onClose}
            className="mt-4 flex h-9 items-center justify-center rounded-md bg-linear-primary px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
          >
            Csomagok megtekintése
          </Link>
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
