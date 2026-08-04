import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * "Admin" (service-role) Supabase kliens -- KIZÁRÓLAG szerver-oldali Route Handlerekből
 * hívható, SOHA nem importálható 'use client' komponensbe (a `SUPABASE_SERVICE_ROLE_KEY`
 * nincs `NEXT_PUBLIC_` előtaggal, tehát a build eleve nem szivárogtatná a böngészőbe, de
 * ez a fájl explicit dokumentálja a szabályt is).
 *
 * Miért kell: a Supabase Auth-ban egy user VÉGLEGES törlése (`auth.admin.deleteUser()`,
 * lásd "Fiók törlése" -- `app/api/account/delete/route.ts`) KIZÁRÓLAG a service-role admin
 * API-val végezhető el -- sem az anon/publishable kulcsos kliens (`lib/supabase/client.ts`),
 * sem a session-cookie-alapú szerver kliens (`lib/supabase/server.ts`) nem tudja saját magát
 * törölni, mert ez a Supabase Auth API tudatos biztonsági korlátozása (self-service fiók-
 * törlés nincs a nyilvános Auth API-ban).
 *
 * `autoRefreshToken`/`persistSession: false` -- ez a kliens rövid életű, egyetlen Route
 * Handler-hívás alatt él, nincs böngésző-session-je, amit kezelnie kellene.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY hiányzik a szerver környezeti változói közül -- ' +
        'lásd .env.example, ez KIZÁRÓLAG szerver-oldalon (Vercel Environment Variables / ' +
        '.env.local) állítható be, NEXT_PUBLIC_ előtag NÉLKÜL.'
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
