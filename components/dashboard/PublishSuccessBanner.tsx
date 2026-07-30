'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, ExternalLink, PartyPopper, X } from 'lucide-react';

interface PublishSuccessBannerProps {
  publicToken: string;
}

/**
 * Siker-banner a wizard "Vizsgálat befejezése & Publikálás" lépése után
 * (PROJEKT_INSTRUKCIOK.md 5.B.4) -- a /dashboard?published=<public_token> query
 * paramétert az InspectionWizard.tsx redirect-je állítja be. Linear design system:
 * primary/10 kitöltésű surface, hairline szegély, egy kattintásos link-másolás.
 */
export function PublishSuccessBanner({ publicToken }: PublishSuccessBannerProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const reportUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/report/${publicToken}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(reportUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API nem elérhető -- a user a "Megnyitás" gombbal manuálisan is másolhat.
    }
  }

  function handleDismiss() {
    router.replace('/dashboard');
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-linear-primary/30 bg-linear-primary/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-primary/20 text-linear-primary">
          <PartyPopper className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-linear-ink">A vizsgálat sikeresen publikálva!</p>
          <p className="mt-0.5 truncate font-mono text-[12px] text-linear-ink-subtle">{reportUrl}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <a
          href={`/report/${publicToken}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-3 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-3"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Megnyitás
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-linear-primary px-3 text-[13px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Másolva' : 'Link másolása'}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Banner bezárása"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-linear-ink-subtle transition-colors hover:bg-linear-surface-2 hover:text-linear-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
