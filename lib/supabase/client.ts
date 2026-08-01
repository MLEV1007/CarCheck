import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase kliens Client Component-ekhez (böngészőben fut).
 * Minden renderkor új példányt ad vissza, de a supabase-js belső
 * connection poolja miatt ez nem probléma.
 *
 * `auth.experimental.passkey: true` -- Jelszómentes/Passkey (WebAuthn) hitelesítés
 * bekapcsolása (@supabase/supabase-js >=2.111.0 szükséges hozzá). Ez teszi elérhetővé
 * a `supabase.auth.registerPasskey()` / `supabase.auth.signInWithPasskey()` metódusokat.
 * A Supabase Dashboardon a Relying Party ID `car-check-peach.vercel.app`-ra van állítva --
 * FONTOS: passkey csak ugyanahhoz a domainhez (vagy annak aldomainjeihez) köthető, ezért
 * localhoston (`npm run dev`) a passkey regisztráció/bejelentkezés NEM fog működni, amíg
 * a Supabase Dashboardon a `localhost` nincs felvéve külön Relying Party Origin-ként.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        experimental: { passkey: true },
      },
    }
  );
}
