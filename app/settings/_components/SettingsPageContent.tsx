import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { PasskeyCard } from '@/components/settings/PasskeyCard';
import { DefaultPreferencesCard } from '@/components/settings/DefaultPreferencesCard';
import { ReportThresholdsCard } from '@/components/settings/ReportThresholdsCard';
import { SettingsTabs } from '@/components/settings/SettingsTabs';
import { DeleteAccountCard } from '@/components/settings/DeleteAccountCard';
import { DEFAULT_LICENSE_PLATE_COUNTRY, DEFAULT_REPORT_THRESHOLDS } from '@/lib/inspections/constants';
import type { ReportThresholds } from '@/lib/inspections/types';

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
    .select(
      'company_name, phone, email, logo_url, primary_color, role, organization_id, paint_threshold_gyari_max_micron, paint_threshold_ujrafujt_max_micron, tire_age_warning_years, tire_tread_warning_mm'
    )
    .eq('id', user.id)
    .maybeSingle();

  const role = profile?.role === 'inspector' ? 'inspector' : 'manager';

  // Riport küszöbértékek (2026-08-07) -- lásd `ReportThresholdsCard.tsx` JSDoc-ját. A
  // `??` fallback a `DEFAULT_REPORT_THRESHOLDS`-re csak defenzív biztonsági háló (a DB
  // oszlopok `not null default`-tal jönnek létre, gyakorlatban sosem `null`-ok).
  const initialThresholds: ReportThresholds = {
    paintGyariMaxMicron: profile?.paint_threshold_gyari_max_micron ?? DEFAULT_REPORT_THRESHOLDS.paintGyariMaxMicron,
    paintUjrafujtMaxMicron:
      profile?.paint_threshold_ujrafujt_max_micron ?? DEFAULT_REPORT_THRESHOLDS.paintUjrafujtMaxMicron,
    tireAgeWarningYears: profile?.tire_age_warning_years ?? DEFAULT_REPORT_THRESHOLDS.tireAgeWarningYears,
    tireTreadWarningMm: profile?.tire_tread_warning_mm ?? DEFAULT_REPORT_THRESHOLDS.tireTreadWarningMm,
  };

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
  // 2026-08-06, "Árazási struktúra bővítés" lépés: `growth` + 3 AI-kredit-csomag ár
  // hozzáadva -- a `business` tier szándékosan NEM kap price ID-t (egyedi ajánlat, lásd
  // `BillingTab.tsx` JSDoc-ját).
  const starterPriceId = process.env.STRIPE_PRICE_ID_STARTER ?? null;
  const growthPriceId = process.env.STRIPE_PRICE_ID_GROWTH ?? null;
  const proPriceId = process.env.STRIPE_PRICE_ID_PRO ?? null;
  const topupPriceId = process.env.STRIPE_PRICE_ID_TOPUP_10 ?? null;
  const aiTopup5PriceId = process.env.STRIPE_PRICE_ID_AI_TOPUP_5 ?? null;
  const aiTopup15PriceId = process.env.STRIPE_PRICE_ID_AI_TOPUP_15 ?? null;
  const aiTopup40PriceId = process.env.STRIPE_PRICE_ID_AI_TOPUP_40 ?? null;

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
          growthPriceId={growthPriceId}
          proPriceId={proPriceId}
          topupPriceId={topupPriceId}
          aiTopup5PriceId={aiTopup5PriceId}
          aiTopup15PriceId={aiTopup15PriceId}
          aiTopup40PriceId={aiTopup40PriceId}
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
            <ReportThresholdsCard userId={user.id} initialThresholds={initialThresholds} />
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
