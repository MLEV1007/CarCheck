-- =============================================================================
-- Meghívás-attribúció + öröklött céges branding az Átvizsgálóknak (2026-08-14)
-- =============================================================================
-- A felhasználó explicit kérésére: (1) ha egy Menedzser meghív valakit, a meghívott
-- Átvizsgáló Beállítások oldalán is jelenjen meg a cég neve/logója/adatai -- de NE
-- tudja módosítani őket (a `SettingsForm.tsx` innentől "zárolt" állapotban, piros
-- tiltás-ikonnal jelzi ezt), (2) a Platform Admin (`/admin`) felületen egyértelműen
-- látszódjon, MELYIK Menedzser hívott meg KIT.
--
-- 1) `profiles.invited_by` -- az a Menedzser (auth.users.id), aki a meghívó linket
--    generálta (lásd `TeamManagement.tsx` "Csapattag meghívása" modalja) -- KIZÁRÓLAG
--    meghívó-linkes csatlakozásnál (role = 'inspector') kap értéket, "sima"
--    regisztrációnál mindig NULL.
-- 2) `handle_new_user()` trigger bővítése: a `raw_user_meta_data ->> 'invited_by'`
--    mezőt olvassa ki (ugyanaz a minta, mint a meglévő `invite_org_id`-nél) -- ÉS
--    szerver-oldalon ellenőrzi, hogy a hivatkozott user TÉNYLEG a célszervezet
--    Menedzsere-e, mielőtt elmentené (a mező kliens-oldalról, a regisztrációs URL
--    query paraméteréből érkezik, tehát tetszőlegesen módosítható -- ez a védekező
--    ellenőrzés zárja ki, hogy valaki hamis "meghívó" adatot írjon be magának).
-- 3) `get_organization_branding()` SECURITY DEFINER RPC -- egy Átvizsgáló (aki NEM
--    Menedzser, tehát a meglévő `profiles_select_org_manager` policy rá nem
--    vonatkozik) ezen keresztül olvashatja ki a SAJÁT szervezete Menedzserének
--    céges adatait (name/telefon/email/logó/szín) a Beállítások oldal
--    megjelenítéséhez -- ugyanaz a bevált SECURITY DEFINER minta, mint a
--    `current_user_organization_id()`-nél (lásd `20260803_organizations_rbac.sql`).
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-
-- követés célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével
-- lett közvetlenül az éles projektre (`nsejmkcwvksbwxscvrvb`) alkalmazva.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) profiles.invited_by
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists invited_by uuid references auth.users(id) on delete set null;

comment on column public.profiles.invited_by is
  'Az a Menedzser (auth.users.id), aki ezt az Átvizsgálót meghívta -- KIZÁRÓLAG '
  'meghívó-linkes csatlakozásnál (role = ''inspector'') van értéke, "sima" '
  'regisztrációnál (self-service Menedzser) mindig NULL. Lásd handle_new_user().';

create index if not exists profiles_invited_by_idx on public.profiles (invited_by);

-- -----------------------------------------------------------------------------
-- 2) handle_new_user() -- invited_by kiolvasása + validálása
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_invite_org_id uuid;
  v_invite_org_enabled boolean;
  v_invited_by uuid;
  v_org_id uuid;
  v_role text;
begin
  begin
    v_invite_org_id := nullif(new.raw_user_meta_data ->> 'invite_org_id', '')::uuid;
  exception when others then
    v_invite_org_id := null;
  end;

  begin
    v_invited_by := nullif(new.raw_user_meta_data ->> 'invited_by', '')::uuid;
  exception when others then
    v_invited_by := null;
  end;

  if v_invite_org_id is not null then
    select team_management_enabled into v_invite_org_enabled
    from public.organizations
    where id = v_invite_org_id;
  end if;

  if v_invite_org_id is not null and v_invite_org_enabled is true then
    v_org_id := v_invite_org_id;
    v_role := 'inspector';
  else
    insert into public.organizations (name)
    values (coalesce(new.email, 'Új szervezet'))
    returning id into v_org_id;
    v_role := 'manager';
    -- "sima" regisztrációnál az invited_by mezőnek nincs értelme -- akkor is
    -- nullázzuk, ha valamiért mégis érkezett (védekező, lásd lent).
    v_invited_by := null;
  end if;

  -- Az invited_by-t CSAK akkor mentjük, ha a hivatkozott user TÉNYLEG a
  -- célszervezet Menedzsere -- a mező kliens-oldalról (URL query paraméterből)
  -- érkezik, tehát tetszőlegesen módosítható; ez zárja ki, hogy valaki hamis
  -- "meghívó" adatot állítson be magának.
  if v_invited_by is not null and not exists (
    select 1 from public.profiles
    where id = v_invited_by
      and organization_id = v_org_id
      and role = 'manager'
  ) then
    v_invited_by := null;
  end if;

  insert into public.profiles (id, email, organization_id, role, invited_by)
  values (new.id, new.email, v_org_id, v_role, v_invited_by);

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) get_organization_branding() -- öröklött céges adatok Átvizsgálóknak
-- -----------------------------------------------------------------------------
create or replace function public.get_organization_branding()
returns table (
  company_name text,
  phone text,
  email text,
  logo_url text,
  primary_color text
)
language sql
security definer
stable
set search_path = 'public'
as $$
  select p.company_name, p.phone, p.email, p.logo_url, p.primary_color
  from public.profiles p
  where p.organization_id = public.current_user_organization_id()
    and p.role = 'manager'
  order by p.created_at asc
  limit 1;
$$;

comment on function public.get_organization_branding() is
  'A hívó SAJÁT szervezete Menedzserének céges adatai (név/telefon/email/logó/szín) '
  '-- Átvizsgálóknak a Beállítások oldal ezt jeleníti meg (zárolt, nem szerkeszthető '
  'mezőkként), mert a profiles_select_org_manager RLS policy csak Menedzsernek '
  'engedi más profil olvasását. SECURITY DEFINER, ezért Átvizsgálóként is lefut.';

grant execute on function public.get_organization_branding() to authenticated;
