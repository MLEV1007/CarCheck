import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import type { PublicReportData } from '@/lib/reports/types';
import { ReportHeader } from '@/components/report/ReportHeader';
import { ReportHero } from '@/components/report/ReportHero';
import { PaintMap } from '@/components/report/PaintMap';
import { DefectsGallery } from '@/components/report/DefectsGallery';
import { ReportNotFound } from '@/components/report/ReportNotFound';

interface PublicReportPageProps {
  params: Promise<{ public_token: string }>;
}

export const metadata: Metadata = {
  title: 'Állapotfelmérési Riport',
};

/**
 * Publikus Ügyfélriport (PROJEKT_INSTRUKCIOK.md 5.C) -- NEM igényel bejelentkezést,
 * nincs a middleware PROTECTED_PREFIXES listáján (lib/supabase/middleware.ts).
 *
 * Adatlekérdezés KIZÁRÓLAG a `get_public_report` RPC-n keresztül (SECURITY DEFINER,
 * `anon` szerepkör is futtathatja) -- soha nem közvetlen tábla-lekérdezéssel, mert a
 * `defects`/`paint_measurements`/`inspections` RLS policy-jai (`auth.uid() = user_id`)
 * bejelentkezés nélküli, idegen usernek szánt olvasást amúgy is elutasítanának.
 * BMW Corporate Design System (bmw.md): fehér canvas, sötétkék hero sáv, 0px
 * lekerekítés, 700/300 tipográfiai kontraszt.
 */
export default async function PublicReportPage({ params }: PublicReportPageProps) {
  const { public_token: publicToken } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_public_report', { p_token: publicToken });

  if (error || !data) {
    return <ReportNotFound />;
  }

  const report = data as PublicReportData;

  // Dinamikus márkaszín (PROJEKT_INSTRUKCIOK.md, "Cégbeállítások" lépés nyitott kérdése):
  // a riport gombjai és akcentus-elemei elsősorban a cég saját `profiles.primary_color`
  // értékét használják; ha az nincs beállítva, a BMW design system kék (#1c69d4) a fallback.
  // A `--report-accent` CSS változót itt, egyetlen helyen állítjuk be, az azt felhasználó
  // komponensek (SectionHeading, ReportHeader) `text-[var(--report-accent)]` / `bg-[var(--report-accent)]`
  // arbitrary-value Tailwind osztályokkal olvassák -- így nem kell a company objektumot
  // minden akcentus-elemig lefelé prop-drillelni.
  const accentColor = report.company?.primary_color?.trim() || '#1c69d4';

  return (
    <div className="min-h-screen bg-bmw-canvas" style={{ '--report-accent': accentColor } as CSSProperties}>
      <ReportHeader company={report.company} />
      <ReportHero inspection={report.inspection} />

      <main className="mx-auto max-w-[1200px] px-4 sm:px-8 lg:px-12">
        <PaintMap measurements={report.paint_measurements} />
        <DefectsGallery defects={report.defects} />
      </main>

      <footer className="border-t border-bmw-hairline bg-bmw-surface-soft px-4 py-10 sm:px-8 lg:px-12 print:hidden">
        <div className="mx-auto max-w-[1200px] text-[13px] font-light text-bmw-muted">
          <p>
            Ezt a riportot {report.company?.company_name || 'a vizsgálatot végző partner'} készítette az Autó
            Állapotfelmérő rendszerben.
          </p>
        </div>
      </footer>
    </div>
  );
}
