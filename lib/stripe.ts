import Stripe from 'stripe';

/**
 * Megosztott, szerver-oldali Stripe kliens singleton (PROJEKT_INSTRUKCIOK.md "Stripe
 * Checkout Session API, Webhook logika..." lépés, 2026-08-04), KIZÁRÓLAG Route
 * Handlerekből importálható (`app/api/stripe/checkout/route.ts`,
 * `app/api/stripe/webhook/route.ts`), SOHA nem 'use client' komponensbe, mert a
 * `STRIPE_SECRET_KEY` nincs `NEXT_PUBLIC_` előtaggal (a build eleve nem szivárogtatná a
 * böngészőbe, de ez a fájl explicit dokumentálja a szabályt is, ugyanúgy, mint
 * `lib/supabase/admin.ts` a service-role kulcsnál).
 *
 * Lusta (lazy) inicializálás egy modul-szintű `let` változóval, NEM a modul betöltésekor
 * azonnal példányosítunk, hogy egy hiányzó `STRIPE_SECRET_KEY` (pl. build/lint-idő, vagy egy
 * olyan Vercel preview-környezet, ahol a Stripe-integráció még nincs bekötve) ne dobjon
 * hibát a modul IMPORT-jakor, csak a TÉNYLEGES használatkor (`getStripeClient()` hívásakor).
 */
let stripeClient: Stripe | null = null;

export class MissingStripeSecretKeyError extends Error {
  constructor() {
    super(
      'A STRIPE_SECRET_KEY hiányzik (vagy üres) a szerver környezeti változói közül, ' +
        'lásd .env.local.example. Vercelen ellenőrizd, hogy a változó neve PONTOSAN ' +
        '`STRIPE_SECRET_KEY`, és a "Production" környezet be van pipálva mellette.'
    );
    this.name = 'MissingStripeSecretKeyError';
  }
}

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;

  // `.trim()`, ugyanaz a védekező tisztítás, mint `lib/supabase/admin.ts`-ben a
  // service-role kulcsnál, arra az esetre, ha a Vercel Dashboardon a kulcs bemásolásakor
  // véletlenül egy vezető/záró szóköz/sortörés is bekerült.
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new MissingStripeSecretKeyError();
  }

  stripeClient = new Stripe(secretKey);
  return stripeClient;
}
