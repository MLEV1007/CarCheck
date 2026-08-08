import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { StatsBar } from '@/components/dashboard/StatsBar';
import { InspectionsExplorer, type InspectionRow } from '@/components/dashboard/InspectionsExplorer';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PublishSuccessBanner } from '@/components/dashboard/PublishSuccessBanner';

export const metadata: Metadata = {
  title: 'Dashboard | CarPass',
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

  // FONTOS (RLS, lásd PROJEKT_INSTRUKCIOK.md 3. pont): a `profiles` lekérdezés a
  // `profiles_select_own` policy-n keresztül garantáltan csak a bejelentkezett user
  // saját sorára szűkül. Az `inspections` lekérdezésen SZÁNDÉKOSAN NINCS explicit
  // `.eq('user_id', ...)` szűrés -- ez a "Szervezeti szerepkezelés" lépés (lásd
  // `supabase/migrations/20260803_organizations_rbac.sql` `inspections_select_org`
  // RLS policy-ját) óta a helyes viselkedés: a DB-oldali RLS maga dönti el, mit lát a
  // hívó (Menedzser -> teljes szervezet; Átvizsgáló `can_view_all_reports = true` ->
  // teljes szervezet; Átvizsgáló `can_view_all_reports = false` -> kizárólag
  // `created_by = auth.uid()`) -- a lekérdezés tehát MINDIG a helyes, szerepkör szerint
  // szűkített listát adja vissza, kód-szintű `if role === ...` elágazás nélkül.
  const [{ data: profile }, { data: inspections }] = await Promise.all([
    supabase
      .from('profiles')
      .select('company_name, logo_url, role, can_view_all_reports')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('inspections')
      .select(
        'id, car_brand, car_model, license_plate, license_plate_country, vin, year, status, created_at, public_token, created_by'
      )
      .order('created_at', { ascending: false }),
  ]);

  const role = profile?.role === 'inspector' ? 'inspector' : 'manager';
  const inspectionRows: InspectionRow[] = inspections ?? [];
  const total = inspectionRows.length;
  const draftCount = inspectionRows.filter((inspection) => inspection.status === 'draft').length;
  const completedCount = total - draftCount;

  return (
    <div className="min-h-screen bg-linear-canvas">
      <DashboardHeader companyName={profile?.company_name ?? null} logoUrl={profile?.logo_url ?? null} role={role} />

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-linear-ink">Vizsgálatok</h1>
          <p className="mt-1 text-[14px] text-linear-ink-subtle">
            {role === 'manager' || profile?.can_view_all_reports
              ? 'Kezeld a cég összes korábbi és folyamatban lévő autóátvizsgálását.'
              : 'Kezeld a korábbi és folyamatban lévő autóátvizsgálásaidat.'}
          </p>
        </div>

        {published && (
          <PublishSuccessBanner
            publicToken={published}
            logoUrl={profile?.logo_url ?? null}
            companyName={profile?.company_name ?? null}
          />
        )}

        <StatsBar total={total} draft={draftCount} completed={completedCount} />

        {total === 0 ? (
          <EmptyState />
        ) : (
          <InspectionsExplorer inspections={inspectionRows} currentUserId={user.id} role={role} />
        )}
      </main>
    </div>
  );
}
