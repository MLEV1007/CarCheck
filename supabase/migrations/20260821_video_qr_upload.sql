-- =============================================================================
-- Videó-tömörítés csomag-jogosultság + QR-kódos telefonos média-feltöltés
-- =============================================================================
-- Lásd PLAN_video_qr_upload.md a teljes indoklásért. Ez a migráció:
--   1) organization_allows_video_upload(uuid) / current_user_can_upload_video() --
--      SECURITY DEFINER segédfüggvények a videó-jogosultság (user_credits.plan_tier
--      IN ('pro','business')) eldöntéséhez.
--   2) storage.objects INSERT/UPDATE policy bővítése -- videó MIME/kiterjesztésű
--      objektum csak jogosult szervezetnél írható közvetlenül (RLS második
--      védelmi vonal, lásd a terv 6.4 pontját -- a signed-URL-es utat ez NEM
--      érinti, mert az admin/service-role kliens megkerüli az RLS-t, azt az
--      alkalmazás-kód gate-eli a jel kiadása előtt).
--   3) inspection-media bucket file_size_limit = 50 MB (korábban NULL volt).
--   4) qr_upload_sessions / qr_uploads táblák + RLS + resolve_qr_upload_session RPC
--      -- a QR-kódos telefonos feltöltéshez, ugyanaz a "nincs FK az inspections.id-ra"
--      minta, mint az inspection_ai_credit_usage-nál (a wizard inspectionId-ja a
--      wizard megnyitásakor generálódik, mielőtt az inspections sor létrejönne).
--   5) qr_uploads felvétele a supabase_realtime publikációba (a desktop wizard
--      Realtime-on keresztül figyeli az új feltöltéseket).
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-
-- követés célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével lett
-- közvetlenül az éles projektre (`nsejmkcwvksbwxscvrvb`) alkalmazva.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Videó-jogosultság segédfüggvények
-- -----------------------------------------------------------------------------
create or replace function public.organization_allows_video_upload(p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = 'public'
as $$
  select coalesce(
    (select uc.plan_tier in ('pro', 'business')
     from public.user_credits uc
     where uc.organization_id = p_organization_id),
    false
  );
$$;

comment on function public.organization_allows_video_upload(uuid) is
  'Igaz, ha a megadott szervezet user_credits.plan_tier-je pro/business -- KIZÁRÓLAG ez a '
  'mező (NEM a profiles.plan_tier, ami elavult/nem szinkronizált) dönti el a videó-csatolás '
  'jogosultságát, lásd PLAN_video_qr_upload.md 6.1 pontját.';

grant execute on function public.organization_allows_video_upload(uuid) to authenticated, anon, service_role;

create or replace function public.current_user_can_upload_video()
returns boolean
language sql
security definer
stable
set search_path = 'public'
as $$
  select public.organization_allows_video_upload(public.current_user_organization_id());
$$;

comment on function public.current_user_can_upload_video() is
  'A HÍVÓ (auth.uid()) szervezetének videó-jogosultsága -- storage.objects RLS policy-kban '
  'használva, lásd lent.';

grant execute on function public.current_user_can_upload_video() to authenticated;

-- -----------------------------------------------------------------------------
-- 2) storage.objects -- videó-gate a KÖZVETLEN, hitelesített feltöltési útra
-- -----------------------------------------------------------------------------
-- Ez a policy-pár a status.md 2026-07-31-i hibajegyben dokumentált, élesen már
-- létező (nem migrációban, hanem közvetlenül a Dashboard/MCP-vel alkalmazott)
-- policy-kat bővíti -- a path-tulajdonlási feltétel (első mappaszegmens = auth.uid())
-- VÁLTOZATLAN, csak egy ÚJ, videó-kiterjesztésre vonatkozó feltétel került hozzá.
drop policy if exists inspection_media_authenticated_upload on storage.objects;

create policy inspection_media_authenticated_upload
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'inspection-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      name !~* '\.(mp4|mov|webm|m4v|avi)$'
      or public.current_user_can_upload_video()
    )
  );

drop policy if exists inspection_media_authenticated_update on storage.objects;

create policy inspection_media_authenticated_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'inspection-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'inspection-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      name !~* '\.(mp4|mov|webm|m4v|avi)$'
      or public.current_user_can_upload_video()
    )
  );

