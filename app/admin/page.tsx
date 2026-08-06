import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/roles';
import { AdminOrganizationsTable, type AdminOrganizationRow } from '@/components/admin/AdminOrganizationsTable';

export const metadata: Metadata = {
  title: 'Platform Admin | CarPass',
};

/**
 * Platform Admin felület -- a CarPass SaaS ÜZEMELTETŐJÉNEK (jelenleg
 * `manyilevente@gmail.com`, lásd `supabase/migrations/
 * 20260803_platform_admin_entitlements.sql` seed sorát) szánt belső oldal, ahol
 * eldönthető, MELYIK ÜGYFÉL (szervezet) kap Menedzser-szintű csapatkezelést
 * (`organizations.team_management_enabled`) -- a felhasználó explicit kérésére
 * ("szeretném úgy, hogy én a jövőben tudjam állítani, hogy melyik ügyfélnek járhat
 * manageri fiók és csapattagok hozzáadása") épített, PROJEKT_INSTRUKCIOK.md-n
 * kívüli, önálló admin-szegmens.
 *
 * KÉTRÉTEGŰ védelem: a `middleware.ts` (PROTECTED_PREFIXES) már megköveteli a
 * bejelentkezést; ITT, Server Component-szinten pedig a `platform_admins` allow-list
 * tagságát ellenőrizzük -- ha a hívó NEM platform admin, egyszerű "Hozzáférés
 * megtagadva" üzenetet lát (nem dobunk 404-et/redirect-et, mert az URL direkt
 * begépelése nem hiba, csak jogosultság kérdése). A TÉNYLEGES adatvédelem az
 * `organizations_select_platform_admin`/`profiles_select_platform_admin`/
 * `organizations_update_platform_admin` RLS policy-kon múlik, NEM ezen az oldal-
 * szintű ellenőrzésen.
 *
 * Linear Dark Design Style -- belső, nem ügyfél-arcú felület, ezért a "Szakértői
 * Munkaterület" stílusát követi.
 */
export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const isAdmin = await isPlatformAdmin(user.id);

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-canvas px-4">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-[16px] font-semibold text-linear-ink">Hozzáférés megtagadva</p>
          <p className="text-[13px] text-linear-ink-subtle">
            Ez a felület kizárólag a CarPass üzemeltetőjének elérhető.
          </p>
          <Link
            href="/dashboard"
            className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md border border-linear-hairline px-3.5 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Vissza a dashboardra
          </Link>
        </div>
      </div>
    );
  }

  // A `platform_admins` allow-listen szereplő usernek az RLS
  // (`organizations_select_platform_admin`/`profiles_select_platform_admin`) az ÖSSZES
  // szervezetet/profilt megmutatja -- ebből állítjuk össze soronként a Menedzser
  // email(ek)et és a tagszámot.
  const [{ data: organizations }, { data: profiles }] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, created_at, team_management_enabled')
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('organization_id, email, role'),
  ]);

  const rows: AdminOrganizationRow[] = (organizations ?? []).map((org) => {
    const members = (profiles ?? []).filter((profile) => profile.organization_id === org.id);
    const managerEmails = members
      .filter((profile) => profile.role === 'manager')
      .map((profile) => profile.email)
      .filter((email): email is string => Boolean(email));

    return {
      id: org.id,
      name: org.name,
      createdAt: org.created_at,
      teamManagementEnabled: org.team_management_enabled,
      managerEmails,
      memberCount: members.length,
    };
  });

  return (
    <div className="min-h-screen bg-linear-canvas">
      <header className="flex h-16 items-center gap-3 border-b border-linear-hairline px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-linear-ink-subtle transition-colors hover:bg-linear-surface-1 hover:text-linear-ink"
          aria-label="Vissza a dashboardra"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <ShieldCheck className="h-4 w-4 text-linear-primary" />
        <span className="flex-1 text-[14px] font-medium text-linear-ink">Platform Admin -- Szervezetek</span>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-linear-ink">Ügyfél-szervezetek</h1>
          <p className="mt-1 text-[14px] text-linear-ink-subtle">
            Itt engedélyezheted vagy tilthatod le ügyfelenként a Menedzser-szintű csapatkezelést
            (csapattag meghívása, jogosultság-kezelés).
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 px-6 py-10 text-center text-[14px] text-linear-ink-subtle">
            Még nincs regisztrált szervezet.
          </div>
        ) : (
          <AdminOrganizationsTable organizations={rows} />
        )}
      </main>
    </div>
  );
}
