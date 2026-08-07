-- =============================================================================
-- Ingyenes alap-kvóta bevezetése ('free' plan_tier)
-- =============================================================================
-- Felhasználói jelzés alapján (2026-08-07, "az alap 5 vizsgálat / 3 AI-kredit legyen"):
-- eddig MINDEN új regisztráló automatikusan a fizetős Egyéni (Starter) csomag TELJES
-- keretét kapta (20 vizsgálat / 6 AI-kredit havonta), ingyen, örökre, plan_tier='starter'
-- címkével -- ez a Billing felületen "Egyéni csomag / Aktív csomag"-ként jelent meg egy
-- sosem fizető usernek is (élő adatban ellenőrizve: mind a 4 akkori szervezetnek NULL
-- volt a stripe_subscription_id-ja, egyik sem fizetett valaha). Mostantól külön 'free'
-- plan_tier + csökkentett alapértelmezett keret (5 vizsgálat / 3 AI-kredit havonta), ami
-- a Billing felületen NEM jelenik meg "Aktív csomag"-ként az Egyéni kártyán (lásd
-- BillingTab.tsx plans tömbjét -- csak starter/growth/pro/business kulcsra van kártya).
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-követés
-- célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével lett közvetlenül
-- az éles projektre (`nsejmkcwvksbwxscvrvb`) alkalmazva.
-- =============================================================================

alter table public.user_credits
  drop constraint if exists user_credits_plan_tier_check;

alter table public.user_credits
  add constraint user_credits_plan_tier_check
  check (plan_tier in ('free', 'starter', 'growth', 'pro', 'business'));

alter table public.user_credits
  alter column plan_tier set default 'free';

alter table public.user_credits
  alter column monthly_inspections_limit set default 5,
  alter column monthly_inspections_remaining set default 5;

alter table public.user_credits
  alter column monthly_ai_limit set default 3,
  alter column monthly_ai_remaining set default 3;

-- Egyszeri korrekció: a JELENLEG is nem-fizető (soha Stripe-előfizetést nem indított)
-- szervezetek -- amik eddig tévesen a fizetős Egyéni csomag teljes keretét kapták --
-- 'free'-re állítva, csökkentett kerettel. Egyik érintett szervezetnek sincs felhasznált
-- kerete (remaining == limit mindenhol a migráció időpontjában), tehát ez nem von el
-- ténylegesen elkezdett munkát.
update public.user_credits uc
set plan_tier = 'free',
    monthly_inspections_limit = 5,
    monthly_inspections_remaining = 5,
    monthly_ai_limit = 3,
    monthly_ai_remaining = 3,
    updated_at = now()
where uc.plan_tier = 'starter'
  and not exists (
    select 1 from public.profiles p
    where p.organization_id = uc.organization_id
      and p.stripe_subscription_id is not null
  );

-- MEGJEGYZÉS: az `apply_plan_purchase` RPC (lásd
-- `20260806_pricing_tiers_growth_business_ai_credits.sql`) VÁLTOZATLAN maradt -- a
-- ténylegesen fizetett Egyéni csomag (`p_plan_action = 'starter'`) továbbra is explicit
-- 20 vizsgálat / 6 AI-kreditet állít be, a Stripe checkout webhook hívja meg, tehát a
-- fenti oszlop-default csökkentés a VALÓDI Egyéni előfizetők kereteit nem érinti, csak
-- azt a kezdeti állapotot, amit egy szervezet a legelső `user_credits` sor
-- (lazy-create, `lib/quotas.ts` `getOrganizationQuotaBalance`) létrejöttekor kap, mielőtt
-- bármit is fizetett volna.
