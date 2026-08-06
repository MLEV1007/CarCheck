-- =============================================================================
-- Árazási struktúra bővítés: Growth/Business tier + vásárolható AI-kredit csomagok
-- =============================================================================
-- Felhasználói döntés alapján (sales-elemzés + Stripe-integrációval egyeztetve):
--   * Starter havi AI-kerete 3 -> 6-ra nő (20 vizsgálat/hó VÁLTOZATLAN).
--   * ÚJ Growth tier: 35 vizsgálat/hó, 14 AI-elemzés/hó.
--   * Pro AI-kerete 50 -> 25-re csökken (50 vizsgálat/hó VÁLTOZATLAN) -- a magasabb
--     vizsgálat-kerethez képest szándékosan kisebb AI-arány, hogy az AI-kredit csomag
--     vásárlása/a Business csomag valódi upsell-érv maradjon.
--   * ÚJ Business tier: gyakorlatban korlátlan vizsgálat (999999, nincs "unlimited"
--     sentinel az integer oszlopon, ez a gyakorlati megoldás), 100 AI-elemzés/hó --
--     EGYEDI ártárgyalás, NEM önkiszolgáló Stripe checkout tétel, csak backend/admin
--     SQL-lel állítható be egy ügyfélnek (lásd BillingTab.tsx "Kapcsolatfelvétel" CTA-ját).
--   * ÚJ, vásárolható AI-kredit csomagok (nem lejáró, `purchased_ai_remaining`-be
--     kerülnek): 5/15/40 db.
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-
-- követés célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével lett
-- közvetlenül az éles projektre (`nsejmkcwvksbwxscvrvb`) alkalmazva.
-- =============================================================================

alter table public.user_credits
  add column if not exists purchased_ai_remaining integer not null default 0;

alter table public.user_credits
  add constraint user_credits_purchased_ai_remaining_nonnegative check (purchased_ai_remaining >= 0);

comment on column public.user_credits.purchased_ai_remaining is
  'Vásárolt (nem lejáró) AI-kredit keret -- külön vásárolható csomagok (5/15/40 db) töltik '
  'fel, a havi (monthly_ai_remaining) keret elfogyása UTÁN vonódik le belőle (lásd '
  'consume_ai_quota RPC).';

alter table public.user_credits
  alter column monthly_ai_limit set default 6,
  alter column monthly_ai_remaining set default 6;

alter table public.user_credits
  drop constraint if exists user_credits_plan_tier_check;

alter table public.user_credits
  add constraint user_credits_plan_tier_check
  check (plan_tier in ('starter', 'pro', 'growth', 'business'));

create or replace function public.consume_ai_quota(
  p_organization_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_monthly integer;
  v_purchased integer;
begin
  select uc.monthly_ai_remaining, uc.purchased_ai_remaining
    into v_monthly, v_purchased
  from public.user_credits uc
  where uc.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'NO_QUOTA_RECORD: nincs kvóta-rekord a szervezethez (%)', p_organization_id
      using errcode = 'P0001';
  end if;

  if (v_monthly + v_purchased) < 1 then
    raise exception 'INSUFFICIENT_AI_QUOTA: nincs elérhető AI keret (elérhető: %)', (v_monthly + v_purchased)
      using errcode = 'P0001';
  end if;

  if v_monthly > 0 then
    update public.user_credits uc
    set monthly_ai_remaining = uc.monthly_ai_remaining - 1,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  else
    update public.user_credits uc
    set purchased_ai_remaining = uc.purchased_ai_remaining - 1,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  end if;

  return (v_monthly + v_purchased) - 1;
end;
$$;

grant execute on function public.consume_ai_quota(uuid) to authenticated;

drop function if exists public.apply_plan_purchase(uuid, text);

create or replace function public.apply_plan_purchase(
  p_organization_id uuid,
  p_plan_action text -- 'starter' | 'pro' | 'growth' | 'business' | 'topup10' | 'ai_topup5' | 'ai_topup15' | 'ai_topup40'
)
returns table (
  plan_tier varchar,
  monthly_inspections_limit integer,
  monthly_inspections_remaining integer,
  purchased_inspections_remaining integer,
  monthly_ai_limit integer,
  monthly_ai_remaining integer,
  purchased_ai_remaining integer
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_plan_action not in (
    'starter', 'pro', 'growth', 'business', 'topup10', 'ai_topup5', 'ai_topup15', 'ai_topup40'
  ) then
    raise exception 'INVALID_PLAN_ACTION: ismeretlen csomag-művelet (%)', p_plan_action
      using errcode = 'P0001';
  end if;

  insert into public.user_credits (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  if p_plan_action = 'starter' then
    update public.user_credits uc
    set plan_tier = 'starter',
        monthly_inspections_limit = 20,
        monthly_inspections_remaining = 20,
        monthly_ai_limit = 6,
        monthly_ai_remaining = 6,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  elsif p_plan_action = 'growth' then
    update public.user_credits uc
    set plan_tier = 'growth',
        monthly_inspections_limit = 35,
        monthly_inspections_remaining = 35,
        monthly_ai_limit = 14,
        monthly_ai_remaining = 14,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  elsif p_plan_action = 'pro' then
    update public.user_credits uc
    set plan_tier = 'pro',
        monthly_inspections_limit = 50,
        monthly_inspections_remaining = 50,
        monthly_ai_limit = 25,
        monthly_ai_remaining = 25,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  elsif p_plan_action = 'business' then
    update public.user_credits uc
    set plan_tier = 'business',
        monthly_inspections_limit = 999999,
        monthly_inspections_remaining = 999999,
        monthly_ai_limit = 100,
        monthly_ai_remaining = 100,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  elsif p_plan_action = 'topup10' then
    update public.user_credits uc
    set purchased_inspections_remaining = uc.purchased_inspections_remaining + 10,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  elsif p_plan_action = 'ai_topup5' then
    update public.user_credits uc
    set purchased_ai_remaining = uc.purchased_ai_remaining + 5,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  elsif p_plan_action = 'ai_topup15' then
    update public.user_credits uc
    set purchased_ai_remaining = uc.purchased_ai_remaining + 15,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  elsif p_plan_action = 'ai_topup40' then
    update public.user_credits uc
    set purchased_ai_remaining = uc.purchased_ai_remaining + 40,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  end if;

  return query
    select uc.plan_tier, uc.monthly_inspections_limit, uc.monthly_inspections_remaining,
           uc.purchased_inspections_remaining, uc.monthly_ai_limit, uc.monthly_ai_remaining,
           uc.purchased_ai_remaining
    from public.user_credits uc
    where uc.organization_id = p_organization_id;
end;
$$;

grant execute on function public.apply_plan_purchase(uuid, text) to service_role;
