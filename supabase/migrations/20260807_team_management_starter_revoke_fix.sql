-- =============================================================================
-- HIBAJAVÍTÁS (2026-08-07, felhasználói jelzés: "annyi hiba van a rendszerben, hogy
-- az egyéni tier-ben is tudok embereket meghívni magam alá. Pedig ebben nincs benne.") --
-- az `apply_plan_purchase` korábbi 'starter' ága (lásd
-- `20260807_team_management_tier_unlock.sql`) SZÁNDÉKOSAN NEM kapcsolta vissza
-- `false`-ra a `team_management_enabled`-et Egyéni (starter) tier-re
-- (vissza)váltáskor -- ez egy tudatos, de TÉVES tervezési döntés volt
-- (grandfathering: "ha egy szervezet már épített csapatot Growth+ csomagon, egy
-- visszaváltás ne tegye azonnal használhatatlanná a már meghívott
-- Átvizsgálókat"). A felhasználó élő adaton reprodukálta a hibát (egy Profi ->
-- Egyéni csomagváltás UTÁN a Csapatkezelés fül TOVÁBBRA IS aktív maradt) és
-- explicit kérte, hogy az Egyéni tier-en SOSE legyen elérhető a Csapatkezelés,
-- függetlenül a korábbi állapottól/tier-történettől.
--
-- MOSTANTÓL: az 'starter' ág AKTÍVAN `false`-ra állítja a
-- `team_management_enabled`-et minden Egyéni tier-re (vissza)váltáskor -- a
-- Platform Admin (`/admin`) kézi override-ja Growth+ ügyfeleknél továbbra is
-- kiegészítő szerepet tölt be, DE Egyéni ügyfélnél a KÖVETKEZŐ 'starter'
-- plan-művelet ezt is felülírja `false`-ra (szimmetrikus a growth/pro/business
-- ágak meglévő "a következő vásárlás felülírja a kézi kapcsolót" viselkedésével).
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-
-- követés célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével lett
-- közvetlenül az éles projektre (`nsejmkcwvksbwxscvrvb`) alkalmazva.
-- =============================================================================

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

    -- JAVÍTVA: Csapatkezelés KIKAPCSOLÁSA Egyéni (starter) tier-re váltáskor -- ez a
    -- tier NEM jogosult rá, a korábbi "ne kapcsoljuk vissza" grandfathering hibás volt.
    update public.organizations
    set team_management_enabled = false
    where id = p_organization_id
      and team_management_enabled = true;
  elsif p_plan_action = 'growth' then
    update public.user_credits uc
    set plan_tier = 'growth',
        monthly_inspections_limit = 35,
        monthly_inspections_remaining = 35,
        monthly_ai_limit = 14,
        monthly_ai_remaining = 14,
        updated_at = now()
    where uc.organization_id = p_organization_id;

    update public.organizations
    set team_management_enabled = true
    where id = p_organization_id
      and team_management_enabled = false;
  elsif p_plan_action = 'pro' then
    update public.user_credits uc
    set plan_tier = 'pro',
        monthly_inspections_limit = 50,
        monthly_inspections_remaining = 50,
        monthly_ai_limit = 25,
        monthly_ai_remaining = 25,
        updated_at = now()
    where uc.organization_id = p_organization_id;

    update public.organizations
    set team_management_enabled = true
    where id = p_organization_id
      and team_management_enabled = false;
  elsif p_plan_action = 'business' then
    update public.user_credits uc
    set plan_tier = 'business',
        monthly_inspections_limit = 999999,
        monthly_inspections_remaining = 999999,
        monthly_ai_limit = 100,
        monthly_ai_remaining = 100,
        updated_at = now()
    where uc.organization_id = p_organization_id;

    update public.organizations
    set team_management_enabled = true
    where id = p_organization_id
      and team_management_enabled = false;
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

-- -----------------------------------------------------------------------------
-- Egyszeri korrekció: a MÁR MOST nem-growth/pro/business (starter VAGY még
-- user_credits sor nélküli) szervezetek Csapatkezelése azonnal kikapcsolva --
-- ne kelljen egy újabb csomag-műveletet kiváltani ahhoz, hogy a hiba javuljon.
-- -----------------------------------------------------------------------------
update public.organizations o
set team_management_enabled = false
where o.team_management_enabled = true
  and not exists (
    select 1 from public.user_credits uc
    where uc.organization_id = o.id
      and uc.plan_tier in ('growth', 'pro', 'business')
  );
