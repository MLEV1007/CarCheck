import type { Metadata } from 'next';
import { SettingsPageContent } from '@/app/settings/_components/SettingsPageContent';

export const metadata: Metadata = {
  title: 'Cégbeállítások | CarPass',
};

/**
 * Cégbeállítások (PROJEKT_INSTRUKCIOK.md 5.A "Beállítások oldal"): a vizsgáló saját
 * `profiles` sorát szerkeszti, céglogó, cégnév, telefonszám, email cím, elsődleges
 * márkaszín. Stripe design system (stripe.md): `#f6f9fc` világos háttér, fehér kártya,
 * pill (`rounded-full`) gombok, `#533afd` primary szín.
 *
 * A tényleges tartalom (adatlekérdezés + fül-elrendezés, "Cégbeállítások"/"Csapatkezelés"/
 * "Előfizetés") a megosztott `SettingsPageContent`-ben él, lásd annak JSDoc-ját arról,
 * miért osztja meg ezt a `/settings/billing` route-tal (2026-08-04, Stripe integráció).
 *
 * Server Component: a middleware.ts (lib/supabase/middleware.ts PROTECTED_PREFIXES)
 * már véd minden `/settings` route-ot.
 */
export default function SettingsPage() {
  return <SettingsPageContent initialTab="company" billingBanner={null} sessionId={null} />;
}
