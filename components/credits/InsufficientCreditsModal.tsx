'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { QuotaSummarySuccessResponse } from '@/app/api/quotas/summary/route';
import type { OrganizationRole } from '@/types/credits';

interface InsufficientCreditsModalProps {
  onClose: () => void;
}

/**
 * "Elfogyott az AI kereted" figyelmeztető modal (PROJEKT_INSTRUKCIOK.md "402 Handler"
 * lépés) -- akkor jelenik meg, amikor bármelyik `/api/ai/*` route `402`-t ad vissza
 * (`code: 'INSUFFICIENT_AI_QUOTA'`, lásd `lib/quotas.ts`) -- lásd
 * `InsufficientCreditsProvider.tsx` -- ez a komponens SOSEM közvetlenül példányosított,
 * mindig a Provideren keresztül.
 *
 * **2026-08-06, "Árazási struktúra bővítés" lépés:** korábban KÉT különböző okot
 * (a régi, generikus kredit-rendszer VS az új, Stripe-csomaghoz kötött AI-kvóta)
 * különböztetett meg egy `reason` prop -- a régi kredit-gate-et eltávolítottuk az
 * `/api/ai/*` route-okból (lásd `lib/inspectionAiCredit.ts` JSDoc-ját), így ez a modal
 * mostantól EGYETLEN, mindig ugyanazt jelentő esetet kezel: elfogyott az AI-kredit
 * (havi + vásárolt együtt, lásd `QuotaBalance.totalAiAvailable`).
 *
 * Linear Dark Design Style, mert a 4 AI-hívó hely (`VoiceInputButton`, `StepEquipment`,
 * `StepCarInfo`, `StepFinalAssessment`) kizárólag a Szakértői Munkaterületen
 * (`/inspections/*`) belül él.
 *
 * **Szerepkör-tudatos szöveg (2026-08-03, "Szervezeti szerepkezelés" lépés):** a modal
 * a `/api/quotas/summary` végpontról (2026-08-06-tól -- korábban `/api/credits/summary`,
 * lásd a fenti JSDoc-ot a váltás indokáról) megnyíláskor lekérdezi a hívó szerepkörét --
 * Átvizsgálónak a "kifogyott a KÖZÖS céges keret, szólj a Menedzsernek" üzenet jelenik
 * meg, a csomagváltó/vásárlás gomb NÉLKÜL (az Átvizsgáló úgysem tud/nem szabad neki
 * csomagot váltania -- lásd a "Pénzügyi Végpontok Védelme" lépést, `lib/auth/roles.ts`
 * `requireManager()`). Amíg a lekérdezés fut (vagy hibázik), a Menedzsernek szánt,
 * eredeti szöveg jelenik meg alapértelmezettként -- ez biztonságos "fail-open a
 * szövegre" (NEM a kvótára) eset, legrosszabb esetben egy Átvizsgáló egy pillanatra
 * a Menedzser-szöveget látja loading közben.
 *
 * A "Előfizetéshez"/"AI kredit vásárlása" gomb a `/settings/billing` oldalra visz (lásd
 * `app/settings/billing/page.tsx` + `components/settings/BillingTab.tsx`), ahol a
 * Menedzser ténylegesen válthat csomagot vagy vásárolhat AI-kredit csomagot.
 */
export function InsufficientCreditsModal({ onClose }: InsufficientCreditsModalProps) {
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
        // Csendben megtartjuk az alapértelmezett 'manager' szöveget -- lásd a fenti JSDoc-ot.
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

  const title = '🔒 Elfogyott az AI kereted!';

  const managerText =
    'A csomagodhoz tartozó AI-kredit (havi + vásárolt) elfogyott. Válts magasabb csomagra, vagy vásárolj AI-kredit csomagot.';

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
        aria-label="Elfogyott a kereted"
        className="w-full max-w-sm rounded-lg border border-linear-hairline bg-linear-surface-1 p-5 shadow-xl"
      >
        <p className="text-[16px] font-semibold text-linear-ink">{title}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-linear-ink-subtle">
          {isInspector
            ? 'A céges keret kimerült. Kérjük, értesítsd a Menedzsert a feltöltéshez!'
            : managerText}
        </p>

        {!isInspector && (
          <Link
            href="/settings/billing"
            onClick={onClose}
            className="mt-4 flex h-9 items-center justify-center rounded-md bg-linear-primary px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
          >
            Ugrás az Előfizetéshez
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
