-- =============================================================================
-- Csapatkezelés (ügyfélkezelés) automatikus feloldása Műhely / Kereskedői (growth)
-- tier-től felfelé (2026-08-07, felhasználói kérés: "az ügyfélkezelés a műhely
-- tier-től fölfele legyen elérhető").
-- =============================================================================
-- Eddig `organizations.team_management_enabled` KIZÁRÓLAG a Platform Admin (`/admin`)
-- kézi kapcsolójával volt állítható, plan_tier-től FÜGGETLENÜL (lásd
-- `20260803_platform_admin_entitlements.sql`). Mostantól az `apply_plan_purchase` RPC
-- IS beállítja `true`-ra, amikor a szervezet growth/pro/business csomagra vált/vásárol
-- -- ez az EGYETLEN forrás, amit mind a Beállítások oldal
-- (`app/settings/_components/SettingsPageContent.tsx`), mind a meghívó-linkes
-- regisztráció (`handle_new_user()` trigger, ugyanabban a fájlban) olvas, tehát a UI
-- és a tényleges meghívás-elfogadás logika automatikusan szinkronban marad -- NEM
-- kell két helyen (UI-only feltétel + DB trigger) duplikálni a tier-ellenőrzést, ami
-- egy csendes, zavaró inkonzisztenciához vezetett volna (a Menedzser látná a
-- Csapatkezelés fület és generálna meghívó-linket, de a meghívott user a
-- `handle_new_user()` triggerben a régi, még `false` `team_management_enabled` miatt
-- egy teljesen ÚJ, üres szervezetbe került volna a csatlakozás helyett).
--
-- SZÁNDÉKOSAN NEM kapcsoljuk vissza `false`-ra 'starter'-re való visszaváltáskor -- ha
-- egy szervezet már épített csapatot Growth+ csomagon, egy visszaváltás ne tegye
-- azonnal használhatatlanná a már meghívott Átvizsgálókat (grandfathering, ugyanaz az
-- elv, mint a Platform Admin kézi engedélyezésénél: csak BŐVÍTŐ irányba automatikus,
-- szűkítő irányba csak a Platform Admin dönthet kézzel).
--
-- A Platform Admin kézi kapcsolója (`/admin`, `AdminOrganizationsTable.tsx`) TOVÁBBRA
-- IS működik, kiegészítő override-ként (pl. egyedi kivétel egy Starter ügyfélnek).
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
  elsif p_plan_action = 'growth' then
    update public.user_credits uc
    set plan_tier = 'growth',
        monthly_inspections_limit = 35,
        monthly_inspections_remaining = 35,
        monthly_ai_limit = 14,
        monthly_ai_remaining = 14,
        updated_at = now()
    where uc.organization_id = p_organization_id;

    -- ÚJ: Csapatkezelés automatikus feloldása Műhely / Kereskedői (growth) tier-től.
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

    -- ÚJ: Csapatkezelés automatikus feloldása (Profi >= Műhely / Kereskedői).
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

    -- ÚJ: Csapatkezelés automatikus feloldása (Autóház >= Műhely / Kereskedői).
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
-- Egyszeri backfill: a MÁR MOST growth/pro/business csomagon lévő szervezetek is
-- azonnal kapják meg a jogosultságot (ne kelljen egy újabb Stripe-vásárlást
-- kiváltaniuk ahhoz, hogy a fenti, jövőbeli logika lefusson rájuk).
-- -----------------------------------------------------------------------------
update public.organizations o
set team_management_enabled = true
from public.user_credits uc
where uc.organization_id = o.id
  and uc.plan_tier in ('growth', 'pro', 'business')
  and o.team_management_enabled = false;
