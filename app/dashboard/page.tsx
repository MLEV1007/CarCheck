import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { StatsBar } from '@/components/dashboard/StatsBar';
import { InspectionsExplorer, type InspectionRow } from '@/components/dashboard/InspectionsExplorer';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PublishSuccessBanner } from '@/components/dashboard/PublishSuccessBanner';

export const metadata: Metadata = {
  title: 'Dashboard | Autó Állapotfelmérő',
};

interface DashboardPageProps {
  searchParams: Promise<{ published?: string }>;
}

// Linear design system (linear.md) -- a szakértői munkaterület sötét canvas alapja.
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { published } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A middleware.ts (lib/supabase/middleware.ts PROTECTED_PREFIXES) már véd minden
  // /dashboard route-ot, ez itt csak egy defenzív, TS-biztonságos fallback.
  if (!user) {
    return null;
  }

  // FONTOS (RLS, lásd PROJEKT_INSTRUKCIOK.md 3. pont): mindkét lekérdezés a Postgres
  // Row-Level Security policy-jain (`auth.uid() = user_id` / `auth.uid() = id`) keresztül
  // is garantáltan csak a bejelentkezett user saját adataira szűkül -- a `.eq()` itt csak
  // az explicit query-szintű szűrés, nem az egyetlen védelmi vonal.
  const [{ data: profile }, { data: inspections }] = await Promise.all([
    supabase.from('profiles').select('company_name, logo_url').eq('id', user.id).maybeSingle(),
    supabase
      .from('inspections')
      .select('id, car_brand, car_model, license_plate, license_plate_country, vin, year, status, created_at, public_token')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const inspectionRows: InspectionRow[] = inspections ?? [];
  const total = inspectionRows.length;
  const draftCount = inspectionRows.filter((inspection) => inspection.status === 'draft').length;
  const completedCount = total - draftCount;

  return (
    <div className="min-h-screen bg-linear-canvas">
      <DashboardHeader companyName={profile?.company_name ?? null} logoUrl={profile?.logo_url ?? null} />

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-linear-ink">Vizsgálatok</h1>
          <p className="mt-1 text-[14px] text-linear-ink-subtle">
            Kezeld a korábbi és folyamatban lévő autóátvizsgálásaidat.
          </p>
        </div>

        {published && <PublishSuccessBanner publicToken={published} />}

        <StatsBar total={total} draft={draftCount} completed={completedCount} />

        {total === 0 ? <EmptyState /> : <InspectionsExplorer inspections={inspectionRows} />}
      </main>
    </div>
  );
}
