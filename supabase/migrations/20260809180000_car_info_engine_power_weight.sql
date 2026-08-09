-- Autó alapadatok kiegészítése: Motor típusa, Teljesítmény (kW), Megengedett össztömeg (kg)
-- (2026-08-09, felhasználói kérés -- "Milyen motorral szerelt az autó, KW teljesítmény
-- [lóerőre átváltva], Össztömeg" -- lásd status.md).
--
-- Mindhárom érték a forgalmi engedélyről (AI-fotószkennerrel VAGY kézzel) kerül rögzítésre
-- a wizard "Autó adatok" (1.) lépésén, ugyanúgy, mint a meglévő car_brand/car_model/vin/
-- license_plate/odometer mezők -- lásd `components/inspections/wizard/StepCarInfo.tsx` és
-- `app/api/ai/scan-vin/route.ts`.
--
-- Nincs szükség új RLS policy-ra (ugyanaz az elv, mint a
-- `20260806_inspector_and_client_fields.sql` migrációban): a 3 új oszlop a MEGLÉVŐ
-- `inspections` sor részeként öröklődik, a meglévő `inspections_select_own`/
-- `inspections_select_org`/insert/update/delete policy-k `user_id`/`organization_id`
-- alapú szűrése változatlanul érvényes rájuk.

alter table public.inspections
  add column engine_type text,
  add column power_kw integer,
  add column gross_weight_kg integer;

comment on column public.inspections.engine_type is
  'Motor típusa/üzemanyag a forgalmi engedélyről (pl. "1.6 TDI, dízel, 1968 cm³") -- szabad szöveges, opcionális.';
comment on column public.inspections.power_kw is
  'Motor teljesítménye kW-ban a forgalmi engedély P.2 mezőjéről (vagy nemzetközi megfelelőjéről) -- a lóerő (LE/PS) érték mindig ebből számolt, nem külön tárolt (lásd lib/format.ts kwToHp()).';
comment on column public.inspections.gross_weight_kg is
  'Megengedett legnagyobb össztömeg kg-ban a forgalmi engedély F.2 (vagy F.1) mezőjéről, ill. nemzetközi megfelelőjéről.';

-- `get_public_report` RPC frissítése -- a 3 új oszlopot a `jsonb_build_object('inspection',
-- ...)` blokkba, közvetlenül az `odometer` UTÁN vesszük fel, hogy a publikus riporton
-- (`ReportHero.tsx`) és a riport AI chatben (`app/api/report-chat/route.ts`) is
-- megjelenjenek -- egy új oszlop hozzáadása MAGÁBAN NEM elég, enélkül a lépés nélkül a
-- publikus riport sosem látná ezeket az adatokat, függetlenül attól, hogy a wizard menti-e
-- őket. A függvény törzse egyébként VÁLTOZATLAN (lásd a korábbi
-- `20260806180000_report_ai_chat.sql` migrációt az utoljára módosított, teljes verzióért).
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
      'engine_type', v_inspection.engine_type,
      'power_kw', v_inspection.power_kw,
      'gross_weight_kg', v_inspection.gross_weight_kg,
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
