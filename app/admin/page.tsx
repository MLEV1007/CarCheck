import type { Metadata } from 'next';
import Link from 'next/link';
import { after } from 'next/server';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/roles';
import { notifyUnauthorizedAdminAccess } from '@/lib/adminAlerts';
import type { QuotaPlanTier } from '@/types/quotas';
import { AdminOrganizationsTable, type AdminOrganizationRow } from '@/components/admin/AdminOrganizationsTable';
import { BackLink } from '@/components/ui/BackLink';

export const metadata: Metadata = {
  title: 'Platform Admin | CarPass',
};

/**
 * Platform Admin felület, a CarPass SaaS ÜZEMELTETŐJÉNEK (jelenleg
 * `manyilevente@gmail.com`, lásd `supabase/migrations/
 * 20260803_platform_admin_entitlements.sql` seed sorát) szánt belső oldal, ahol
 * eldönthető, MELYIK ÜGYFÉL (szervezet) kap Menedzser-szintű csapatkezelést
 * (`organizations.team_management_enabled`), a felhasználó explicit kérésére
 * ("szeretném úgy, hogy én a jövőben tudjam állítani, hogy melyik ügyfélnek járhat
 * manageri fiók és csapattagok hozzáadása") épített, PROJEKT_INSTRUKCIOK.md-n
 * kívüli, önálló admin-szegmens.
 *
 * **2026-08-07, "Csapatkezelés tier-feloldás" lépés:** azóta a Stripe-vásárlást
 * feldolgozó `apply_plan_purchase` RPC IS beállítja ezt a mezőt Műhely / Kereskedői
 * (growth) tier-től felfelé automatikusan (lásd
 * `supabase/migrations/20260807_team_management_tier_unlock.sql`), az itteni kézi
 * kapcsoló mostantól egy KIEGÉSZÍTŐ override (pl. egyedi kivétel egy Starter
 * ügyfélnek), NEM az egyetlen forrás.
 *
 * KÉTRÉTEGŰ védelem: a `middleware.ts` (PROTECTED_PREFIXES) már megköveteli a
 * bejelentkezést; ITT, Server Component-szinten pedig a `platform_admins` allow-list
 * tagságát ellenőrizzük, ha a hívó NEM platform admin, egyszerű "Hozzáférés
 * megtagadva" üzenetet lát (nem dobunk 404-et/redirect-et, mert az URL direkt
 * begépelése nem hiba, csak jogosultság kérdése). A TÉNYLEGES adatvédelem az
 * `organizations_select_platform_admin`/`profiles_select_platform_admin`/
 * `organizations_update_platform_admin` RLS policy-kon múlik, NEM ezen az oldal-
 * szintű ellenőrzésen.
 *
 * Linear Dark Design Style, belső, nem ügyfél-arcú felület, ezért a "Szakértői
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
    // 2026-08-11, "Illetéktelen /admin hozzáférés riasztás" lépés (security audit
    // felvetésére), `after()` (Next.js 15, stabil API): a naplózás + email-riasztás a
    // VÁLASZ elküldése UTÁN fut le, tehát az elutasított user nem várakozik rá (a "Hozzáférés
    // megtagadva" oldal ugyanolyan gyorsan jelenik meg, mint eddig). Lásd
    // `lib/adminAlerts.ts`, soha nem dob hibát ide vissza, minden hibát elnyel/logol.
    after(() => notifyUnauthorizedAdminAccess({ id: user.id, email: user.email }));

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
  // szervezetet/profilt megmutatja, ebből állítjuk össze soronként a Menedzser
  // email(ek)et és a tagszámot.
  //
  // 2026-08-11, "Platform Admin kredit/előfizetés-kezelés" lépés, KÉT ÚJ lekérdezés:
  //   * `user_credits`, az `user_credits_select_platform_admin` RLS policy nyitja meg
  //     (lásd `20260811120000_admin_credits_management.sql`) MINDEN szervezet kredit/kvóta/
  //     Stripe-előfizetés sorát, nem csak a hívóét.
  //   * `inspections` (csak `organization_id` oszlop), az `inspections_select_platform_admin`
  //     RLS policy nyitja meg, KIZÁRÓLAG a "hány vizsgálatot csinált eddig ez az ügyfél"
  //     statisztikához (kliens-oldalon számolva soronként, lásd lent), ennyi szervezetnél
  //     (jelenleg maroknyi ügyfél) ez egyszerűbb és átláthatóbb, mint egy külön count-RPC-t
  //     bevezetni, ha a szervezetszám jelentősen megnő, érdemes lesz lecserélni egy `group by`
  //     SQL nézetre/RPC-re.
  const [{ data: organizations }, { data: profiles }, { data: credits }, { data: inspectionRows }, { data: aiApiCallRows }] =
    await Promise.all([
      supabase
        .from('organizations')
        .select('id, name, created_at, team_management_enabled')
        .order('created_at', { ascending: false }),
      // `id`/`invited_by` (2026-08-14, "Meghívás-attribúció" lépés), ebből építjük
      // fel lent a `profileEmailById` lookup-ot + soronként azt, hogy a meghívott
      // Átvizsgálót MELYIK Menedzser hívta meg (lásd `AdminOrganizationsTable.tsx`
      // "Csapattagok és meghívások" panelje).
      supabase.from('profiles').select('id, organization_id, email, role, invited_by'),
      supabase
        .from('user_credits')
        .select(
          'organization_id, plan_tier, monthly_inspections_limit, monthly_inspections_remaining, purchased_inspections_remaining, monthly_ai_limit, monthly_ai_remaining, purchased_ai_remaining, subscription_status, subscription_current_period_end'
        ),
      supabase.from('inspections').select('organization_id'),
      // "AI API hívás" statisztika (2026-08-17, Levi kérésére: "lássam, mennyi AI API
      // hívást tettek az egyes fiókok, és melyik modellnek"), lásd `ai_api_calls`
      // tábla (`supabase/migrations/20260817000000_ai_api_calls_admin_usage_tracking.sql`),
      // `lib/aiApiCallLog.ts`. Az utolsó 30 napra szűkítve, ez a tábla (a `inspections`-
      // szel ellentétben) sűrűn, MINDEN egyes Gemini-hívásnál ír, tehát idővel jóval
      // gyorsabban nőhet; egy időablak nélküli lekérdezés hosszú távon egyre nagyobb
      // sorszámot húzna be minden admin-oldal-betöltéskor. Ha a szervezetszám/hívásszám
      // jelentősen megnő, érdemes lesz ezt egy `group by` SQL nézetre/RPC-re lecserélni
      // (ugyanaz a megjegyzés, mint az `inspectionCountsByOrg`-nál).
      supabase
        .from('ai_api_calls')
        .select('organization_id, model, success')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

  const inspectionCountsByOrg = new Map<string, number>();
  for (const row of inspectionRows ?? []) {
    inspectionCountsByOrg.set(row.organization_id, (inspectionCountsByOrg.get(row.organization_id) ?? 0) + 1);
  }

  // Szervezetenkénti + modellenkénti AI API hívás-bontás, lásd `AdminOrganizationRow.aiApiCallStats`
  // JSDoc-ját. Kliens-oldalon (itt, a Server Component-ben) aggregálva, ugyanaz a minta,
  // mint az `inspectionCountsByOrg`-nál.
  const aiCallStatsByOrg = new Map<string, { totalCalls: number; successCalls: number; byModel: Map<string, number> }>();
  for (const row of aiApiCallRows ?? []) {
    const existing = aiCallStatsByOrg.get(row.organization_id) ?? {
      totalCalls: 0,
      successCalls: 0,
      byModel: new Map<string, number>(),
    };
    existing.totalCalls += 1;
    if (row.success) existing.successCalls += 1;
    existing.byModel.set(row.model, (existing.byModel.get(row.model) ?? 0) + 1);
    aiCallStatsByOrg.set(row.organization_id, existing);
  }

  // `invited_by` -> meghívó email feloldásához (2026-08-14, "Meghívás-attribúció"
  // lépés), a `profiles.invited_by` egy `auth.users.id`-t tárol, ezt kell egy
  // olvasható emailre feloldani a "Csapattagok és meghívások" panelhez.
  const profileEmailById = new Map<string, string>();
  for (const profile of profiles ?? []) {
    if (profile.id && profile.email) {
      profileEmailById.set(profile.id, profile.email);
    }
  }

  const rows: AdminOrganizationRow[] = (organizations ?? []).map((org) => {
    const members = (profiles ?? []).filter((profile) => profile.organization_id === org.id);
    const managerEmails = members
      .filter((profile) => profile.role === 'manager')
      .map((profile) => profile.email)
      .filter((email): email is string => Boolean(email));

    // A szervezetnek MÉG NEM feltétlenül létezik `user_credits` sora (lazy-create,
    // lásd `lib/quotas.ts` `getOrganizationQuotaBalance`, csak az ELSŐ tényleges
    // AI-hívás/vizsgálat-indítás hozza létre), ha nincs, a tábla-alapértékekkel
    // (jelenleg: free/5/3, lásd `20260807_free_tier_default_quota.sql`) töltjük fel a
    // sort, hogy a Platform Admin felület akkor is szerkeszthető űrlapot mutasson, ha a
    // szervezet még egyszer sem használta a rendszert, a mentéskor (lásd
    // `AdminOrganizationsTable.tsx`) `upsert` hozza majd létre ténylegesen a sort.
    const credit = (credits ?? []).find((row) => row.organization_id === org.id);

    // Soronkénti tagsor a "Csapattagok és meghívások" panelhez, Menedzsernél mindig
    // "Saját regisztráció" (lásd `AdminOrganizationsTable.tsx`), Átvizsgálónál pedig a
    // `profileEmailById`-ból feloldott meghívó email (ha rögzítve lett, egy régebbi,
    // e funkció ELŐTT meghívott Átvizsgálónál `invited_by` NULL marad, lásd a migráció
    // JSDoc-ját).
    const memberRows = members
      .map((profile) => ({
        id: profile.id as string,
        email: profile.email,
        role: (profile.role === 'inspector' ? 'inspector' : 'manager') as 'manager' | 'inspector',
        invitedByEmail: profile.invited_by ? profileEmailById.get(profile.invited_by) ?? null : null,
      }))
      .sort((a, b) => (a.role === b.role ? 0 : a.role === 'manager' ? -1 : 1));

    return {
      id: org.id,
      name: org.name,
      createdAt: org.created_at,
      teamManagementEnabled: org.team_management_enabled,
      managerEmails,
      memberCount: members.length,
      members: memberRows,
      totalInspectionsCreated: inspectionCountsByOrg.get(org.id) ?? 0,
      planTier: (credit?.plan_tier as QuotaPlanTier | undefined) ?? 'free',
      monthlyInspectionsLimit: credit?.monthly_inspections_limit ?? 5,
      monthlyInspectionsRemaining: credit?.monthly_inspections_remaining ?? 5,
      purchasedInspectionsRemaining: credit?.purchased_inspections_remaining ?? 0,
      monthlyAiLimit: credit?.monthly_ai_limit ?? 3,
      monthlyAiRemaining: credit?.monthly_ai_remaining ?? 3,
      purchasedAiRemaining: credit?.purchased_ai_remaining ?? 0,
      subscriptionStatus: credit?.subscription_status ?? null,
      subscriptionCurrentPeriodEnd: credit?.subscription_current_period_end ?? null,
      aiApiCallStats: (() => {
        const stats = aiCallStatsByOrg.get(org.id);
        if (!stats) return { totalCalls: 0, successCalls: 0, byModel: [] };
        return {
          totalCalls: stats.totalCalls,
          successCalls: stats.successCalls,
          byModel: Array.from(stats.byModel.entries())
            .map(([model, count]) => ({ model, count }))
            .sort((a, b) => b.count - a.count),
        };
      })(),
    };
  });

  return (
    <div className="min-h-screen bg-linear-canvas">
      <header className="flex h-16 items-center gap-3 border-b border-linear-hairline px-4 sm:px-6">
        <BackLink href="/dashboard" />
        <ShieldCheck className="h-4 w-4 text-linear-primary" />
        <span className="flex-1 text-[14px] font-medium text-linear-ink">Platform Admin, Szervezetek</span>
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
