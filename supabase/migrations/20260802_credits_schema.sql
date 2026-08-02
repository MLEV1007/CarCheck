-- =============================================================================
-- Kredit- és előfizetés-kezelő architektúra (hibrid SaaS fizetési modell alapja)
-- =============================================================================
-- 1) profiles bővítése: csomag-szint (plan_tier) és Stripe azonosítók
-- 2) user_credits: felhasználónkénti kredit-egyenleg (havi keret + vásárolt)
-- 3) usage_logs: AI-funkció használati audit napló
-- 4) deduct_credits RPC: atomikus (sor-zárolással védett) kredit-levonás,
--    elsőbbséggel a lejáró havi keretből, majd a vásárolt kreditekből
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-
-- követés célját szolgálja -- a projektben eddig a séma a Supabase MCP
-- `apply_migration` eszközével lett közvetlenül az éles projektre alkalmazva
-- (nincs helyi Supabase CLI/`supabase db push` munkafolyamat), ez a fájl UGYANEZT
-- az SQL-t tartalmazza, ami ténylegesen alkalmazásra került.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) profiles bővítése
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists plan_tier text not null default 'free',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

alter table public.profiles
  add constraint profiles_plan_tier_check
  check (plan_tier in ('free', 'starter', 'pro', 'enterprise'));

-- -----------------------------------------------------------------------------
-- 2) user_credits
-- -----------------------------------------------------------------------------
create table public.user_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  monthly_credits_remaining integer not null default 0,
  purchased_credits_remaining integer not null default 0,
  credits_reset_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint user_credits_monthly_nonnegative check (monthly_credits_remaining >= 0),
  constraint user_credits_purchased_nonnegative check (purchased_credits_remaining >= 0)
);

comment on table public.user_credits is
  'Felhasználónkénti kredit-egyenleg -- havi (előfizetéssel járó, lejáró) és '
  'vásárolt (nem lejáró) kreditek külön nyilvántartva. 1 sor / felhasználó.';

alter table public.user_credits enable row level security;

-- Ugyanaz a "csak a saját sor" minta, mint a projekt többi táblájánál
-- (profiles/inspections/defects/paint_measurements) -- multi-tenant izoláció.
create policy user_credits_select_own
  on public.user_credits for select
  to authenticated
  using (auth.uid() = user_id);

create policy user_credits_insert_own
  on public.user_credits for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy user_credits_update_own
  on public.user_credits for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Szándékosan NINCS delete_own policy -- a sor a felhasználóval együtt
-- `on delete cascade`-del törlődik, önálló törlésre nincs szükség.

-- -----------------------------------------------------------------------------
-- 3) usage_logs (AI audit napló)
-- -----------------------------------------------------------------------------
create table public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_name text not null,
  credits_deducted integer not null default 1,
  created_at timestamptz not null default now()
);

comment on table public.usage_logs is
  'AI-funkció-használati audit napló -- minden kredit-levonás egy sort hoz létre. '
  'Szándékosan csak SELECT/INSERT policy van (immutable audit trail, nincs UPDATE/DELETE).';

alter table public.usage_logs enable row level security;

create policy usage_logs_select_own
  on public.usage_logs for select
  to authenticated
  using (auth.uid() = user_id);

create policy usage_logs_insert_own
  on public.usage_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

create index usage_logs_user_id_created_at_idx
  on public.usage_logs (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 4) deduct_credits RPC -- atomikus kredit-levonás
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER (nem DEFINER): a hívó felhasználó saját RLS-jogosultságával
-- fut, ugyanúgy, mint a projekt többi közvetlen tábla-írása -- a multi-tenant
-- izoláció így a függvényen belül is garantált (nem lehet más felhasználó
-- kreditjét módosítani, mert a SELECT/UPDATE/INSERT mind a fenti "_own"
-- policy-kön megy át). A `select ... for update` sor-zárolással véd a
-- párhuzamos kérések közötti race condition (dupla elköltés) ellen.
create or replace function public.deduct_credits(
  p_user_id uuid,
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
  where uc.user_id = p_user_id
  for update;

  if not found then
    raise exception 'NO_CREDIT_RECORD: nincs kredit-rekord a felhasználóhoz (%)', p_user_id
      using errcode = 'P0001';
  end if;

  if (v_monthly + v_purchased) < p_cost then
    raise exception 'INSUFFICIENT_CREDITS: nincs elég kredit (szükséges: %, elérhető: %)',
      p_cost, (v_monthly + v_purchased)
      using errcode = 'P0001';
  end if;

  -- Elsőbbség: először a lejáró havi keretből vonunk le, a maradékot
  -- (ha a havi keret nem elég) a nem lejáró vásárolt kreditekből.
  v_from_monthly := least(v_monthly, p_cost);
  v_from_purchased := p_cost - v_from_monthly;

  update public.user_credits uc
  set monthly_credits_remaining = uc.monthly_credits_remaining - v_from_monthly,
      purchased_credits_remaining = uc.purchased_credits_remaining - v_from_purchased,
      updated_at = now()
  where uc.user_id = p_user_id;

  insert into public.usage_logs (user_id, feature_name, credits_deducted)
  values (p_user_id, p_feature_name, p_cost);

  return query
    select uc.monthly_credits_remaining, uc.purchased_credits_remaining
    from public.user_credits uc
    where uc.user_id = p_user_id;
end;
$$;

grant execute on function public.deduct_credits(uuid, text, integer) to authenticated;
