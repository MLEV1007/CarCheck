-- =============================================================================
-- Publikus riport AI chat -- tier-gating (ai_chat_enabled) + visszaélés elleni
-- napi üzenet-limit
-- =============================================================================
-- Lásd `PLAN_ai_report_chat.md` -- ez a spec implementációja. KÉT, a felhasználóval
-- explicit egyeztetett nyitott döntés (2026-08-06):
--
--  A) KVÓTA: a chat üzenetei NEM a meglévő, Stripe-csomaghoz kötött AI-kredit
--     poolból (`user_credits.monthly_ai_remaining`/`purchased_ai_remaining`)
--     fogynak -- a felhasználó válasza: "Ezt tartalmazza az előfizetés díja."
--     A Pro/Business előfizetés ára már MAGÁBAN FOGLALJA a chat-funkciót, tehát
--     ez NEM egy külön elszámolási egység, amit a szakinak "el kellene költenie".
--     Kizárólag egy önálló, riport-tokenenkénti NAPI üzenetszám-limit védi az
--     endpointot a nyílt visszaéléstől (pl. "ingyen ChatGPT-ként" használva) --
--     ez a limit szándékosan bőkezű, és SOSEM jelenik meg a végfelhasználónak
--     "elfogyott kereted" jellegű kvóta-szövegként, csak egy generikus "próbáld
--     újra később" hibaként a ritka, ténylegesen visszaélésszerű esetben.
--
--  B) PERZISZTENCIA / GDPR: a beszélgetés TARTALMA (sem a user kérdése, sem az AI
--     válasza) SEHOL nem kerül szerver-/DB-oldali tárolásra -- ez a GDPR
--     adatminimalizálási elvének (Art. 5(1)(c) GDPR) leginkább megfelelő,
--     egyben a legegyszerűbb megoldás is (a felhasználó mindkét szempontot
--     kérte). A `report_chat_usage` tábla purhogy egy NAPI ÜZENETSZÁMLÁLÓ
--     riport-tokenenként -- se szöveg, se IP-cím, se bármilyen, egy konkrét
--     látogatóhoz visszavezethető azonosító nincs benne, kizárólag a (nyilvános,
--     az URL-ben amúgy is szereplő) `public_token` + dátum + darabszám. A
--     beszélgetés-előzmény a kliens böngésző-memóriájában (React state) él,
--     oldalfrissítésnél elvész, lásd `components/report/ReportAiChat.tsx`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) `get_public_report` RPC bővítése -- `ai_chat_enabled` mező, SZERVER-oldalon
--    számolva a szervezet `user_credits.plan_tier`-jéből. A kliens SOSE dönthet
--    erről saját maga (lásd PLAN_ai_report_chat.md 2. pont) -- egy manipulált
--    frontend-hívás sem tudná bekapcsolni Starter/Growth riporton, mert a
--    `/api/report-chat` route (lásd külön fájlban) ugyanezt az RPC-t hívja meg
--    ELSŐ lépésben, és `ai_chat_enabled === false` esetén 403-at ad, MÉG MIELŐTT
--    bármilyen Gemini-hívás történne.
--
-- A függvény törzse egyébként VÁLTOZATLAN (lásd `20260807090000_report_thresholds.sql`),
-- csak a visszaadott jsonb kapott egy új felső szintű kulcsot.
-- -----------------------------------------------------------------------------
create or replace function public.get_public_report(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_inspection public.inspections%rowtype;
  v_result jsonb;
begin
  select * into v_inspection
  from public.inspections
  where public_token = p_token
    and status = 'completed';

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'inspection', jsonb_build_object(
      'id', v_inspection.id,
      'car_brand', v_inspection.car_brand,
      'car_model', v_inspection.car_model,
      'year', v_inspection.year,
      'vin', v_inspection.vin,
      'license_plate', v_inspection.license_plate,
      'license_plate_country', v_inspection.license_plate_country,
      'odometer', v_inspection.odometer,
      'status', v_inspection.status,
      'general_photos', coalesce(to_jsonb(v_inspection.general_photos), '[]'::jsonb),
      'diagnostics', coalesce(v_inspection.diagnostics, '{"no_dtc": true, "codes": []}'::jsonb),
      'equipment', coalesce(v_inspection.equipment, '[]'::jsonb),
      'tires', coalesce(v_inspection.tires, '{}'::jsonb),
      'service_history', coalesce(v_inspection.service_history, '{"status": null, "photos": [], "entries": []}'::jsonb),
      'damages', coalesce(v_inspection.damages, '[]'::jsonb),
      'final_assessment', coalesce(v_inspection.final_assessment, '{"recommendation": null, "estimated_cost_min": null, "estimated_cost_max": null, "cost_notes": null, "summary_text": null}'::jsonb),
      'show_inspector_on_pdf', v_inspection.show_inspector_on_pdf,
      'inspector_name', case
        when v_inspection.show_inspector_on_pdf then coalesce(
          nullif(trim(v_inspection.inspector_name), ''),
          case
            when v_inspection.inspector_id is not null then (
              select coalesce(
                nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
                nullif(trim(u.raw_user_meta_data->>'name'), ''),
                split_part(u.email, '@', 1)
              )
              from auth.users u
              where u.id = v_inspection.inspector_id
            )
            else null
          end
        )
        else null
      end,
      'show_client_on_pdf', v_inspection.show_client_on_pdf,
      'client_name', case when v_inspection.show_client_on_pdf then v_inspection.client_name else null end,
      'client_phone', case when v_inspection.show_client_on_pdf then v_inspection.client_phone else null end,
      'client_email', case when v_inspection.show_client_on_pdf then v_inspection.client_email else null end,
      'created_at', v_inspection.created_at,
      'updated_at', v_inspection.updated_at
    ),
    'paint_measurements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pm.id,
        'x', pm.x,
        'y', pm.y,
        'value', pm.value,
        'created_at', pm.created_at
      ) order by pm.created_at)
      from public.paint_measurements pm
      where pm.inspection_id = v_inspection.id
    ), '[]'::jsonb),
    'defects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'category', d.category,
        'description', d.description,
        'media_url', d.media_url,
        'created_at', d.created_at
      ) order by d.created_at)
      from public.defects d
      where d.inspection_id = v_inspection.id
    ), '[]'::jsonb),
    'company', (
      select jsonb_build_object(
        'company_name', p.company_name,
        'logo_url', p.logo_url,
        'primary_color', p.primary_color,
        'phone', p.phone,
        'email', p.email,
        'paint_threshold_gyari_max_micron', p.paint_threshold_gyari_max_micron,
        'paint_threshold_ujrafujt_max_micron', p.paint_threshold_ujrafujt_max_micron,
        'tire_age_warning_years', p.tire_age_warning_years,
        'tire_tread_warning_mm', p.tire_tread_warning_mm
      )
      from public.profiles p
      where p.id = v_inspection.user_id
    ),
    'ai_chat_enabled', coalesce((
      select uc.plan_tier in ('pro', 'business')
      from public.user_credits uc
      where uc.organization_id = v_inspection.organization_id
    ), false)
  ) into v_result;

  return v_result;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 2) `report_chat_usage` -- KIZÁRÓLAG napi üzenetszámláló, lásd a fájl tetején a
