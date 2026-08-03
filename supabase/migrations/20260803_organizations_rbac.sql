-- =============================================================================
-- Szervezeti RBAC (Manager / Inspector), közös céges kreditkeret, testreszabható
-- riport-láthatóság
-- =============================================================================
-- 1) organizations tábla -- egy cég = egy szervezet, a Menedzser és az Átvizsgálók
--    közösen ehhez tartoznak.
-- 2) profiles bővítése: organization_id, role ('manager'|'inspector', alapértelmezett
--    'manager' -- az első regisztráló mindig saját szervezetet kap és Menedzser lesz),
--    can_view_all_reports (csak Átvizsgálóknál releváns, Menedzser kapcsolhatja).
--    + SECURITY DEFINER helper függvények (current_user_organization_id/role/
--    can_view_all_reports) -- ugyanaz a bevált minta, mint a meglévő
--    `get_public_report` RPC-nél, hogy elkerüljük a rekurzív RLS-t.
-- 3) inspections bővítése: organization_id, created_by -- a riport-láthatósági
--    szabályok (Menedzser: teljes cég, Átvizsgáló: saját VAGY teljes cég a
--    can_view_all_reports alapján) ezekre épülnek.
-- 4) paint_measurements/defects SELECT policy kiterjesztése ugyanerre a láthatóságra.
-- 5) user_credits ÁTALAKÍTÁSA felhasználónkéntiről szervezet-szintűre -- a krediteket
--    mostantól a szervezet (gyakorlatban a Menedzser) tartja nyilván, az Átvizsgálók
--    AI-hívásai UGYANEBBŐL a közös keretből vonnak le.
-- 6) usage_logs bővítése organization_id-vel, hogy a Menedzser a teljes csapat
--    AI-használatát láthassa (`user_id` marad a tényleges "ki hívta" mező).
-- 7) `deduct_credits` RPC átalakítása szervezet-szintű, atomikus levonásra.
-- 8) `handle_new_user()` trigger frissítése: normál regisztráció -> új szervezet +
--    'manager' szerepkör; meghívó linkkel érkező regisztráció (`raw_user_meta_data
--    ->> 'invite_org_id'`) -> csatlakozás a meglévő szervezethez 'inspector'
--    szerepkörrel.
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-
-- követés célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével
-- lett közvetlenül az éles projektre alkalmazva (nincs helyi Supabase CLI/
-- `supabase db push` munkafolyamat), ez a fájl UGYANEZT az SQL-t tartalmazza.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) organizations
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name varchar not null,
  created_at timestamptz not null default now()
);

comment on table public.organizations is
  'Egy autóvizsgáló cég -- a Menedzser és az Átvizsgálók közösen ehhez a szervezethez '
  'tartoznak (profiles.organization_id / inspections.organization_id / '
  'user_credits.organization_id).';

alter table public.organizations enable row level security;

-- -----------------------------------------------------------------------------
-- 2) profiles bővítése -- organization_id, role, can_view_all_reports
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists role text not null default 'manager',
  add column if not exists can_view_all_reports boolean not null default false;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('manager', 'inspector'));

-- Backfill: minden JELENLEG LÉTEZŐ profilhoz saját, önálló szervezet jön létre (ez
-- pontosan megfelel a jelenlegi, egymástól független "1 user = 1 cég" állapotnak) --
-- mindenki a saját szervezetének Menedzsere marad, nem változik a jogosultsága.
do $$
declare
  v_profile record;
  v_org_id uuid;
begin
  for v_profile in select id, company_name, email from public.profiles where organization_id is null loop
    insert into public.organizations (name)
    values (coalesce(v_profile.company_name, v_profile.email, 'Új szervezet'))
    returning id into v_org_id;

    update public.profiles
    set organization_id = v_org_id, role = 'manager'
    where id = v_profile.id;
  end loop;
end $$;

alter table public.profiles
  alter column organization_id set not null;

create index if not exists profiles_organization_id_idx on public.profiles (organization_id);

