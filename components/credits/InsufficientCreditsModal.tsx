'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CreditSummarySuccessResponse } from '@/app/api/credits/summary/route';
import type { OrganizationRole } from '@/types/credits';
import type { InsufficientCreditsReason } from '@/components/credits/InsufficientCreditsProvider';

interface InsufficientCreditsModalProps {
  onClose: () => void;
  /** Melyik keret ürült ki -- lásd `InsufficientCreditsProvider.tsx` `InsufficientCreditsReason`
   * JSDoc-ját. Kizárólag a CÍM/szöveg különbözik ez alapján, a szerepkör-tudatos ág
   * (lent) MINDKÉT `reason`-nél ugyanúgy működik. */
  reason: InsufficientCreditsReason;
}

/**
 * "Elfogyott a kereted" figyelmeztető modal (PROJEKT_INSTRUKCIOK.md "402 Handler" lépés)
 * -- akkor jelenik meg, amikor bármelyik `/api/ai/*` route `402`-t ad vissza, akár a régi,
 * generikus AI-kredit rendszer (`code: 'INSUFFICIENT_CREDITS'`, lásd
 * `app/api/ai/parse-equipment/route.ts` "Autentikáció + kredit-védelem" JSDoc-ját), akár az
 * ÚJ, Stripe csomaghoz kötött havi AI-keret (`code: 'INSUFFICIENT_AI_QUOTA'`, lásd
 * `lib/quotas.ts`, 2026-08-04) ürült ki -- lásd `InsufficientCreditsProvider.tsx`
 * -- ez a komponens SOSEM közvetlenül példányosított, mindig a Provideren keresztül.
 *
 * Linear Dark Design Style, mert a 4 AI-hívó hely (`VoiceInputButton`, `StepEquipment`,
 * `StepCarInfo`, `StepFinalAssessment`) kizárólag a Szakértői Munkaterületen
 * (`/inspections/*`) belül él.
 *
 * **Szerepkör-tudatos szöveg (2026-08-03, "Szervezeti szerepkezelés" lépés):** a modal
 * a `/api/credits/summary` végpontról (ugyanaz a minta, mint a `HeaderCreditBadge`/
 * `CreditDashboardModal`-nál) megnyíláskor lekérdezi a hívó szerepkörét -- Átvizsgálónak
 * a "kifogyott a KÖZÖS céges keret, szólj a Menedzsernek" üzenet jelenik meg, a
 * csomagváltó/vásárlás gomb NÉLKÜL (az Átvizsgáló úgysem tud/nem szabad neki csomagot
 * váltania -- lásd a "Pénzügyi Végpontok Védelme" lépést, `lib/auth/roles.ts`
 * `requireManager()`). Amíg a lekérdezés fut (vagy hibázik), a Menedzsernek szánt,
 * eredeti szöveg jelenik meg alapértelmezettként -- ez biztonságos "fail-open a
 * szövegre" (NEM a kreditre) eset, legrosszabb esetben egy Átvizsgáló egy pillanatra
 * a Menedzser-szöveget látja loading közben.
 *
 * **Valódi Stripe link (2026-08-04-től):** a korábbi 2 placeholder gomb ("Előfizetés
 * váltása"/"Kredit vásárlása", ami csak egy 4 másodperces "hamarosan érkezik" toast-ot
 * mutatott) a Stripe-integráció megépülése óta ELAVULT lenne -- lecserélve egy VALÓDI
 * linkre a `/settings/billing` oldalra (lásd `app/settings/billing/page.tsx` +
 * `components/settings/BillingTab.tsx`), ahol a Menedzser ténylegesen válthat csomagot/
 * vásárolhat Top-up-ot.
 */
export function InsufficientCreditsModal({ onClose, reason }: InsufficientCreditsModalProps) {
  const [role, setRole] = useState<OrganizationRole>('manager');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/credits/summary');
        const json = (await response.json().catch(() => null)) as CreditSummarySuccessResponse | null;
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

  const title = reason === 'ai_quota' ? '🔒 Elfogyott a havi AI kereted!' : '🔒 Elfogytak az AI krediteid!';

  const managerText =
    reason === 'ai_quota'
      ? 'A csomagodhoz tartozó havi AI-hívás keret elfogyott. Válts magasabb csomagra a több AI-hívásért.'
      : 'A hangalapú diktáláshoz és a VIN szkennerhez töltsd fel az egyenlegedet vagy válts Pro csomagra.';

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
