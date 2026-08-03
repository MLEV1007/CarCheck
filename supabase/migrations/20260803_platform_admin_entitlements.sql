-- =============================================================================
-- Platform Admin szerepkör + Csapatkezelés-entitlement (2026-08-03)
-- =============================================================================
-- A felhasználó (a CarCheck SaaS ÜZEMELTETŐJE, nem egy autóvizsgáló cég) mostantól
-- szeretné SAJÁT MAGA eldönteni, melyik ÜGYFÉL (szervezet) kaphat Menedzser-szintű
-- csapatkezelést (csapattag meghívása/kezelése) -- ez egy ÚJ, a szervezetek FÖLÖTTI
-- szerepkör ("Platform Admin"), teljesen elkülönítve a szervezeten belüli
-- Manager/Inspector szerepkörtől (lásd `20260803_organizations_rbac.sql`).
--
-- 1) `platform_admins` tábla -- explicit allow-list, KIZÁRÓLAG SQL-en keresztül
--    (nem az alkalmazásból) bővíthető, hogy egy alkalmazás-szintű hiba se tudjon
--    valakit önmagát platform adminná léptetni.
-- 2) `is_platform_admin()` SECURITY DEFINER helper.
-- 3) `organizations.team_management_enabled` -- alapból `false` (a Platform Admin
--    engedélyezi ügyfelenként), a JELENLEG MEGLÉVŐ szervezetek `true`-ra
--    backfillelve (nincs regresszió a már működő fiókoknál).
-- 4) RLS bővítés: Platform Admin lássa/módosíthassa AZ ÖSSZES szervezetet
--    (`/admin` felület), lássa az összes profilt (Menedzser email/tagszám az
--    admin listához).
-- 5) `handle_new_user()` trigger frissítve: a meghívó-linkes csatlakozás
--    (`invite_org_id`) csak akkor honorálja a MEGLÉVŐ szervezetet, ha annak
--    `team_management_enabled = true` -- egyébként (mintha a link érvénytelen
--    lenne) a user önálló, új szervezetet kap.
-- 6) Seed: a jelenlegi `manyilevente@gmail.com` fiók platform adminná téve.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) platform_admins
-- -----------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.platform_admins is
  'A CarCheck SaaS ÜZEMELTETŐI (nem egy autóvizsgáló cég Menedzsere!) -- explicit '
  'allow-list, kizárólag SQL-en/Supabase Dashboardon keresztül bővíthető. Nincs '
  'insert/update/delete RLS policy szándékosan -- az alkalmazásból SENKI nem tudja '
  'magát vagy mást platform adminná tenni.';

alter table public.platform_admins enable row level security;

-- Bárki lekérdezheti, hogy Ő MAGA platform admin-e (a `/admin` route guard-hoz) --
-- mások sorát nem láthatja.
create policy platform_admins_select_own
  on public.platform_admins for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = 'public'
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- 2) organizations.team_management_enabled
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column if not exists team_management_enabled boolean not null default false;

-- A JELENLEG MEGLÉVŐ szervezetek (a migráció előtt regisztrált ügyfelek) megtartják
-- a már működő csapatkezelést -- csak az EZUTÁN regisztrálók indulnak `false`-ról,
-- amíg a Platform Admin explicit engedélyezi őket.
update public.organizations set team_management_enabled = true;

comment on column public.organizations.team_management_enabled is
  'A CarCheck ÜZEMELTETŐJE (platform_admins) engedélyezi ügyfelenként -- ha false, a '
  'szervezet Menedzsere a Csapatkezelés fület zárolt állapotban látja, és a '
  'handle_new_user() trigger sem honorálja az ehhez a szervezethez szóló meghívó-linket.';

-- Platform Admin lássa/módosíthassa AZ ÖSSZES szervezetet (a saját szervezetét látó
-- `organizations_select_own_org` policy VÁLTOZATLAN marad, ez csak kiegészíti).
create policy organizations_select_platform_admin
  on public.organizations for select
  to authenticated
  using (public.is_platform_admin());

create policy organizations_update_platform_admin
  on public.organizations for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Platform Admin lássa az összes profilt (Menedzser email/csapat-létszám az `/admin`
-- listához) -- a meglévő `profiles_select_own`/`profiles_select_org_manager` policy-k
-- VÁLTOZATLANOK maradnak, ez csak kiegészíti.
create policy profiles_select_platform_admin
  on public.profiles for select
  to authenticated
  using (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 3) handle_new_user() trigger -- a meghívó csak engedélyezett szervezetnél honorálva
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
  v_org_id uuid;
  v_role text;
begin
  begin
    v_invite_org_id := nullif(new.raw_user_meta_data ->> 'invite_org_id', '')::uuid;
  exception when others then
    v_invite_org_id := null;
  end;

  if v_invite_org_id is not null then
    select team_management_enabled into v_invite_org_enabled
    from public.organizations
    where id = v_invite_org_id;
  end if;

  -- A meghívó csak akkor honorálva, ha a szervezet LÉTEZIK ÉS a Platform Admin
  -- engedélyezte neki a csapatkezelést -- egyébként (mintha a link érvénytelen
  -- lenne) a user önálló, új szervezet Menedzsere lesz.
  if v_invite_org_id is not null and v_invite_org_enabled is true then
    v_org_id := v_invite_org_id;
    v_role := 'inspector';
  else
    insert into public.organizations (name)
    values (coalesce(new.email, 'Új szervezet'))
    returning id into v_org_id;
    v_role := 'manager';
  end if;

  insert into public.profiles (id, email, organization_id, role)
  values (new.id, new.email, v_org_id, v_role);

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Seed -- a jelenlegi manyilevente@gmail.com fiók platform adminná téve
-- -----------------------------------------------------------------------------
insert into public.platform_admins (user_id)
select id from auth.users where email = 'manyilevente@gmail.com'
on conflict (user_id) do nothing;
