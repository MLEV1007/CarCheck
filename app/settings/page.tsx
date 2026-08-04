import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { PasskeyCard } from '@/components/settings/PasskeyCard';
import { DefaultPreferencesCard } from '@/components/settings/DefaultPreferencesCard';
import { SettingsTabs } from '@/components/settings/SettingsTabs';
import { DeleteAccountCard } from '@/components/settings/DeleteAccountCard';
import { DEFAULT_LICENSE_PLATE_COUNTRY } from '@/lib/inspections/constants';

export const metadata: Metadata = {
  title: 'Cégbeállítások | Autó Állapotfelmérő',
};

/**
 * Cégbeállítások (PROJEKT_INSTRUKCIOK.md 5.A "Beállítások oldal"): a vizsgáló saját
 * `profiles` sorát szerkeszti -- céglogó, cégnév, telefonszám, email cím, elsődleges
 * márkaszín. Stripe design system (stripe.md): `#f6f9fc` világos háttér, fehér kártya,
 * pill (`rounded-full`) gombok, `#533afd` primary szín.
 *
 * Server Component: a middleware.ts (lib/supabase/middleware.ts PROTECTED_PREFIXES)
 * már véd minden `/settings` route-ot, de a `user` null-ellenőrzés itt is megmarad
 * defenzív, TS-biztonságos fallbackként (lásd app/dashboard/page.tsx ugyanezt a mintát).
 * A profil-lekérdezés az `auth.uid()`-ra épülő RLS policy (`profiles_select_own`)
 * miatt garantáltan csak a bejelentkezett user saját sorát adhatja vissza.
 */
export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_name, phone, email, logo_url, primary_color, role, organization_id')
    .eq('id', user.id)
    .maybeSingle();

  const role = profile?.role === 'inspector' ? 'inspector' : 'manager';

  // Platform Admin entitlement (2026-08-03, "Platform Admin + Csapatkezelés-
  // entitlement" lépés) -- a Csapatkezelés fül csak akkor mutatja a tényleges
  // funkciót, ha az üzemeltető ("Platform Admin", lásd `/admin`) ezt a szervezetnek
  // engedélyezte. A `organizations_select_own_org` RLS mindenkinek engedi a SAJÁT
  // szervezete sorát olvasni, tehát ez a lekérdezés Menedzsernek és Átvizsgálónak is
  // biztonságosan lefut.
  const { data: organization } = profile?.organization_id
    ? await supabase
        .from('organizations')
        .select('team_management_enabled')
        .eq('id', profile.organization_id)
        .maybeSingle()
    : { data: null };

  const teamManagementEnabled = organization?.team_management_enabled ?? false;

  // "Fiók törlése" (Veszélyzóna) figyelmeztető szövegéhez -- csak Menedzsernek releváns,
  // hogy tudja, a törlés után marad-e valaki, aki hozzáfér a cég adataihoz. A
  // `profiles_select_org_manager` RLS policy (20260803_organizations_rbac.sql) csak
  // Menedzsernek engedi a teljes szervezet profiljainak lekérdezését, ezért ez a
  // számláló Átvizsgálónál mindig `0` marad (nem is jelenik meg a UI-n, lásd
  // `DeleteAccountCard.tsx`).
  const { count: otherTeamMemberCount } =
    role === 'manager' && profile?.organization_id
      ? await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', profile.organization_id)
          .neq('id', user.id)
      : { count: 0 };

  const initialDefaultLicenseCountry =
    (user.user_metadata?.default_license_country as string | undefined) || DEFAULT_LICENSE_PLATE_COUNTRY;

  return (
    <div className="min-h-screen bg-stripe-canvas-soft">
      <header className="border-b border-stripe-hairline bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-5 sm:px-6">
          <Link
            href="/dashboard"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-stripe-hairline-input px-3.5 font-sohne text-[13px] font-normal text-stripe-ink-secondary transition-colors hover:bg-stripe-canvas-soft"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </Link>
          <h1 className="font-sohne text-[18px] font-normal text-stripe-ink">Cégbeállítások</h1>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
        <SettingsTabs
          role={role}
          organizationId={profile?.organization_id ?? ''}
          currentUserId={user.id}
          teamManagementEnabled={teamManagementEnabled}
        >
          <div className="flex flex-col gap-6">
            <SettingsForm
              userId={user.id}
              initialCompanyName={profile?.company_name ?? ''}
              initialPhone={profile?.phone ?? ''}
              initialEmail={profile?.email ?? user.email ?? ''}
              initialLogoUrl={profile?.logo_url ?? null}
              initialPrimaryColor={profile?.primary_color ?? '#1c69d4'}
            />
            <DefaultPreferencesCard initialDefaultLicenseCountry={initialDefaultLicenseCountry} />
            <PasskeyCard />
            <DeleteAccountCard
              email={profile?.email ?? user.email ?? ''}
              role={role}
              otherTeamMemberCount={otherTeamMemberCount ?? 0}
            />
          </div>
        </SettingsTabs>
      </main>
    </div>
  );
}