-- SECURITY DEFINER helper függvények -- a lentebbi (organizations/inspections/
-- paint_measurements/defects/user_credits/usage_logs) policy-k mind ezekre épülnek.
-- Definer módban futnak (RLS-t nem duplikálva, rekurzió nélkül), ugyanaz az elv, mint
-- a meglévő `get_public_report` RPC-nél.
create or replace function public.current_user_organization_id()
returns uuid
language sql
security definer
stable
set search_path = 'public'
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = 'public'
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_can_view_all_reports()
returns boolean
language sql
security definer
stable
set search_path = 'public'
as $$
  select coalesce(can_view_all_reports, false) from public.profiles where id = auth.uid();
$$;

-- Bármely bejelentkezett tag lekérdezheti a SAJÁT szervezete sorát (pl. cégnév
-- megjelenítéséhez a Csapatkezelés UI-n) -- a tényleges multi-tenant izolációt az
-- inspections/profiles/user_credits/usage_logs tábláknál lévő organization_id-alapú
-- policy-k adják, ez csak egy "lásd a sajátodat" kényelmi szabály.
create policy organizations_select_own_org
  on public.organizations for select
  to authenticated
  using (id = public.current_user_organization_id());

-- Manager lássa/kezelhesse a SAJÁT szervezetéhez tartozó összes profilt (csapattagok
-- listája, jogosultság-kapcsoló) -- a meglévő `profiles_select_own`/`profiles_update_own`
-- policy-k VÁLTOZATLANOK maradnak (több PERMISSIVE policy egy táblán/parancson OR
-- kapcsolatban van Postgres RLS-ben), ezek csak KIEGÉSZÍTIK azokat.
create policy profiles_select_org_manager
  on public.profiles for select
  to authenticated
  using (
    public.current_user_role() = 'manager'
    and organization_id = public.current_user_organization_id()
  );

create policy profiles_update_org_manager
  on public.profiles for update
  to authenticated
  using (
    public.current_user_role() = 'manager'
    and organization_id = public.current_user_organization_id()
  )
  with check (
    organization_id = public.current_user_organization_id()
  );

-- -----------------------------------------------------------------------------
-- 3) inspections bővítése -- organization_id, created_by
-- -----------------------------------------------------------------------------
alter table public.inspections
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists created_by uuid references auth.users(id);

update public.inspections i
set organization_id = p.organization_id,
    created_by = i.user_id
from public.profiles p
where p.id = i.user_id
  and (i.organization_id is null or i.created_by is null);

alter table public.inspections
  alter column organization_id set not null,
  alter column created_by set not null;

create index if not exists inspections_organization_id_idx on public.inspections (organization_id);
create index if not exists inspections_created_by_idx on public.inspections (created_by);

-- A régi "_own" (kizárólag `auth.uid() = user_id`) policy-k lecserélése szervezet- és
-- szerepkör-tudatos szabályokra (PROJEKT_INSTRUKCIOK.md "Riportok Lekérdezési Logikája"):
--   * Manager: az EGÉSZ szervezet vizsgálatait látja.
--   * Inspector, can_view_all_reports = true: az EGÉSZ szervezet vizsgálatait látja.
--   * Inspector, can_view_all_reports = false: KIZÁRÓLAG a saját (created_by = auth.uid())
--     vizsgálatait látja.
-- Írás (insert/update/delete): a létrehozó MINDIG kezelheti a sajátját, a Menedzser
-- emellett a teljes szervezet vizsgálatait is (adminisztrátori jogkör).
drop policy if exists inspections_select_own on public.inspections;
drop policy if exists inspections_insert_own on public.inspections;
drop policy if exists inspections_update_own on public.inspections;
drop policy if exists inspections_delete_own on public.inspections;

create policy inspections_select_org
  on public.inspections for select
  to authenticated
  using (
    created_by = auth.uid()
    or (
      organization_id = public.current_user_organization_id()
      and (
        public.current_user_role() = 'manager'
        or public.current_user_can_view_all_reports()
      )
    )
  );

create policy inspections_insert_org
  on public.inspections for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and organization_id = public.current_user_organization_id()
  );

