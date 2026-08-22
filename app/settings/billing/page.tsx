import type { Metadata } from 'next';
import { SettingsPageContent } from '@/app/settings/_components/SettingsPageContent';

export const metadata: Metadata = {
  title: 'Előfizetés | CarPass',
};

interface SettingsBillingPageProps {
  searchParams: Promise<{ success?: string; canceled?: string; session_id?: string }>;
}

/**
 * `/settings/billing`, a Stripe Checkout Session `success_url`/`cancel_url` célja (lásd
 * `app/api/stripe/checkout/route.ts`: `${origin}/settings/billing?success=true`/
 * `?canceled=true`), PROJEKT_INSTRUKCIOK.md "Stripe Checkout Session API" lépés,
 * 2026-08-04. Egy STABIL, könyvjelezhető URL, ami a fizetésből visszatérő Menedzsert
 * rögtön az "Előfizetés" fülre viszi (`SettingsPageContent` `initialTab="billing"`), a
 * `?success=`/`?canceled=` query paramból pedig egy visszaigazoló/megszakítás-banner
 * jelenik meg (`BillingTab.tsx`).
 */
export default async function SettingsBillingPage({ searchParams }: SettingsBillingPageProps) {
  const params = await searchParams;
  const billingBanner: 'success' | 'canceled' | null =
    params.success === 'true' ? 'success' : params.canceled === 'true' ? 'canceled' : null;
  // `session_id`, 2026-08-09, "Nincs számla-email" lépés: a Stripe `sendInvoice` API
  // időnként megbízhatatlanul viselkedik `invoice_creation`-nel létrehozott Checkout
  // számláknál (időszakos, indokolatlan "This invoice cannot be sent right now" hiba, lásd
  // `app/api/stripe/webhook/route.ts` JSDoc-ját), ezért a sikeres fizetés bannerben a
  // számla-linket a SAJÁT felületünkön is megjelenítjük (a `checkout/route.ts` a
  // `success_url`-be a Stripe `{CHECKOUT_SESSION_ID}` sablon-változóját illeszti), hogy az
  // e-mail-kiküldéstől függetlenül is elérje az ügyfél.
  const sessionId = params.session_id ?? null;

  return <SettingsPageContent initialTab="billing" billingBanner={billingBanner} sessionId={sessionId} />;
}
