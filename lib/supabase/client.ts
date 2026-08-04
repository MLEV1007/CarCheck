import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase kliens Client Component-ekhez (böngészőben fut).
 * Minden renderkor új példányt ad vissza, de a supabase-js belső
 * connection poolja miatt ez nem probléma.
 *
 * `auth.experimental.passkey: true` -- Jelszómentes/Passkey (WebAuthn) hitelesítés
 * bekapcsolása (@supabase/supabase-js >=2.111.0 szükséges hozzá). Ez teszi elérhetővé
 * a `supabase.auth.registerPasskey()` / `supabase.auth.signInWithPasskey()` metódusokat.
 *
 * **KRITIKUS -- a Relying Party ID a Supabase Dashboardon állítódik be, NEM a kódban**
 * (Authentication -> Passkeys, lásd https://supabase.com/dashboard/project/_/auth/passkeys),
 * és a WebAuthn szabvány szerint a beállított RP ID-nek PONTOSAN egyeznie kell (vagy annak
 * regisztrálható szülő-domainje kell legyen) az oldalt kiszolgáló tényleges domainnel --
 * különben a böngésző `SecurityError`-t dob ("The RP ID '...' is invalid for this
 * domain."). Eredetileg `car-check-peach.vercel.app`-ra volt állítva; 2026-08-04-én, a
 * saját domain (`carpass.hu`) bekötése UTÁN ez a beállítás A SUPABASE DASHBOARDON KÉZZEL
 * NEM lett frissítve, ezért a passkey regisztráció/bejelentkezés a `carpass.hu` domainen
 * elszállt -- ez KIZÁRÓLAG a Dashboardon javítható (Relying Party ID -> `carpass.hu`,
 * Relying Party Origins -> `https://carpass.hu`, szükség esetén `https://www.carpass.hu`
 * is, max 5 origin), a kódnak SEMMILYEN saját domain-hivatkozása nincs (mindenhol
 * `window.location.origin`-t használunk, lásd `MagicLinkForm.tsx`/`GoogleAuthButton.tsx`).
 * **FIGYELEM: az RP ID módosítása az ÖSSZES korábban regisztrált passkey-t
 * érvényteleníti** (WebAuthn-szabvány, nem Supabase-specifikus korlátozás) -- minden
 * érintett felhasználónak (a `car-check-peach.vercel.app` alatt korábban regisztrált
 * passkey-vel rendelkezőknek) újra kell regisztrálnia a `/settings` oldalon a váltás
 * után, a jelszómentes Magic Link belépés (`MagicLinkForm.tsx`) ettől függetlenül
 * változatlanul működik.
 *
 * Ugyanez az oka annak is, hogy localhoston (`npm run dev`) a passkey regisztráció/
 * bejelentkezés NEM fog működni, amíg a Supabase Dashboardon a `localhost` nincs felvéve
 * külön Relying Party Origin-ként.
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
