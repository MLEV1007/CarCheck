-- =============================================================================
-- 60 napos automatikus videó-megőrzési politika
-- =============================================================================
-- 2026-08-21-i felhasználói kérés: "egy olyan fontos beállítást szeretnék, hogy a
-- videókat 60 napig tárolja csak a rendszer, utána automatikusan törli. A képek minden
-- más megmarad, viszont a videót törölni kell." -- ez a migráció KIZÁRÓLAG a videó-
-- nyilvántartási táblát/RLS-t hozza létre; a TÉNYLEGES napi törlést az
-- `app/api/cron/cleanup-expired-videos/route.ts` Vercel Cron végpont végzi (lásd annak
-- JSDoc-ját a teljes indoklásért -- miért NEM `storage.objects` közvetlen SQL-törlés,
-- és miért NEM `pg_cron`).
--
-- Ez a fájl:
--   1) video_assets tábla -- egyetlen sor = egyetlen sikeresen feltöltött VIDEÓ (fotó
--      SOSE kerül bele), a feltöltés pillanatában íródik (asztali wizard ÉS QR-kódos
--      telefonos feltöltés is), a cron végpont ez alapján dönti el, mely Storage-
--      objektumok érték el a 60 napot.
--   2) remove_general_photo_url(uuid, text) -- SECURITY DEFINER segédfüggvény a
--      `inspections.general_photos` tömbből egyetlen URL eltávolításához
--      (`array_remove`), mert a Supabase JS `.update()` nem tud SQL-kifejezést küldeni
--      egy oszlop értékeként.
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-
-- követés célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével lett
-- közvetlenül az éles projektre alkalmazva, ugyanaz a minta, mint
-- `20260821_video_qr_upload.sql`-nél.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) video_assets -- videó-nyilvántartási tábla
-- -----------------------------------------------------------------------------
create table public.video_assets (
  id uuid primary key default gen_random_uuid(),
  -- NINCS FK az inspections.id-ra -- a wizard inspectionId-ja (crypto.randomUUID()) a
  -- wizard megnyitásakor generálódik, MIELŐTT az inspections sor létrejönne (a videó-
  -- feltöltés az `inspections` UPSERT ELŐTT fut le, lásd InspectionWizard.tsx
  -- `handleSubmit`-jét) -- ugyanaz a minta, mint a `qr_upload_sessions`-nél (lásd annak
  -- kommentjét a 20260821_video_qr_upload.sql-ben).
  inspection_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  -- 'general' (inspections.general_photos tömb) VAGY 'defect' (defects.media_url) -- a
  -- cron végpont ez alapján dönti el, MELYIK oszlopot kell megtisztítania a törlés után.
  category text not null check (category in ('general', 'defect')),
  -- Az `inspection-media` bucketen belüli útvonal -- EZT adjuk át a Storage `.remove()`
  -- hívásnak törléskor (lásd a cron route JSDoc-ját: a `storage.objects` táblából
  -- KÖZVETLENÜL SQL-lel törölt sor NEM törölné a tényleges fájlbájtokat).
  storage_path text not null unique,
  -- A publikus URL -- ezt hasonlítjuk össze a `inspections.general_photos`/
  -- `defects.media_url` mezőkkel a törölt videóra mutató hivatkozás megtisztításakor.
  media_url text not null,
  created_at timestamptz not null default now(),
  -- NULL amíg a videó megvan -- a cron végpont ERRE állítja `now()`-ra, miután a Storage-
  -- objektumot ténylegesen törölte ÉS a hivatkozást megtisztította. Megtartjuk a sort
  -- (nem töröljük), hogy legyen auditnaplója, mikor/melyik videó lett automatikusan
  -- eltávolítva.
  deleted_at timestamptz
);

