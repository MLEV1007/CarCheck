import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { PasskeyCard } from '@/components/settings/PasskeyCard';
import { DefaultPreferencesCard } from '@/components/settings/DefaultPreferencesCard';
import { SettingsTabs } from '@/components/settings/SettingsTabs';
import { DeleteAccountCard } from '@/components/settings/DeleteAccountCard';
import { DEFAULT_LICENSE_PLATE_COUNTRY } from '@/lib/inspections/constants';

interface SettingsPageContentProps {
  /** `app/settings/page.tsx` -> `'company'`, `app/settings/billing/page.tsx` -> `'billing'`
   * -- lásd `SettingsTabs.tsx` `initialTab` JSDoc-ját. */
  initialTab: 'company' | 'billing';
  /** `?success=true`/`?canceled=true` a Stripe Checkout visszairányításából -- kizárólag a
   * `/settings/billing` route adja át, `/settings`-nél mindig `null`. */
  billingBanner: 'success' | 'canceled' | null;
}

/**
 * A Cégbeállítások/Csapatkezelés/Előfizetés oldal TELJES tartalma (PROJEKT_INSTRUKCIOK.md
 * 5.A "Beállítások oldal" + "Frontend Fizetési Modal / Billing Felület" lépések) -- kiemelve
 * egy megosztott Server Component-be, mert MOSTANTÓL KÉT route jeleníti meg (`/settings` és
 * `/settings/billing`, ez utóbbi a Stripe Checkout `success_url`/`cancel_url` célja, hogy a
 * fizetésből visszatérő Menedzser egy STABIL, könyvjelezhető URL-re érkezzen, ami rögtön az
 * Előfizetés fület mutatja) -- a duplikált adatlekérdezés/layout elkerülése végett.
 *
 * A fájl az `app/settings/_components/` mappában él -- a vezető `_` miatt a Next.js App
 * Router NEM kezeli route-ként, tisztán belső, megosztott komponens.
 */
export async function SettingsPageContent({ initialTab, billingBanner }: SettingsPageContentProps) {
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

  const { data: organization } = profile?.organization_id
    ? await supabase
        .from('organizations')
        .select('team_management_enabled')
        .eq('id', profile.organization_id)
        .maybeSingle()
    : { data: null };

  const teamManagementEnabled = organization?.team_management_enabled ?? false;

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

  // Stripe Price ID-k -- SZERVER-oldalon olvasva (nincs NEXT_PUBLIC_ előtag, lásd
  // .env.local.example), a `BillingTab.tsx` ('use client') kliens-komponensnek prop-ként
  // adjuk tovább. `?? null` -- ha egy ár még nincs beállítva Vercelen, a hozzá tartozó
  // gomb a `BillingTab`-ban `disabled` marad, nem dob build/runtime hibát.
  const starterPriceId = process.env.STRIPE_PRICE_ID_STARTER ?? null;
  const proPriceId = process.env.STRIPE_PRICE_ID_PRO ?? null;
  const topupPriceId = process.env.STRIPE_PRICE_ID_TOPUP_10 ?? null;

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
          initialTab={initialTab}
          starterPriceId={starterPriceId}
          proPriceId={proPriceId}
          topupPriceId={topupPriceId}
          billingBanner={billingBanner}
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
