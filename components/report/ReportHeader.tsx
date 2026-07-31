'use client';

import type { PublicReportCompany } from '@/lib/reports/types';

interface ReportHeaderProps {
  company: PublicReportCompany | null;
}

/**
 * BMW design system (bmw.md): fehér `top-nav`-szerű fejléc, 0px lekerekítés mindenhol.
 * A vizsgálatot végző cég brandingje (logó/monogram + név + elérhetőségek) a `profiles`
 * táblából érkezik a `get_public_report` RPC-n keresztül. A "Nyomtatás / PDF letöltés"
 * gomb a böngésző natív `window.print()`-jét hívja -- nyomtatáskor `print:hidden`-nel
 * eltűnik, hogy ne szerepeljen a kimenetben.
 *
 * A logó-monogram háttere és a nyomtatás gomb hover-akcentusa a `--report-accent`
 * CSS változót olvassa (a cég `primary_color`-ja, BMW kék fallback-kel) -- lásd
 * `app/report/[public_token]/page.tsx`.
 */
export function ReportHeader({ company }: ReportHeaderProps) {
  const companyName = company?.company_name?.trim() || 'Autó Állapotfelmérő';
  const contactLine = [company?.phone, company?.email].filter(Boolean).join(' · ');

  return (
    <header className="border-b border-bmw-hairline bg-bmw-canvas">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-5 sm:px-8 lg:px-12">
        <div className="flex min-w-0 items-center gap-3">
          {company?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logo_url}
              alt={companyName}
              className="h-10 w-auto shrink-0 rounded-none object-contain"
            />
          ) : (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none text-[14px] font-bold text-bmw-on-dark"
              style={{ backgroundColor: 'var(--report-accent)' }}
            >
              {companyName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-[16px] font-bold leading-tight text-bmw-ink">{companyName}</p>
            {contactLine && (
              <p className="truncate text-[13px] font-light text-bmw-muted">{contactLine}</p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="h-12 shrink-0 rounded-none border border-bmw-hairline-strong bg-bmw-canvas px-6 text-[14px] font-bold uppercase tracking-[0.5px] text-bmw-ink transition-colors hover:border-[var(--report-accent)] hover:bg-bmw-surface-soft print:hidden"
        >
          Nyomtatás / PDF
        </button>
      </div>
    </header>
  );
}