create policy inspections_update_org
  on public.inspections for update
  to authenticated
  using (
    created_by = auth.uid()
    or (organization_id = public.current_user_organization_id() and public.current_user_role() = 'manager')
  )
  with check (
    created_by = auth.uid()
    or (organization_id = public.current_user_organization_id() and public.current_user_role() = 'manager')
  );

create policy inspections_delete_org
  on public.inspections for delete
  to authenticated
  using (
    created_by = auth.uid()
    or (organization_id = public.current_user_organization_id() and public.current_user_role() = 'manager')
  );

-- -----------------------------------------------------------------------------
-- 4) paint_measurements / defects -- SELECT kiterjesztése az inspections-szal
--    megegyező láthatóságra (a Wizard/riport ezek nélkül nem tudná megjeleníteni egy
--    csapattárs vizsgálatának részleteit). Az insert/update/delete policy-k
--    VÁLTOZATLANOK (kizárólag a sort ténylegesen létrehozó user_id kezelheti őket) --
--    a csapaton belüli közös SZERKESZTÉS nem célja ennek a lépésnek, csak a LÁTHATÓSÁG.
-- -----------------------------------------------------------------------------
drop policy if exists paint_measurements_select_own on public.paint_measurements;

create policy paint_measurements_select_org
  on public.paint_measurements for select
  to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = paint_measurements.inspection_id
        and (
          i.created_by = auth.uid()
          or (
            i.organization_id = public.current_user_organization_id()
            and (public.current_user_role() = 'manager' or public.current_user_can_view_all_reports())
          )
        )
    )
  );

drop policy if exists defects_select_own on public.defects;

create policy defects_select_org
  on public.defects for select
  to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = defects.inspection_id
        and (
          i.created_by = auth.uid()
          or (
            i.organization_id = public.current_user_organization_id()
            and (public.current_user_role() = 'manager' or public.current_user_can_view_all_reports())
          )
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 5) user_credits ÁTALAKÍTÁSA szervezet-szintűre (közös céges kreditkeret)
-- -----------------------------------------------------------------------------
alter table public.user_credits
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

update public.user_credits uc
set organization_id = p.organization_id
from public.profiles p
where p.id = uc.user_id
  and uc.organization_id is null;

alter table public.user_credits
  alter column organization_id set not null;

-- A régi "_own" (user_id-alapú) policy-k a `user_id` oszlopra hivatkoznak -- ezeket
-- MÁR A COLUMN DROP ELŐTT el kell távolítani, különben a Postgres "depends on column"
-- hibával elutasítja az oszlop törlését.
drop policy if exists user_credits_select_own on public.user_credits;
drop policy if exists user_credits_insert_own on public.user_credits;
drop policy if exists user_credits_update_own on public.user_credits;

-- A korábbi, felhasználónkénti egyediséget biztosító `user_id` oszlop innentől
-- értelmét veszti (a kredit-egyenleg mostantól a szervezethez, nem az egyéni
-- felhasználóhoz tartozik) -- eltávolítjuk, az `organization_id` lesz az egyedi kulcs.
alter table public.user_credits
  drop column if exists user_id;

alter table public.user_credits
  add constraint user_credits_organization_id_key unique (organization_id);

-- Bármely szervezeti tag (Menedzser VAGY Átvizsgáló) olvashatja/módosíthatja a SAJÁT
-- szervezete közös kredit-sorát -- ez szándékos: az Átvizsgáló AI-hívása a szerveren a
-- hívó user saját RLS-jogosultságával fut (lásd lib/credits.ts JSDoc-ját), tehát a
-- levonáshoz neki magának kell UPDATE-jogosultsággal rendelkeznie a szervezet közös
-- során -- a multi-tenant izoláció változatlanul garantált, mert a szűrés mindig a
-- SAJÁT `organization_id`-ra korlátozódik, más szervezet sorát senki nem érheti el.
create policy user_credits_select_org
  on public.user_credits for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy user_credits_insert_org
  on public.user_credits for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

create policy user_credits_update_org
  on public.user_credits for update
  to authenticated
  using (organization_id = public.current_user_organization_id())
  with check (organization_id = public.current_user_organization_id());

