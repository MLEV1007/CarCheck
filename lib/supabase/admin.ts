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
/**
 * Külön, azonosítható hibaosztály (2026-08-04, hibajavítás -- lásd status.md) -- a
 * felhasználó "Váratlan hiba történt a fiók törlése közben." üzenetet kapott a "Fiók
 * törlése" gombra kattintva, ami a `route.ts` legkülső `catch`-ének GENERIKUS
 * üzenete volt -- ez elfedte a TÉNYLEGES okot (a `SUPABASE_SERVICE_ROLE_KEY` hiányzott
 * a szerver környezeti változói közül, lásd 47. szakasz -- ez a kulcs a sandboxban
 * SOSEM volt beállítva, a felhasználónak kézzel kellett volna pótolnia). Ezzel a
 * dedikált hibaosztállyal a `route.ts` MOST MÁR meg tudja különböztetni ezt a
 * konfigurációs hibát egy tényleges, váratlan futásidejű hibától, és egy konkrét,
 * cselekvésre ösztönző üzenetet adhat vissza a generikus helyett.
 */
export class MissingServiceRoleKeyError extends Error {
  constructor() {
    super(
      'SUPABASE_SERVICE_ROLE_KEY hiányzik a szerver környezeti változói közül -- ' +
        'lásd .env.local.example, ez KIZÁRÓLAG szerver-oldalon (Vercel Environment ' +
        'Variables / .env.local) állítható be, NEXT_PUBLIC_ előtag NÉLKÜL.'
    );
    this.name = 'MissingServiceRoleKeyError';
  }
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new MissingServiceRoleKeyError();
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