-- A SELECT/DELETE policy-k változatlanok maradnak (meglévő videó olvasása/törlése nem
-- új-hozzáférés-adási művelet, nem kell hozzá a videó-gate).

-- -----------------------------------------------------------------------------
-- 3) inspection-media bucket -- file_size_limit védőháló (korábban NULL)
-- -----------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 52428800 -- 50 MB, lásd PLAN_video_qr_upload.md 4.1 pontját
where id = 'inspection-media';

-- -----------------------------------------------------------------------------
-- 4) QR-kódos telefonos média-feltöltés -- session + feltöltött elemek táblái
-- -----------------------------------------------------------------------------
create table public.qr_upload_sessions (
  token uuid primary key default gen_random_uuid(),
  -- NINCS FK az inspections.id-ra -- a wizard inspectionId-ja (crypto.randomUUID())
  -- a wizard megnyitásakor generálódik, MIELŐTT az inspections sor létrejönne (ugyanaz
  -- az elv, mint inspection_ai_credit_usage-nál, lásd 20260806_inspection_ai_credit_usage.sql).
  inspection_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  -- 'general' VAGY 'defect:<clientId>' -- a wizard SAJÁT, kliens-oldali állapot-kulcsa,
  -- hogy a desktop tudja, a beérkező elemet hova illessze. A szerver ezt átlátszóan
  -- tárolja/adja vissza, nem értelmezi.
  target text not null,
  expires_at timestamptz not null,
  -- Az ELSŐ sikeres resolve_qr_upload_session() hívás állítja be -- lásd a "claim" logikát
  -- lent. A claim_secret-et csak AZ a hívás kapja meg válaszban, amelyik beállítja --
  -- minden későbbi hívásnak (akár a telefon saját további kéréseinek, akár egy MÁSIK
  -- eszköznek) ezt kell felmutatnia, különben a session "már lefoglalt"-ként elutasítja.
  claimed_at timestamptz,
  claim_secret uuid,
  created_at timestamptz not null default now()
);

comment on table public.qr_upload_sessions is
  'Egy "Feltöltés telefonról" kattintás = egy sor. A desktop (hitelesített szakértő) hozza '
  'létre, a telefon a resolve_qr_upload_session(token, claim_secret) RPC-n keresztül, '
  'auth NÉLKÜL oldja fel -- lásd PLAN_video_qr_upload.md 5. pontját.';

alter table public.qr_upload_sessions enable row level security;

create index qr_upload_sessions_organization_id_idx
  on public.qr_upload_sessions (organization_id);

-- Csak a LÉTREHOZÓ szervezet tagjai láthatják/hozhatják létre a saját session-jeiket --
-- a telefon (anon) SOSE olvassa/írja közvetlenül ezt a táblát, kizárólag a
-- resolve_qr_upload_session SECURITY DEFINER RPC-n keresztül fér hozzá.
create policy qr_upload_sessions_select_org
  on public.qr_upload_sessions for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy qr_upload_sessions_insert_org
  on public.qr_upload_sessions for insert
  to authenticated
  with check (
    organization_id = public.current_user_organization_id()
    and created_by = auth.uid()
  );

-- Szándékosan NINCS update/delete policy a klienseknek -- a claim-mezőket kizárólag a
-- SECURITY DEFINER RPC módosítja, a session a expires_at lejártával egyszerűen érvénytelen
-- lesz, nincs explicit törlés/módosítás a v1 hatókörben.

create table public.qr_uploads (
  id uuid primary key default gen_random_uuid(),
  -- A session-re MOST már biztonságosan FK-zható (ellentétben az inspection_id-vel) --
  -- egy feltöltés SOSE előzheti meg a saját session-ének létrejöttét, a session mindig a
  -- desktopon jön létre ELSŐKÉNT.
  session_token uuid not null references public.qr_upload_sessions (token) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('photo', 'video')),
  created_at timestamptz not null default now()
);

