-- =============================================================================
-- Átvizsgáló neve -- szabadon szerkeszthető felülírás
-- =============================================================================
-- Eddig az "Átvizsgálást végezte" név a publikus riportban KIZÁRÓLAG az
-- `auth.users.raw_user_meta_data` mezőből (Google OAuth full_name/name, vagy
-- e-mail cím "@" előtti része fallbackként) származott, nem volt hozzá
-- szerkeszthető UI-mező (lásd `20260806_inspector_and_client_fields.sql`
-- eredeti JSDoc-ját). A felhasználói visszajelzés alapján (2026-08-06) az
-- "Összegzés & Publikálás" wizard-lépésen mégis legyen egy input mező az
-- átvizsgáló nevének KÉZI megadására/felülírására -- ez az oszlop tárolja ezt
-- az opcionális, szabadon szerkeszthető értéket. Ha üres/NULL, a
-- `get_public_report` RPC továbbra is az auto-derivált nevet adja vissza
-- (teljes visszafelé kompatibilitás a korábban mentett vizsgálatokkal).
alter table public.inspections
  add column inspector_name text;

comment on column public.inspections.inspector_name is
  'Átvizsgáló neve -- opcionális, kézzel szerkeszthető felülírás (wizard "Összegzés & Publikálás" lépés). Ha NULL, a get_public_report RPC az auth.users metaadatokból automatikusan levezetett nevet használja.';

-- `get_public_report` RPC frissítése: a tárolt `inspector_name` oszlop ELSŐBBSÉGET
-- élvez az auto-derivált névvel szemben, de üres/NULL esetén továbbra is arra esik
-- vissza -- lásd fenti komment. A függvény törzse egyébként változatlan (csak az
-- 'inspector_name' JSON-kulcs kifejezése bővült egy `coalesce`-szel).
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
        'email', p.email
      )
      from public.profiles p
      where p.id = v_inspection.user_id
    )
  ) into v_result;

  return v_result;
end;
$function$;
