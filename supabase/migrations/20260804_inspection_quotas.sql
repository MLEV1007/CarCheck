-- =============================================================================
-- Vizsgálati- és AI-keret (kvóta) rendszer -- Stripe Starter/Pro/Top-up integráció
-- =============================================================================
-- Ez a lépés a MEGLÉVŐ, szervezet-szintű `user_credits` táblát (lásd
-- `20260802_credits_schema.sql` + `20260803_organizations_rbac.sql`) bővíti a
-- PROJEKT_INSTRUKCIOK.md-ben specifikált, két KÜLÖN dimenziós kvótával:
--   1) `monthly_inspections_limit`/`monthly_inspections_remaining` + `purchased_
--      inspections_remaining` -- HÁNY autó-vizsgálat indítható a hónapban (havi
--      keret + külön vásárolt, nem lejáró Top-up csomagok).
--   2) `monthly_ai_limit`/`monthly_ai_remaining` -- HÁNY AI-funkció-hívás
--      (hangdiktálás/forgalmi szkenner) érhető el a hónapban.
--   3) `plan_tier` ('starter' | 'pro') -- ez a szervezet-szintű csomag-jelző MOSTANTÓL
--      a kvóta-táblán (`user_credits`) él, NEM a `profiles`-on -- lásd a
--      `20260803_organizations_rbac.sql` "Következő lépés" jegyzetét: "a csomag-szint
--      szervezetre költöztetése egy KÖVETKEZŐ, a Stripe-integrációval együtt
--      elvégzendő finomítás" -- ez PONTOSAN az a lépés. A `profiles.plan_tier` oszlop
--      (a régi, EGYÉNI kredit-rendszer maradványa) VÁLTOZATLANUL a helyén marad
--      (`getUserPlanTier` továbbra is ezt olvassa, lásd `lib/credits.ts`), a KETTŐ
--      egyelőre tudatosan PÁRHUZAMOSAN él -- a `user_credits.plan_tier` az ÚJ, a
--      Billing UI és a Stripe webhook ÁLTAL kezelt, hiteles forrás.
--
-- Emellett 3 ÚJ RPC:
--   * `consume_inspection_quota` -- atomikus, sor-zárolt levonás (havi -> vásárolt
--     elsőbbséggel, UGYANAZ a minta, mint a meglévő `deduct_credits`).
--   * `consume_ai_quota` -- atomikus, sor-zárolt levonás a havi AI keretből.
--   * `apply_plan_purchase` -- a Stripe webhook (`checkout.session.completed`) által
--     hívott, atomikus csomag-aktiváló/Top-up-jóváíró RPC (`service_role`-lal hívva,
--     RLS-t megkerülve, mert a webhook-nak nincs bejelentkezett user-session-je).
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-
-- követés célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével lett
-- közvetlenül az éles projektre (`nsejmkcwvksbwxscvrvb`) alkalmazva.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) user_credits bővítése -- plan_tier + vizsgálati/AI kvóta oszlopok
-- -----------------------------------------------------------------------------
alter table public.user_credits
  add column if not exists plan_tier varchar not null default 'starter',
  add column if not exists monthly_inspections_limit integer not null default 20,
  add column if not exists monthly_inspections_remaining integer not null default 20,
  add column if not exists purchased_inspections_remaining integer not null default 0,
  add column if not exists monthly_ai_limit integer not null default 3,
  add column if not exists monthly_ai_remaining integer not null default 3;

alter table public.user_credits
  add constraint user_credits_plan_tier_check
  check (plan_tier in ('starter', 'pro'));

alter table public.user_credits
  add constraint user_credits_monthly_inspections_limit_nonnegative check (monthly_inspections_limit >= 0),
  add constraint user_credits_monthly_inspections_remaining_nonnegative check (monthly_inspections_remaining >= 0),
  add constraint user_credits_purchased_inspections_remaining_nonnegative check (purchased_inspections_remaining >= 0),
  add constraint user_credits_monthly_ai_limit_nonnegative check (monthly_ai_limit >= 0),
  add constraint user_credits_monthly_ai_remaining_nonnegative check (monthly_ai_remaining >= 0);

comment on column public.user_credits.plan_tier is
  'Aktív Stripe csomag-szint (''starter''|''pro'') -- a Stripe checkout webhook '
  '(checkout.session.completed) állítja be, lásd app/api/stripe/webhook/route.ts.';
comment on column public.user_credits.monthly_inspections_limit is
  'A csomaghoz tartozó havi vizsgálati keret felső határa (Starter=20, Pro=50) -- '
  'csak MEGJELENÍTÉSI/referencia célra ("X / 20 elhasználva"), a tényleges fogyasztást '
  'a monthly_inspections_remaining/purchased_inspections_remaining vezeti.';
comment on column public.user_credits.monthly_ai_limit is
  'A csomaghoz tartozó havi AI-hívás keret felső határa (Starter=3, Pro=50) -- '
  'csak MEGJELENÍTÉSI/referencia célra, lásd monthly_inspections_limit.';

