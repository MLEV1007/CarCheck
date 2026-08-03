import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { PasskeyCard } from '@/components/settings/PasskeyCard';
import { DefaultPreferencesCard } from '@/components/settings/DefaultPreferencesCard';
import { SettingsTabs } from '@/components/settings/SettingsTabs';
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
          </div>
        </SettingsTabs>
      </main>
    </div>
  );
}
