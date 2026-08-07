import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * "Publikus" (anon-kulcsos, cookie-mentes) Supabase kliens -- KIZÁRÓLAG a NEM bejelentkezést
 * igénylő `/report/[public_token]` oldalhoz (PROJEKT_INSTRUKCIOK.md 5.C), a "Teljesítmény-audit
 * és refaktorálás" lépés (2026-08-07) D pontjához ("Publikus Riport Caching").
 *
 * MIÉRT NEM a `lib/supabase/server.ts` `createClient()`-je: az a `next/headers` `cookies()`
 * függvényét hívja (Next.js "Dynamic API"), ami a Next.js App Router-ben AUTOMATIKUSAN
 * kizárja az oldalt a statikus renderelésből/ISR-ből -- MINDEN egyes látogatásnál újra
 * lefutna a `get_public_report` RPC, még akkor is, ha a lapon `export const revalidate = ...`
 * szerepel. A publikus riport viszont EXPLICIT MÓDON nem igényel bejelentkezést/session-t
 * (a `get_public_report` RPC SECURITY DEFINER, az `anon` szerepkör futtathatja, lásd a
 * `page.tsx` JSDoc-ját) -- egy valódi, be nem jelentkezett látogató böngészőjében sincs
 * releváns Supabase session-cookie ehhez az oldalhoz. Ez a kliens emiatt szándékosan NEM
 * olvas cookie-t, `next/headers`-t nem importál -- így az oldal ténylegesen cache-elhető/
 * ISR-re jogosult marad.
 *
 * `persistSession: false` -- rövid életű, egyetlen kérés/build-időbeli renderelés alatt él,
 * nincs böngésző-session-je, amit kezelnie kellene (ugyanaz az elv, mint `lib/supabase/admin.ts`
 * "Admin" kliensénél, csak itt az ANON publishable kulccsal, nem service-role-lal).
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
