import { createClient as createSupabaseClient } from '@supabase/supabase-js';

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
  /** Melyik konkrét env változó hiányzik -- 2026-08-04, MÁSODIK hibajavítási kör (lásd
   * status.md): a felhasználó a Vercel Dashboardon beállította a kulcsot ÉS push+redeploy
   * után is UGYANEZT a hibát kapta -- ez azt jelenti, hogy a `SUPABASE_SERVICE_ROLE_KEY`
   * ténylegesen NEM ér el a futó Route Handlerig (leggyakoribb ok: a Vercel Environment
   * Variable NEM lett bepipálva a "Production" környezethez, csak Preview/Development-hez
   * -- ez elkülönítve állítható be projektenként a Vercel felületén). Ez a mező (`varName`)
   * teszi lehetővé, hogy a `route.ts` a hibaüzenetben KONKRÉTAN megnevezze, melyik változó
   * hiányzik (eddig mindkét eset -- URL vagy kulcs hiánya -- ugyanazt az egybemosott
   * üzenetet adta, ami megnehezítette a diagnózist). */
  varName: 'NEXT_PUBLIC_SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY';

  constructor(varName: 'NEXT_PUBLIC_SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY') {
    super(
      `${varName} hiányzik (vagy üres) a szerver környezeti változói közül -- lásd ` +
        '.env.local.example. Vercelen ellenőrizd, hogy a változó neve PONTOSAN ' +
        `\`${varName}\`, a "Production" környezet be van pipálva mellette, ÉS hogy a ` +
        'beállítás után történt egy ÚJ deployment (egy már futó deployment nem veszi ' +
        'fel utólag a Vercel Dashboardon módosított változókat).'
    );
    this.name = 'MissingServiceRoleKeyError';
    this.varName = varName;
  }
}

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
  // `.trim()` -- védekező tisztítás arra az esetre, ha a Vercel Dashboardon a kulcs
  // bemásolásakor véletlenül egy vezető/záró szóköz vagy sortörés is bekerült (gyakori
  // copy-paste hiba) -- egy csak whitespace-t tartalmazó érték enélkül `truthy` lenne,
  // és a hiba egy jóval kevésbé egyértelmű, a tényleges Supabase admin API hívásnál
  // jelentkező hibaként bukna elő a lenti "hiányzik" ellenőrzés helyett.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) {
    throw new MissingServiceRoleKeyError('NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!serviceRoleKey) {
    throw new MissingServiceRoleKeyError('SUPABASE_SERVICE_ROLE_KEY');
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