-- -----------------------------------------------------------------------------
-- 6) usage_logs bővítése organization_id-vel (Menedzser lássa a TELJES csapat
--    AI-használati auditját, ne csak a sajátját) -- `user_id` marad a tényleges
--    "ki hívta" mező.
-- -----------------------------------------------------------------------------
alter table public.usage_logs
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

update public.usage_logs ul
set organization_id = p.organization_id
from public.profiles p
where p.id = ul.user_id
  and ul.organization_id is null;

alter table public.usage_logs
  alter column organization_id set not null;

create index if not exists usage_logs_organization_id_idx on public.usage_logs (organization_id, created_at desc);

drop policy if exists usage_logs_select_own on public.usage_logs;
drop policy if exists usage_logs_insert_own on public.usage_logs;

create policy usage_logs_select_org
  on public.usage_logs for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy usage_logs_insert_org
  on public.usage_logs for insert
  to authenticated
  with check (user_id = auth.uid() and organization_id = public.current_user_organization_id());

-- -----------------------------------------------------------------------------
-- 7) deduct_credits RPC -- szervezet-szintű, atomikus kredit-levonás (a korábbi,
--    felhasználónkénti verzió lecserélve)
-- -----------------------------------------------------------------------------
drop function if exists public.deduct_credits(uuid, text, integer);

create or replace function public.deduct_credits(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_feature_name text,
  p_cost integer default 1
)
returns table (
  monthly_credits_remaining integer,
  purchased_credits_remaining integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_monthly integer;
  v_purchased integer;
  v_from_monthly integer;
  v_from_purchased integer;
begin
  if p_cost is null or p_cost <= 0 then
    raise exception 'INVALID_COST: a levonandó kredit mennyiségnek pozitívnak kell lennie'
      using errcode = 'P0001';
  end if;

  select uc.monthly_credits_remaining, uc.purchased_credits_remaining
    into v_monthly, v_purchased
  from public.user_credits uc
  where uc.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'NO_CREDIT_RECORD: nincs kredit-rekord a szervezethez (%)', p_organization_id
      using errcode = 'P0001';
  end if;

  if (v_monthly + v_purchased) < p_cost then
    raise exception 'INSUFFICIENT_CREDITS: nincs elég kredit (szükséges: %, elérhető: %)',
      p_cost, (v_monthly + v_purchased)
      using errcode = 'P0001';
  end if;

  v_from_monthly := least(v_monthly, p_cost);
  v_from_purchased := p_cost - v_from_monthly;

  update public.user_credits uc
  set monthly_credits_remaining = uc.monthly_credits_remaining - v_from_monthly,
      purchased_credits_remaining = uc.purchased_credits_remaining - v_from_purchased,
      updated_at = now()
  where uc.organization_id = p_organization_id;

  insert into public.usage_logs (user_id, organization_id, feature_name, credits_deducted)
  values (p_actor_user_id, p_organization_id, p_feature_name, p_cost);

  return query
    select uc.monthly_credits_remaining, uc.purchased_credits_remaining
    from public.user_credits uc
    where uc.organization_id = p_organization_id;
end;
$$;

grant execute on function public.deduct_credits(uuid, uuid, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 8) handle_new_user() trigger frissítése -- új szervezet a "sima" regisztrációnál
--    (Menedzser), csatlakozás meglévő szervezethez meghívó-linkkel (Átvizsgáló)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_invite_org_id uuid;
  v_org_id uuid;
  v_role text;
begin
  -- A regisztrációs/meghívó link (`/register?invite=<organization_id>`) a
  -- `signInWithOtp` `options.data.invite_org_id` mezőjén keresztül adja át a
  -- szervezet azonosítóját -- lásd `RegisterForm.tsx`/`MagicLinkForm.tsx`. Ha ez
  -- hiányzik VAGY érvénytelen (törölt szervezet), a user önálló, új szervezet
  -- Menedzsere lesz -- ez a "sima" (nem meghívott) regisztráció útja.
  begin
    v_invite_org_id := nullif(new.raw_user_meta_data ->> 'invite_org_id', '')::uuid;
  exception when others then
    v_invite_org_id := null;
  end;

  if v_invite_org_id is not null and exists (select 1 from public.organizations where id = v_invite_org_id) then
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