-- -----------------------------------------------------------------------------
-- 2) consume_inspection_quota RPC -- atomikus vizsgálati-keret levonás
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER, UGYANAZ a minta, mint `deduct_credits` -- a hívó felhasználó
-- saját RLS-jogosultságával fut (`user_credits_update_org` policy: bármely
-- szervezeti tag módosíthatja a SAJÁT szervezete közös sorát), sor-zárolással
-- (`for update`) védve a párhuzamos kérések közötti dupla-fogyasztás ellen.
create or replace function public.consume_inspection_quota(
  p_organization_id uuid
)
returns table (
  monthly_inspections_remaining integer,
  purchased_inspections_remaining integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_monthly integer;
  v_purchased integer;
begin
  select uc.monthly_inspections_remaining, uc.purchased_inspections_remaining
    into v_monthly, v_purchased
  from public.user_credits uc
  where uc.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'NO_QUOTA_RECORD: nincs kvóta-rekord a szervezethez (%)', p_organization_id
      using errcode = 'P0001';
  end if;

  if (v_monthly + v_purchased) < 1 then
    raise exception 'INSUFFICIENT_INSPECTION_QUOTA: nincs elérhető vizsgálati keret (elérhető: %)',
      (v_monthly + v_purchased)
      using errcode = 'P0001';
  end if;

  if v_monthly > 0 then
    update public.user_credits uc
    set monthly_inspections_remaining = uc.monthly_inspections_remaining - 1,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  else
    update public.user_credits uc
    set purchased_inspections_remaining = uc.purchased_inspections_remaining - 1,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  end if;

  return query
    select uc.monthly_inspections_remaining, uc.purchased_inspections_remaining
    from public.user_credits uc
    where uc.organization_id = p_organization_id;
end;
$$;

grant execute on function public.consume_inspection_quota(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3) consume_ai_quota RPC -- atomikus AI-keret levonás
-- -----------------------------------------------------------------------------
create or replace function public.consume_ai_quota(
  p_organization_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_remaining integer;
begin
  select uc.monthly_ai_remaining
    into v_remaining
  from public.user_credits uc
  where uc.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'NO_QUOTA_RECORD: nincs kvóta-rekord a szervezethez (%)', p_organization_id
      using errcode = 'P0001';
  end if;

  if v_remaining < 1 then
    raise exception 'INSUFFICIENT_AI_QUOTA: nincs elérhető AI keret (elérhető: %)', v_remaining
      using errcode = 'P0001';
  end if;

  update public.user_credits uc
  set monthly_ai_remaining = uc.monthly_ai_remaining - 1,
      updated_at = now()
  where uc.organization_id = p_organization_id;

  return v_remaining - 1;
end;
$$;

grant execute on function public.consume_ai_quota(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4) apply_plan_purchase RPC -- Stripe webhook csomag-aktiválás / Top-up jóváírás
-- -----------------------------------------------------------------------------
-- A webhook (app/api/stripe/webhook/route.ts) a `service_role` admin klienssel
-- (lib/supabase/admin.ts `createAdminClient()`) hívja -- NINCS bejelentkezett user-
-- session (a Stripe szerver hívja a végpontot), ezért a normál `_org` RLS policy-k
-- (amik `auth.uid()`-ra épülnek) itt nem tudnának lefutni. A `service_role` Supabase-
-- ben eleve megkerüli az RLS-t, a `security invoker` itt is szándékos (konzisztens a
-- projekt többi RPC-jével), a tényleges védelmet az adja, hogy ezt a függvényt
-- KIZÁRÓLAG a `service_role` futtatja (grant lent).
create or replace function public.apply_plan_purchase(
  p_organization_id uuid,
  p_plan_action text -- 'starter' | 'pro' | 'topup10'
)
returns table (
  plan_tier varchar,
  monthly_inspections_limit integer,
  monthly_inspections_remaining integer,
  purchased_inspections_remaining integer,
  monthly_ai_limit integer,
  monthly_ai_remaining integer
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_plan_action not in ('starter', 'pro', 'topup10') then
    raise exception 'INVALID_PLAN_ACTION: ismeretlen csomag-művelet (%)', p_plan_action
      using errcode = 'P0001';
  end if;

  -- Ha a szervezetnek MÉG NINCS kvóta-sora (pl. egy vadonatúj szervezet, ami eddig
  -- egyetlen AI-funkciót sem hívott), létrehozzuk az alapértelmezett (Starter) sort,
  -- mielőtt a tényleges csomag-műveletet alkalmaznánk -- lásd `getOrganizationCreditBalance`
  -- (lib/credits.ts) UGYANEZT a lazy-create mintát.
  insert into public.user_credits (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  if p_plan_action = 'starter' then
    update public.user_credits uc
    set plan_tier = 'starter',
        monthly_inspections_limit = 20,
        monthly_inspections_remaining = 20,
        monthly_ai_limit = 3,
        monthly_ai_remaining = 3,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  elsif p_plan_action = 'pro' then
    update public.user_credits uc
    set plan_tier = 'pro',
        monthly_inspections_limit = 50,
        monthly_inspections_remaining = 50,
        monthly_ai_limit = 50,
        monthly_ai_remaining = 50,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  elsif p_plan_action = 'topup10' then
    update public.user_credits uc
    set purchased_inspections_remaining = uc.purchased_inspections_remaining + 10,
        updated_at = now()
    where uc.organization_id = p_organization_id;
  end if;

  return query
    select uc.plan_tier, uc.monthly_inspections_limit, uc.monthly_inspections_remaining,
           uc.purchased_inspections_remaining, uc.monthly_ai_limit, uc.monthly_ai_remaining
    from public.user_credits uc
    where uc.organization_id = p_organization_id;
end;
$$;

grant execute on function public.apply_plan_purchase(uuid, text) to service_role;
