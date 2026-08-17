-- =============================================================================
-- Előfizetés lemondása (2026-08-17, felhasználói kérés: "hozd létre, hogy az
-- előfizetést le is lehessen mondani... Csak biztos megoldás érdekel, ha valaki
-- leiratkozik, akkor még a kifizetett részig használhatja a rendszert, utána
-- biztosan nem. A fiókja természetesen megmarad.")
-- =============================================================================
-- Eddig a Stripe-integráció csak ELŐRE (vásárlás/csomagváltás) irányba működött --
-- nem volt semmilyen felhasználói felület vagy backend logika egy AKTÍV előfizetés
-- lemondásához. A Stripe-standard, "biztos" megoldás a `cancel_at_period_end = true`
-- beállítása a Subscription objektumon (`app/api/stripe/cancel-subscription/route.ts`
-- hívja) -- ez NEM azonnal szünteti meg a hozzáférést, hanem a Stripe a MÁR
-- KIFIZETETT számlázási cikluson belül aktívan tartja az előfizetést, és a periódus
-- VÉGÉN (a Stripe szerverén, automatikusan, semmilyen mi-oldali cron/időzítés nélkül)
-- küld egy `customer.subscription.deleted` webhook-eseményt -- ez az EGYETLEN
-- megbízható jelzés arra, hogy a fizetett időszak ténylegesen lejárt, és a szervezetet
-- innentől véglegesen (a fiók/adatok törlése NÉLKÜL) vissza kell fokozni az
-- 'free' csomagra.
--
-- 1) `cancel_at_period_end` -- a Stripe Subscription objektum ugyanezen mezőjének
--    tükrözése (`app/api/stripe/webhook/route.ts` `handleSubscriptionEvent` frissíti
--    minden `customer.subscription.*` eseménynél), hogy a Billing felület
--    (`BillingTab.tsx`) meg tudja jeleníteni: "Lemondva -- aktív <dátum>-ig" állapotot,
--    lemondás/visszavonás gombbal.
--
-- 2) `apply_plan_purchase` RPC bővítve a 'free' `p_plan_action`-nel -- EZ az egyetlen
--    hely, ami a `plan_tier`-t/havi kvótákat módosíthatja (lásd a meglévő JSDoc-okat a
--    webhook route-ban), tehát a ténylegesen lejárt előfizetés visszafokozása is EZEN
--    keresztül, NEM egy külön, duplikált UPDATE-tel történik -- ugyanaz az elv, mint a
--    'starter'/'growth'/'pro'/'business' águknál. A `team_management_enabled`
--    visszavonása szimmetrikus a 'starter' ág 20260807-es hibajavításával (lásd
--    `20260807_team_management_starter_revoke_fix.sql`) -- a Csapatkezelés az Egyéni
--    tier-en SEM elérhető, tehát az ingyenes csomagon pláne nem.
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-
-- követés célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével lett
-- közvetlenül az éles projektre (`nsejmkcwvksbwxscvrvb`) alkalmazva.
-- =============================================================================

alter table public.user_credits
  add column if not exists cancel_at_period_end boolean not null default false;

comment on column public.user_credits.cancel_at_period_end is
  'A Stripe Subscription objektum cancel_at_period_end mezőjének tükrözése -- true, ha a '
  'Menedzser lemondta az előfizetést (app/api/stripe/cancel-subscription/route.ts), de a '
  'MÁR KIFIZETETT számlázási ciklus végéig még aktív marad. A ciklus végén a Stripe '
  'automatikusan customer.subscription.deleted eseményt küld, ami a plan_tier-t '
  '''free''-re fokozza vissza (lásd apply_plan_purchase ''free'' ágát).';

create or replace function public.apply_plan_purchase(
  p_organization_id uuid,
  p_plan_action text -- 'free' | 'starter' | 'pro' | 'growth' | 'business' | 'topup10' | 'ai_topup5' | 'ai_topup15' | 'ai_topup40'
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
    'free', 'starter', 'pro', 'growth', 'business', 'topup10', 'ai_topup5', 'ai_topup15', 'ai_topup40'
  ) then
    raise exception 'INVALID_PLAN_ACTION: ismeretlen csomag-művelet (%)', p_plan_action
      using errcode = 'P0001';
  end if;

  insert into public.user_credits (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  if p_plan_action = 'free' then
    -- ÚJ (2026-08-17, "Előfizetés lemondása" lépés): egy ténylegesen lejárt (a Stripe
    -- által automatikusan lezárt, customer.subscription.deleted) előfizetés
    -- visszafokozása az ingyenes csomagra -- lásd app/api/stripe/webhook/route.ts.
    -- Csak a HAVI kereteket állítja alaphelyzetbe, a vásárolt (nem lejáró) Top-up/
    -- AI-kredit keretet (purchased_inspections_remaining/purchased_ai_remaining)
    -- SZÁNDÉKOSAN nem érinti -- amit a szervezet külön kifizetett, azt megtartja.
    update public.user_credits uc
    set plan_tier = 'free',
        monthly_inspections_limit = 5,
        monthly_inspections_remaining = 5,
        monthly_ai_limit = 3,
        monthly_ai_remaining = 3,
        cancel_at_period_end = false,
        updated_at = now()
    where uc.organization_id = p_organization_id;

    -- A Csapatkezelés az Egyéni (starter) tier-en sem elérhető, tehát az ingyenes
    -- csomagon pláne nem -- szimmetrikus a 'starter' ág 20260807-es hibajavításával.
    update public.organizations
    set team_management_enabled = false
    where id = p_organization_id
      and team_management_enabled = true;
  elsif p_plan_action = 'starter' then
    update public.user_credits uc
    set plan_tier = 'starter',
        monthly_inspections_limit = 20,
        monthly_inspections_remaining = 20,
        monthly_ai_limit = 6,
        monthly_ai_remaining = 6,
        updated_at = now()
    where uc.organization_id = p_organization_id;

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
