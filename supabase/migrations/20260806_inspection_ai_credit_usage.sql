-- =============================================================================
-- inspection_ai_credit_usage -- "1 AI kredit = 1 vizsgálat" claim-tábla
-- =============================================================================
-- Egy vizsgálat (inspection_id) legfeljebb EGYSZER kerülhet ide -- az első sikeres AI-hívás
-- (bármelyik az 5 /api/ai/* route közül: vin_scan/equipment_parse/summary_generate/
-- grammar_fix/service_doc_scan) UTÁN, atomikus INSERT-tel "lefoglalja" a vizsgálat
-- AI-hozzáférését. Onnantól a vizsgálat MINDEN további AI-hívása ingyenes (nem vonódik le
-- se a régi generikus kredit -- user_credits.monthly_credits_remaining/purchased_credits_
-- remaining --, se az új Stripe-csomaghoz kötött AI-kvóta -- user_credits.monthly_ai_
-- remaining), lásd lib/inspectionAiCredit.ts.
--
-- NINCS FK az inspections.id-ra -- a wizard az inspectionId-t (crypto.randomUUID())
-- MÁR a wizard megnyitásakor generálja (lásd InspectionWizard.tsx), MIELŐTT az
-- inspections sor ténylegesen létrejönne (az első autosave/mentés előtt is lehet
-- AI-hívás, pl. VIN-szkennelés az 1. lépésben) -- egy kőkemény FK ilyenkor hibázna.
--
-- Race-condition védelem: a "ki fizeti ki a vizsgálat 1 kreditjét" kérdést NEM egy
-- külön lock/RPC dönti el, hanem maga a `inspection_id` PRIMARY KEY egyedisége -- két,
-- majdnem egyidejű, ugyanarra a vizsgálatra irányuló sikeres AI-hívás közül csak az
-- EGYIK INSERT-je sikerül, a másik unique violation-t (23505) kap, és emiatt NEM von
-- le kreditet/kvótát (lásd lib/inspectionAiCredit.ts claimInspectionAiCredit()).
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-
-- követés célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével lett
-- közvetlenül az éles projektre (`nsejmkcwvksbwxscvrvb`) alkalmazva.
-- =============================================================================
create table public.inspection_ai_credit_usage (
  inspection_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  credited_at timestamptz not null default now()
);

comment on table public.inspection_ai_credit_usage is
  'Jelzi, hogy egy adott vizsgálat (inspection_id) már "kifizette" az AI-hozzáférését -- '
  '1 sor / vizsgálat, a legelső sikeres AI-hívás hozza létre (atomikus INSERT, lásd '
  'lib/inspectionAiCredit.ts claimInspectionAiCredit()). Nincs FK az inspections.id-ra, '
  'mert az első AI-hívás megelőzheti a vizsgálat első mentését.';

alter table public.inspection_ai_credit_usage enable row level security;

create index inspection_ai_credit_usage_organization_id_idx
  on public.inspection_ai_credit_usage (organization_id);

-- Ugyanaz az "_org" minta, mint a user_credits/usage_logs tábláknál (lásd
-- 20260803_organizations_rbac.sql) -- bármely szervezeti tag olvashatja/beszúrhatja a
-- SAJÁT szervezete sorait, más szervezetét nem éri el.
create policy inspection_ai_credit_usage_select_org
  on public.inspection_ai_credit_usage for select
  to authenticated
  using (organization_id = public.current_user_organization_id());

create policy inspection_ai_credit_usage_insert_org
  on public.inspection_ai_credit_usage for insert
  to authenticated
  with check (organization_id = public.current_user_organization_id());

-- Szándékosan NINCS update/delete policy -- immutable claim-rekord, ugyanaz az elv, mint
-- a usage_logs audit naplónál.
