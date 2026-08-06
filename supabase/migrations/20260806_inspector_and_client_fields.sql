-- =============================================================================
-- Átvizsgáló és Ügyfél adatok + PDF megjelenítési kapcsolók (toggles)
-- =============================================================================
-- Feladat-specifikáció: "Átvizsgáló és Ügyfél adatok rögzítése + PDF megjelenítési
-- kapcsolók" -- az `inspections` tábla 6 új oszloppal bővül:
--   1) `inspector_id`  -- a vizsgálatot ténylegesen elvégző szakember (`auth.users`),
--      a wizard mentéskor automatikusan a bejelentkezett userre állítja (lásd
--      `InspectionWizard.tsx` `handleSubmit`). SZÁNDÉKOSAN KÜLÖN mező a meglévő
--      `created_by`-tól (lásd `20260803_organizations_rbac.sql`, Szervezeti RBAC) --
--      a `created_by` a szervezeten belüli RLS-láthatóság (ki férhet hozzá a sorhoz)
--      forrása, az `inspector_id` ezzel szemben KIZÁRÓLAG megjelenítési/riport célú
--      (ki neve szerepeljen a publikus riporton "Átvizsgálást végezte" néven) -- a két
--      mező jelenleg gyakorlatilag mindig megegyezik (mindkettő a mentő userre áll),
--      de a jövőben eltérhetnek (pl. egy Menedzser rögzíti utólag egy Inspector
--      helyett a vizsgálatot), ezért NEM vonjuk össze őket.
--   2) `client_name`/`client_phone`/`client_email` -- a Megrendelő (autó tulajdonosa/
--      megbízója) szabadon kitölthető elérhetőségi adatai, mindhárom opcionális TEXT.
--   3) `show_inspector_on_pdf` (default TRUE) / `show_client_on_pdf` (default FALSE) --
--      a wizard "Összegzés & Publikálás" lépésén elhelyezett 2 kapcsoló (toggle
--      switch) állapota, ami a publikus riporton (`/report/[public_token]`, ami a
--      "Nyomtatás / PDF" gombbal ténylegesen a kinyomtatott/PDF-mentett dokumentum is)
--      az Átvizsgáló, illetve a Megrendelő blokk láthatóságát vezérli. A
--      `show_client_on_pdf` alapértelmezetten FALSE, mert a Megrendelő elérhetőségei
--      (telefon/email) személyes adatok -- csak akkor kerüljenek a (bejelentkezés
--      nélkül BÁRKI által megnyitható) publikus linkre, ha a vizsgáló ezt kifejezetten
--      bekapcsolja. Az `show_inspector_on_pdf` alapértelmezetten TRUE, mert az
--      Átvizsgáló neve a legtöbb valós használati esetben elvárt, bizalomépítő elem
--      egy szakértői riporton.
--
-- Nincs szükség új RLS policy-ra: mind a 6 oszlop a MEGLÉVŐ `inspections` sor
-- részeként öröklődik, a `20260803_organizations_rbac.sql`-ben definiált sor-szintű
-- (`organization_id`/`created_by` alapú) SELECT/INSERT/UPDATE/DELETE policy-k
-- oszlop-függetlenül már lefedik őket.
-- =============================================================================

alter table public.inspections
  add column inspector_id uuid references auth.users(id) on delete set null,
  add column client_name text,
  add column client_phone text,
  add column client_email text,
  add column show_inspector_on_pdf boolean not null default true,
  add column show_client_on_pdf boolean not null default false;

comment on column public.inspections.inspector_id is
  'A vizsgálatot ténylegesen elvégző szakember -- megjelenítési célú (publikus riport "Átvizsgálást végezte" blokk), a mentéskor automatikusan a bejelentkezett userre áll. Szándékosan külön mező a szervezeti RLS-t szolgáló created_by-tól.';
comment on column public.inspections.client_name is 'Megrendelő (autó tulajdonosa/megbízója) neve -- opcionális, a wizard "Megrendelő adatai" blokkjából.';
comment on column public.inspections.client_phone is 'Megrendelő telefonszáma -- opcionális.';
comment on column public.inspections.client_email is 'Megrendelő e-mail címe -- opcionális.';
comment on column public.inspections.show_inspector_on_pdf is 'A publikus riporton (PDF) megjelenjen-e az Átvizsgáló neve -- alapértelmezetten igen.';
comment on column public.inspections.show_client_on_pdf is 'A publikus riporton (PDF) megjelenjenek-e a Megrendelő elérhetőségi adatai -- alapértelmezetten NEM (személyes adat, csak explicit bekapcsolásra kerül a bejelentkezés nélkül elérhető linkre).';

-- -----------------------------------------------------------------------------
-- `get_public_report` RPC bővítése -- a fenti 6 mező publikus riportnak szánt
-- kivetítése. A `client_*` mezőket és az `inspector_name`-et SZÁNDÉKOSAN a
-- megfelelő `show_*_on_pdf` kapcsoló SZERVER OLDALI ellenőrzésével adjuk vissza
-- (nem csak a kliens UI rejti el őket) -- így egy kikapcsolt kapcsolónál a
-- Megrendelő telefonszáma/e-mail címe a hálózati válaszban SEM szerepel, ha valaki
-- közvetlenül a böngésző fejlesztői eszközeivel vizsgálná a `get_public_report`
-- hívás JSON válaszát (lásd PROJEKT_INSTRUKCIOK.md 3. pont, "Adatszivárgás... TILTOTT").
-- Az `inspector_name` az `auth.users.raw_user_meta_data`-ból származik (Google
-- OAuth-tal regisztrált usereknél `full_name`/`name` mező) -- Magic Link/jelszó
-- nélküli regisztrációnál ez hiányozhat, ilyenkor az e-mail cím "@" előtti része a
-- fallback, hogy a blokk sose maradjon teljesen név nélkül, ha be van kapcsolva.
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
        when v_inspection.show_inspector_on_pdf and v_inspection.inspector_id is not null then (
          select coalesce(
            nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
            nullif(trim(u.raw_user_meta_data->>'name'), ''),
            split_part(u.email, '@', 1)
          )
          from auth.users u
          where u.id = v_inspection.inspector_id
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
