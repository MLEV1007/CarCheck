-- =============================================================================
-- Riport küszöbértékek -- testreszabható festékvastagság/gumiabroncs figyelmeztetések
-- =============================================================================
-- Feladat-specifikáció (2026-08-07): eddig a festékvastagság-mérés "Gyári / Újrafújt /
-- Gittelt" besorolása (`getPaintStatus()`, 150/250 µm hardkódolt küszöbök) és a
-- gumiabroncs "Koros gumiabroncs" figyelmeztetés (`decodeDot()`, 5 év hardkódolt
-- küszöb) MINDEN cégnél/vizsgálónál ugyanaz volt, kód-szintű módosítás nélkül nem
-- lehetett testreszabni. Ez a migráció 4 ÚJ, opcionálisan szerkeszthető oszloppal
-- bővíti a `profiles` táblát -- a `/settings` oldal ÚJ "Riport küszöbértékek"
-- kártyájából (`ReportThresholdsCard.tsx`) módosíthatók, alapértékük 1:1 megegyezik
-- a korábbi hardkódolt konstansokkal (`DEFAULT_REPORT_THRESHOLDS`,
-- `lib/inspections/constants.ts`), tehát egyetlen meglévő vizsgálat/riport
-- megjelenése SEM változik, amíg a vizsgáló explicit nem módosítja őket.
--
-- SZÁNDÉKOSAN a `profiles` táblán (nem egy külön `organizations` oszlopon) élnek --
-- ugyanaz a minta, mint a `company_name`/`logo_url`/`primary_color`-nél: bár van
-- szervezeti (`organization_id`) csoportosítás, a meglévő céges beállítások is
-- profilonként (nem szervezetenként) tárolódnak, ez a döntés ezt a MEGLÉVŐ mintát
-- követi konzisztencia kedvéért, nem vezet be új adatmodellt.
--
-- A `tire_age_warning_years`/`tire_tread_warning_mm` NUMERIC (nem INTEGER), mert a
-- profilmélység mm-ben tört értékkel is megadható értelmesen (pl. "3.5"), az évek
-- száma pedig bár a UI-n valószínűleg egész számot kap, NUMERIC-ként rugalmasabb és
-- konzisztens a `paint_measurements.value`/`tires.*.mm` mezők típusválasztásával
-- (lásd korábbi migrációk).
alter table public.profiles
  add column paint_threshold_gyari_max_micron integer not null default 150,
  add column paint_threshold_ujrafujt_max_micron integer not null default 250,
  add column tire_age_warning_years numeric not null default 5,
  add column tire_tread_warning_mm numeric not null default 3;

comment on column public.profiles.paint_threshold_gyari_max_micron is
  'Festékvastagság-mérés "Gyári" felső küszöbe (µm) -- eddig 150 volt hardkódolva. Az ennél nagyobb, de a paint_threshold_ujrafujt_max_micron alatti érték "Újrafújt / Javított", afölött "Gittelt / Sérült" besorolást kap (lásd getPaintStatus()).';
comment on column public.profiles.paint_threshold_ujrafujt_max_micron is
  'Festékvastagság-mérés "Újrafújt / Javított" felső küszöbe (µm) -- eddig 250 volt hardkódolva. Az ennél nagyobb érték "Gittelt / Sérült" besorolást kap.';
comment on column public.profiles.tire_age_warning_years is
  '"Koros gumiabroncs" figyelmeztetés küszöbe években (DOT kódból számolt gyártási kor) -- eddig 5 volt hardkódolva (lásd decodeDot()).';
comment on column public.profiles.tire_tread_warning_mm is
  '"Kopott gumiabroncs" (profilmélység) figyelmeztetés küszöbe mm-ben -- ÚJ funkció, korábban egyáltalán nem létezett automatikus figyelmeztetés a profilmélységre (lásd isTreadWorn()). Alapérték 3 mm (tájékoztató jellegű, nem jogszabályi minimum -- az EU jogszabályi minimum 1.6 mm).';

-- Egyszerű józan-ész CHECK-ek -- a `/settings` UI is validál (gyári < újrafújt, minden
-- érték pozitív), de az adatbázis-szintű védelem akkor is megvéd egy nyilvánvalóan
-- hibás állapottól, ha valaki a jövőben közvetlenül (pl. SQL Editorral) írná az oszlopot.
alter table public.profiles
  add constraint profiles_paint_thresholds_positive_check
    check (paint_threshold_gyari_max_micron > 0 and paint_threshold_ujrafujt_max_micron > paint_threshold_gyari_max_micron),
  add constraint profiles_tire_thresholds_positive_check
    check (tire_age_warning_years > 0 and tire_tread_warning_mm >= 0);

-- -----------------------------------------------------------------------------
-- `get_public_report` RPC bővítése -- a 4 új küszöbérték a `company` jsonb objektum
-- részeként kerül a publikus (bejelentkezés nélküli) riportra, UGYANÚGY mint a
-- `primary_color`/`company_name` -- ez NEM érzékeny adat (nem személyes, nem
-- bizalmas üzleti adat), a publikus riport oldalon (`app/report/[public_token]/
-- page.tsx`) ebből épül fel a `TiresCard`/`PaintMap` kártyáknak átadott
-- `ReportThresholds` objektum, hogy a bejelentkezés nélküli ügyfél-riport
-- UGYANAZOKKAL a küszöbökkel jelenítse meg a "Gyári/Újrafújt/Gittelt" és a
-- "Koros/Kopott gumiabroncs" jelzéseket, mint amit a vizsgáló a wizardban látott.
-- A függvény törzse egyébként VÁLTOZATLAN, csak a 'company' jsonb_build_object 4 új
-- kulcsot kapott.
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
    )
  ) into v_result;

  return v_result;
end;
$function$;
