-- =============================================================================
-- AI API hívás-napló -- Platform Admin láthatóság (2026-08-17)
-- =============================================================================
-- Kérés (Levi): a /admin felületen lássa fiókonként/szervezetenként, hány AI API
-- hívás történt, és melyik Gemini modellnek. Ez NEM azonos a meglévő "1 AI-kredit
-- = 1 vizsgálat" elszámolással (lásd inspection_ai_credit_usage /
-- lib/inspectionAiCredit.ts) -- az csak vizsgálatonként az ELSŐ sikeres hívást
-- számolja el a szervezet kreditjéből, ez a tábla viszont MINDEN egyes tényleges
-- ai.models.generateContent() próbálkozást naplóz (sikereset és sikertelent is),
-- modellnevenként, tisztán megjelenítési/megfigyelési célra.
--
-- Két SECURITY DEFINER RPC írja: log_ai_api_call (a 7 bejelentkezés-védett
-- /api/ai/* route-hoz, `authenticated`-nek grantolva) és
-- log_public_report_ai_api_call (a publikus /api/report-chat route-hoz, `anon`-nak
-- is grantolva -- a szervezetet a `public_token`-ből resolválja, a kliens sosem
-- adhat meg közvetlenül organization_id-t).
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-
-- követés célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével
-- lett közvetlenül az éles projektre (`nsejmkcwvksbwxscvrvb`) alkalmazva.
-- =============================================================================

create table public.ai_api_calls (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  feature_name text not null,
  model text not null,
  success boolean not null,
  used_cache boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.ai_api_calls is
  'Minden TÉNYLEGES Gemini API hívás-próbálkozás naplója (sikeres ÉS sikertelen is) -- '
  'Platform Admin láthatóság célja ("mennyi AI API hívást tettek az egyes fiókok, és '
  'melyik modellnek"), NEM kredit-/kvóta-elszámolási forrás (lásd '
  'inspection_ai_credit_usage/lib/inspectionAiCredit.ts a tényleges "1 kredit = 1 '
  'vizsgálat" elszámolásért). KIZÁRÓLAG a log_ai_api_call/log_public_report_ai_api_call '
  'SECURITY DEFINER RPC-ken keresztül írható -- nincs közvetlen INSERT policy.';
comment on column public.ai_api_calls.user_id is
  'A hívó felhasználó -- NULL a publikus riport AI chat (/api/report-chat) '
  'hívásainál, mert azokat a vásárló (nem bejelentkezett) oldala indítja.';
comment on column public.ai_api_calls.used_cache is
  'Igaz, ha ez a hívás egy Gemini explicit prompt-cache-t (cachedContent) használt '
  '-- jelenleg kizárólag a report-chat route-nál releváns, lásd '
  'report_chat_context_cache tábla.';

create index ai_api_calls_organization_id_created_at_idx
  on public.ai_api_calls (organization_id, created_at desc);

create index ai_api_calls_model_idx on public.ai_api_calls (model);

alter table public.ai_api_calls enable row level security;

-- Szándékosan NINCS INSERT/UPDATE/DELETE policy semelyik szerepkörre -- a tábla
-- kizárólag a lenti SECURITY DEFINER RPC-ken keresztül írható (a függvény-
-- tulajdonos jogosultságával futnak, megkerülve az RLS-t). Csak SELECT van, kizárólag
-- Platform Adminnak -- ugyanaz a minta, mint a többi admin-only táblánál
-- (pl. user_credits_select_platform_admin, 20260811120000_admin_credits_management.sql).
create policy ai_api_calls_select_platform_admin
  on public.ai_api_calls for select
  to authenticated
  using (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- log_ai_api_call -- a 7 bejelentkezés-védett /api/ai/* route-hoz
-- -----------------------------------------------------------------------------
-- Védekező ellenőrzés (p_user_id = auth.uid() ÉS a hívó ténylegesen a megadott
-- szervezet tagja): enélkül egy közvetlen, a route-ot megkerülő kliens-oldali RPC-
-- hívás (Supabase JS SDK-val) tetszőleges MÁSIK szervezet admin-statisztikáját
-- tudná hamis sorokkal szennyezni. Ez NEM egy kredit-/biztonsági kapu (a tábla
-- csak megjelenítési admin-statisztika), de a projekt szigorú multi-tenant elvét
-- (PROJEKT_INSTRUKCIOK.md 3. pont) itt is követjük.
create or replace function public.log_ai_api_call(
  p_organization_id uuid,
  p_user_id uuid,
  p_feature_name text,
  p_model text,
  p_success boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is distinct from auth.uid() then
    return;
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and organization_id = p_organization_id
  ) then
    return;
  end if;

  insert into public.ai_api_calls (organization_id, user_id, feature_name, model, success)
  values (p_organization_id, p_user_id, p_feature_name, p_model, p_success);
end;
$$;

grant execute on function public.log_ai_api_call(uuid, uuid, text, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- log_public_report_ai_api_call -- a publikus /api/report-chat route-hoz
-- -----------------------------------------------------------------------------
-- A szervezetet a `public_token`-ből resolváljuk szerver-oldalon (ugyanaz a minta,
-- mint a `check_and_increment_report_chat_usage`-nél) -- a kliens (a riportot néző
-- vásárló böngészője) sosem adhat meg közvetlenül organization_id-t.
create or replace function public.log_public_report_ai_api_call(
  p_token uuid,
  p_model text,
  p_success boolean,
  p_used_cache boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id
  from public.inspections
  where public_token = p_token
    and status = 'completed';

  if v_organization_id is null then
    return;
  end if;

  insert into public.ai_api_calls (organization_id, user_id, feature_name, model, success, used_cache)
  values (v_organization_id, null, 'report_chat', p_model, p_success, p_used_cache);
end;
$$;

grant execute on function public.log_public_report_ai_api_call(uuid, text, boolean, boolean) to anon, authenticated;
