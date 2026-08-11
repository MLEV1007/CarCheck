-- =============================================================================
-- Platform Admin -- ügyfél kredit/kvóta/előfizetés kezelés (2026-08-11)
-- =============================================================================
-- Kérés (Levi): a /admin felületen lássa és módosíthassa ügyfelenként az AI-kreditet és
-- a vizsgálati kvótát/csomagot, és lássa, ha van Stripe-előfizetés, meddig érvényes.
--
-- Döntés (Levi, tisztázó kérdésre): a /admin felületről történő módosítás CSAK belső
-- (adatbázis-szintű) felülbírálás -- NEM hív Stripe API írási műveletet, NEM módosít/mond
-- le valódi előfizetést. A lejárati dátum viszont automatikusan szinkronban legyen a
-- Stripe-pal (customer.subscription.* webhook-esemény, lásd a webhook-kódot).
--
-- 1) user_credits bővítése Stripe-előfizetés mezőkkel (stripe_customer_id/
--    stripe_subscription_id/subscription_status/subscription_current_period_end) --
--    EDDIG ezek KIZÁRÓLAG a `profiles` (egyéni, legacy) során léteztek, és a checkout
--    route sosem is töltötte ki őket -- ténylegesen sehol nem volt eddig eltárolva a
--    Stripe-előfizetés azonosítója/lejárata SEM egyéni, SEM szervezeti szinten.
-- 2) platform_admin RLS bővítés: user_credits SELECT+UPDATE, inspections SELECT (a
--    "hány vizsgálatot csináltak eddig" admin-statisztikához) -- UGYANAZ a minta, mint a
--    20260803_platform_admin_entitlements.sql organizations/profiles policy-inál.
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-követés
-- célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével lett közvetlenül
-- az éles projektre (`nsejmkcwvksbwxscvrvb`) alkalmazva, ez a fájl UGYANEZT az SQL-t
-- tartalmazza.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) user_credits -- Stripe-előfizetés mezők
-- -----------------------------------------------------------------------------
alter table public.user_credits
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists subscription_current_period_end timestamptz;

comment on column public.user_credits.stripe_customer_id is
  'A szervezet Stripe Customer azonosítója -- a customer.subscription.* webhook-esemény '
  'tölti ki (lásd app/api/stripe/webhook/route.ts handleSubscriptionEvent), NEM a '
  'checkout.session.completed (az csak a plan_tier/kvóta jóváírásért felel).';
comment on column public.user_credits.subscription_status is
  'Nyers Stripe Subscription.status érték (active/trialing/past_due/canceled/unpaid stb.) '
  '-- csak MEGJELENÍTÉSI célra a Platform Admin felületen, üzleti logika NEM erre épül.';
comment on column public.user_credits.subscription_current_period_end is
  'A Stripe Subscription aktuális számlázási ciklusának vége (meddig érvényes/mikor '
  'újul meg az előfizetés) -- customer.subscription.created/updated/deleted eseményből '
  'szinkronizálva, csak MEGJELENÍTÉSI célra.';

create index if not exists user_credits_stripe_customer_id_idx
  on public.user_credits (stripe_customer_id)
  where stripe_customer_id is not null;

-- -----------------------------------------------------------------------------
-- 2) platform_admin RLS bővítés
-- -----------------------------------------------------------------------------
-- A meglévő user_credits_select_org/update_org policy-k VÁLTOZATLANOK maradnak (több
-- PERMISSIVE policy egy táblán/parancson OR kapcsolatban van Postgres RLS-ben, lásd
-- 20260803_organizations_rbac.sql "profiles_select_org_manager" kommentjét ugyanerről) --
-- ezek csak KIEGÉSZÍTIK azokat a Platform Admin (üzemeltető) teljes rálátásával/
-- írásjogával, MINDEN szervezetre.
create policy user_credits_select_platform_admin
  on public.user_credits for select
  to authenticated
  using (public.is_platform_admin());

create policy user_credits_update_platform_admin
  on public.user_credits for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Csak SELECT -- a Platform Admin felület nem szerkeszt vizsgálatokat, csak számol
-- ("hány vizsgálatot csinált eddig ez az ügyfél" statisztikához). Az insert/update/delete
-- policy-k VÁLTOZATLANOK (inspections_insert_org/update_org/delete_org), a Platform Admin
-- ezeken keresztül NEM kap írásjogot mások vizsgálataihoz.
create policy inspections_select_platform_admin
  on public.inspections for select
  to authenticated
  using (public.is_platform_admin());