comment on table public.qr_uploads is
  'Egy sikeresen feltöltött telefonos médiaelem = egy sor -- KIZÁRÓLAG a '
  '/api/qr-upload/[token]/confirm szerver-route (service-role) írja, a tényleges Storage- '
  'feltöltés sikeres befejezése UTÁN. Ez triggereli a Realtime broadcastot a desktop '
  'wizard felé (lásd PLAN_video_qr_upload.md 5.4 pontját).';

alter table public.qr_uploads enable row level security;

create index qr_uploads_session_token_idx on public.qr_uploads (session_token);
create index qr_uploads_organization_id_idx on public.qr_uploads (organization_id, created_at desc);

-- SELECT policy KELL a Realtime-hoz is -- a postgres_changes broadcast a hallgató
-- hitelesített kliens RLS-jogosultságán keresztül szűrődik.
create policy qr_uploads_select_org
  on public.qr_uploads for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

-- Szándékosan NINCS insert/update/delete policy a klienseknek (sem authenticated, sem
-- anon) -- kizárólag a service-role (admin) kliens írhat, ugyanaz a defense-in-depth elv,
-- mint a usage_logs-nál.

alter publication supabase_realtime add table public.qr_uploads;

-- -----------------------------------------------------------------------------
-- 5) resolve_qr_upload_session -- SECURITY DEFINER RPC, publikus (anon) híváshoz
-- -----------------------------------------------------------------------------
-- "Claim" logika (lásd PLAN_video_qr_upload.md 5.2 pontja, a felhasználóval egyeztetett
-- "session-szintű" értelmezés):
--   * ELSŐ hívás (claimed_at MÉG null) -- a hívó "lefoglalja" a sessiont, a függvény ÚJ
--     claim_secret-et generál, elmenti, ÉS visszaadja a hívónak (csak EZ az egy hívás
--     kapja meg -- a telefon-oldal ezt tárolja el, és minden további saját hívásnál
--     (média-URL kérés, megerősítés, session-lekérdezés frissítése) felmutatja).
--   * KÉSŐBBI hívás (claimed_at MÁR beállítva) -- a hívónak a p_claim_secret paraméterben
--     PONTOSAN azt a titkot kell visszaadnia, amit az első hívás kapott -- ha egyezik, a
--     session adatai visszaadódnak (secret újra NEM kerül visszaküldésre); ha nem egyezik
--     (vagy hiányzik -- pl. egy MÁSIK eszköz próbál csatlakozni ugyanazzal a linkkel), a
--     függvény üres eredményt ad, mintha a token érvénytelen lenne.
create or replace function public.resolve_qr_upload_session(
  p_token uuid,
  p_claim_secret uuid default null
)
returns table (
  inspection_id uuid,
  organization_id uuid,
  target text,
  video_allowed boolean,
  claim_secret uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_session public.qr_upload_sessions%rowtype;
  v_new_secret uuid;
begin
  select * into v_session
  from public.qr_upload_sessions s
  where s.token = p_token
  for update;

  if not found or v_session.expires_at <= now() then
    return; -- üres eredményhalmaz -- lejárt/nem létező token, a hívó erre 404/lejárt-üzenetet ad
  end if;

  if v_session.claimed_at is null then
    v_new_secret := gen_random_uuid();
    update public.qr_upload_sessions
      set claimed_at = now(), claim_secret = v_new_secret
      where token = p_token;
  else
    if p_claim_secret is null or p_claim_secret != v_session.claim_secret then
      return; -- egy MÁSIK eszköz próbál csatlakozni egy már lefoglalt sessionhöz -- elutasítva
    end if;
    v_new_secret := null; -- a hívó már ismeri, nem küldjük vissza újra
  end if;

  return query
    select
      v_session.inspection_id,
      v_session.organization_id,
      v_session.target,
      public.organization_allows_video_upload(v_session.organization_id),
      v_new_secret,
      v_session.expires_at;
end;
$$;

comment on function public.resolve_qr_upload_session(uuid, uuid) is
  'Publikus (anon-nak grantolt) belépési pont a QR-kódos telefonos feltöltéshez -- '
  'ugyanaz a SECURITY DEFINER minta, mint get_public_report()-nál. Lásd a fenti "Claim '
  'logika" kommentet és PLAN_video_qr_upload.md 5.2 pontját.';

grant execute on function public.resolve_qr_upload_session(uuid, uuid) to anon, authenticated;