comment on table public.video_assets is
  'Egyetlen sor = egyetlen sikeresen feltöltött VIDEÓ (fotó SOHA nem kerül bele) -- a 60 '
  'napos automatikus videó-megőrzési politika nyilvántartási táblája, lásd status.md '
  '2026-08-21-i bejegyzését. Az `app/api/cron/cleanup-expired-videos` Vercel Cron végpont '
  'ez alapján dönti el, mely Storage-objektumokat kell törölnie 60 nap után, és melyik '
  '`inspections.general_photos`/`defects.media_url` hivatkozást kell utána megtisztítania.';

alter table public.video_assets enable row level security;

create index video_assets_organization_id_idx on public.video_assets (organization_id);

-- Parciális index -- a cron végpont mindig `deleted_at is null and created_at < <cutoff>`
-- alapján keres, ez az index KIZÁRÓLAG a még nem törölt sorokat tartalmazza, tehát a
-- tábla növekedésével (egyre több MÁR törölt sor) sem lassul a napi lekérdezés.
create index video_assets_pending_cleanup_idx
  on public.video_assets (created_at)
  where deleted_at is null;

-- A hitelesített asztali kliens (InspectionWizard.tsx `uploadMediaSmart`) közvetlenül,
-- a SAJÁT (RLS-t tiszteletben tartó) Supabase klienesén keresztül szúrja be a sort videó
-- feltöltése után -- ugyanaz a "kliens írja a saját szervezetének sorát" minta, mint az
-- `inspections`/`defects` tábláknál. A QR-kódos telefonos feltöltés (`.../confirm/route.ts`)
-- viszont admin (service-role) kliensen keresztül ír, ami MINDEN RLS policy-t megkerül --
-- ott a policy nem véd, de nem is szükséges, mert a szerver-oldali kód eleve garantálja a
-- helyes `organization_id`-t.
create policy video_assets_select_org
  on public.video_assets for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy video_assets_insert_org
  on public.video_assets for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

-- Szándékosan NINCS update/delete policy hitelesített usernek -- a `deleted_at` mezőt
-- KIZÁRÓLAG a cron végpont admin/service-role kliense állítja be, ugyanaz a defense-in-
-- depth elv, mint a `qr_uploads`-nál.

-- -----------------------------------------------------------------------------
-- 2) remove_general_photo_url -- SECURITY DEFINER segédfüggvény array_remove-hoz
-- -----------------------------------------------------------------------------
create or replace function public.remove_general_photo_url(p_inspection_id uuid, p_url text)
returns void
language sql
security definer
set search_path = 'public'
as $$
  update public.inspections
  set general_photos = array_remove(general_photos, p_url)
  where id = p_inspection_id;
$$;

comment on function public.remove_general_photo_url(uuid, text) is
  'Egyetlen URL eltávolítása az inspections.general_photos tömbből -- KIZÁRÓLAG a '
  'cleanup-expired-videos Cron végpont hívja (service-role), miután a hozzá tartozó '
  'videó Storage-objektumát már ténylegesen törölte. A Supabase JS .update() nem tud '
  'SQL-kifejezést (array_remove) küldeni oszlopértékként, ezért szükséges ez a RPC.';

-- FONTOS: Postgres alapból PUBLIC-nak (tehát közvetve anon/authenticated-nek is) EXECUTE
-- jogot ad egy ÚJONNAN létrehozott függvényre -- ezt EXPLICIT vissza kell vonni, különben
-- a `get_advisors(type: "security")` "Public Can Execute SECURITY DEFINER Function" WARN-t
-- adna (élesben ellenőrizve, 2026-08-21: a hiányzó REVOKE után TÉNYLEG megjelent a
-- figyelmeztetés, ez a lenti 3 sor a javítás), ÉS bármely bejelentkezett (sőt anonim)
-- felhasználó tetszőleges inspection_id + URL párossal törölhetne egy fotó-hivatkozást
-- BÁRKI vizsgálatából (a SECURITY DEFINER miatt az RLS-t is megkerülné).
revoke all on function public.remove_general_photo_url(uuid, text) from public;
revoke all on function public.remove_general_photo_url(uuid, text) from anon;
revoke all on function public.remove_general_photo_url(uuid, text) from authenticated;
grant execute on function public.remove_general_photo_url(uuid, text) to service_role;