--    GDPR-indoklást. NINCS message-tartalom, NINCS IP, NINCS látogató-azonosító.
-- -----------------------------------------------------------------------------
create table public.report_chat_usage (
  public_token uuid not null,
  usage_date date not null,
  message_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (public_token, usage_date)
);

comment on table public.report_chat_usage is
  'Publikus riport AI chat -- KIZÁRÓLAG egy napi üzenetszámláló riport-tokenenként, '
  'visszaélés-elleni (nem üzleti/kvóta célú) védelemhez. A beszélgetés TARTALMA '
  'SOHA nem kerül ide (GDPR adatminimalizálás, lásd PLAN_ai_report_chat.md és a '
  'jelen migráció fejléc-kommentjét). KIZÁRÓLAG a '
  'check_and_increment_report_chat_usage SECURITY DEFINER RPC-n keresztül írható/'
  'olvasható -- direkt kliens (PostgREST) hozzáférés RLS-szel véglegesen tiltva.';

alter table public.report_chat_usage enable row level security;
-- Szándékosan EGYETLEN policy sincs felvéve sem `anon`, sem `authenticated`
-- szerepkörre -- RLS bekapcsolt állapotban policy hiányában MINDEN közvetlen
-- (PostgREST/kliens) hozzáférés automatikusan elutasításra kerül, a tábla
-- kizárólag a lenti, SECURITY DEFINER RPC-n keresztül érhető el.

-- -----------------------------------------------------------------------------
-- 3) `check_and_increment_report_chat_usage` RPC -- EGYETLEN hívásban ellenőrzi
--    A) hogy a riport létezik-e és `completed` állapotú, B) hogy a szervezet
--    Pro/Business csomagon van-e (a tier-gate itt, szerver-oldalon IS ki van
--    kényszerítve, nem csak a `get_public_report`-ban -- lásd
--    PLAN_ai_report_chat.md 2. pont, "a kliens sose döntsön erről saját maga"),
--    C) atomikusan növeli a mai napi számlálót, HA az még a limit alatt van.
--
--    `true` = az üzenet mehet (a Gemini-hívás elindulhat), `false` = elutasítva
--    (vagy mert nincs jogosultsága a riportnak a chat-hez, vagy mert a napi
--    limitet elérte) -- a hívó route (`/api/report-chat`) NEM különbözteti meg a
--    két esetet a végfelhasználó felé (lásd a fájl tetején lévő A) pontot).
-- -----------------------------------------------------------------------------
create or replace function public.check_and_increment_report_chat_usage(
  p_token uuid,
  p_daily_limit integer default 40
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_inspection public.inspections%rowtype;
  v_plan_tier varchar;
  v_new_count integer;
begin
  if p_daily_limit is null or p_daily_limit <= 0 then
    return false;
  end if;

  select * into v_inspection
  from public.inspections
  where public_token = p_token
    and status = 'completed';

  if not found then
    return false;
  end if;

  select uc.plan_tier into v_plan_tier
  from public.user_credits uc
  where uc.organization_id = v_inspection.organization_id;

  if v_plan_tier is null or v_plan_tier not in ('pro', 'business') then
    return false;
  end if;

  insert into public.report_chat_usage (public_token, usage_date, message_count)
  values (p_token, current_date, 1)
  on conflict (public_token, usage_date)
  do update set message_count = public.report_chat_usage.message_count + 1,
                updated_at = now()
  where public.report_chat_usage.message_count < p_daily_limit
  returning message_count into v_new_count;

  -- Ha a WHERE feltétel a konfliktus-ágon hamis volt (a mai limit már elérve),
  -- a Postgres az adott sort NEM frissíti és NEM adja vissza a RETURNING-ban --
  -- v_new_count ilyenkor NULL marad, ez a "limit elérve, elutasítva" jel.
  return v_new_count is not null;
end;
$function$;

grant execute on function public.check_and_increment_report_chat_usage(uuid, integer) to anon, authenticated;
