-- =============================================================================
-- Fiók törlés -- biztonságos idegenkulcsok (2026-08-04)
-- =============================================================================
-- Előzmény: a felhasználó egy önkiszolgáló "Fiók törlése" funkciót kért a
-- Beállításokba, KIFEJEZETT feltétellel, hogy az átnézett autók (inspections/
-- paint_measurements/defects) adatai a fióktörléssel NE vesszenek el.
--
-- Fióktörlés a Supabase Auth-ban KIZÁRÓLAG a service-role admin API-val
-- (`auth.admin.deleteUser()`) végezhető el -- ez ténylegesen töröl egy sort az
-- `auth.users` táblából, ami a rá mutató idegenkulcsok `ON DELETE` szabálya
-- szerint viselkedik.
--
-- KRITIKUS FELFEDEZÉS ennél a lépésnél: a `execute_sql`-lel lekérdezett ÉLES séma
-- (`pg_constraint`) szerint HÁROM tábla ŐRZI a 2026-08-03 előtti, "1 user = 1 cég"
-- korszakból származó `user_id` oszlopot -- `inspections.user_id`,
-- `paint_measurements.user_id`, `defects.user_id` --, MINDHÁROM
-- `ON DELETE CASCADE`-del `auth.users(id)`-re mutatva! Ez azt jelentette, hogy egy
-- `auth.admin.deleteUser()` hívás AZONNAL, VISSZAVONHATATLANUL törölte volna az
-- adott user MINDEN vizsgálatát (és az azokhoz tartozó paint_measurements/defects
-- sorokat, hiszen azok `inspection_id`-je is CASCADE) -- pontosan azt, amit a
-- felhasználó kifejezetten megtiltott. Ugyanez igaz volt az
-- `inspections.created_by` oszlopra is (bár az `ON DELETE` szabály nélkül,
-- vagyis `NO ACTION` -- ez viszont EGYSZERŰEN MEGHIÚSÍTOTTA volna magát a
-- törlést egy idegenkulcs-hiba miatt, ha a usernek volt már vizsgálata).
--
-- Ez a migráció mind az 5 érintett idegenkulcsot (`inspections.user_id`,
-- `inspections.created_by`, `paint_measurements.user_id`, `defects.user_id`,
-- `usage_logs.user_id`) `ON DELETE SET NULL`-ra cseréli (a hozzájuk tartozó
-- oszlopokat NULL-ozhatóvá téve) -- így egy fióktörlés után a SOROK VÁLTOZATLANUL
-- megmaradnak (`organization_id` érintetlen, tehát a cég/csapat továbbra is látja
-- őket a meglévő org-alapú RLS policy-k szerint), csak a törölt userre mutató
-- referencia válik NULL-lá. Az `inspections`/`paint_measurements`/`defects` SELECT
-- RLS policy-k (`20260803_organizations_rbac.sql`) az `organization_id`/
-- `created_by`/szerepkör alapján döntenek, NEM a `user_id` oszlopon, tehát ez a
-- csere a láthatóságot nem érinti. Az INSERT/UPDATE/DELETE policy-k a `user_id`/
-- `created_by` = `auth.uid()` egyezést a MEGLÉVŐ (nem törölt) felhasználóknál
-- továbbra is valós UUID-vel ellenőrzik -- a nullázhatóság csak a törölt userek
-- RÉGI sorait érinti, az aktív írásokat nem.
--
-- `usage_logs.user_id` -> `ON DELETE SET NULL`-ra cserélve ugyanezen elv szerint,
-- hogy a szervezet AI-kredit felhasználási AUDIT-előzménye (`usage_logs`) se
-- vesszen el egy csapattag fióktörlésekor -- ez nem volt szó szerint kérve, de
-- ugyanabba a kategóriába tartozik ("egy ember távozása ne törölje a cég
-- adatait"), és a migráció úgyis itt jár ezen a táblán.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- inspections.user_id (legacy, "1 user = 1 cég" korszakból) -- CASCADE -> SET NULL
-- -----------------------------------------------------------------------------
alter table public.inspections drop constraint inspections_user_id_fkey;
alter table public.inspections alter column user_id drop not null;
alter table public.inspections
  add constraint inspections_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- -----------------------------------------------------------------------------
-- inspections.created_by (az aktuális, org-alapú tulajdonos-mező) -- NO ACTION
-- (ami MEGHIÚSÍTOTTA volna a törlést) -> SET NULL
-- -----------------------------------------------------------------------------
alter table public.inspections drop constraint inspections_created_by_fkey;
alter table public.inspections alter column created_by drop not null;
alter table public.inspections
  add constraint inspections_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- -----------------------------------------------------------------------------
-- paint_measurements.user_id (legacy) -- CASCADE -> SET NULL
-- -----------------------------------------------------------------------------
alter table public.paint_measurements drop constraint paint_measurements_user_id_fkey;
alter table public.paint_measurements alter column user_id drop not null;
alter table public.paint_measurements
  add constraint paint_measurements_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- -----------------------------------------------------------------------------
-- defects.user_id (legacy) -- CASCADE -> SET NULL
-- -----------------------------------------------------------------------------
alter table public.defects drop constraint defects_user_id_fkey;
alter table public.defects alter column user_id drop not null;
alter table public.defects
  add constraint defects_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- -----------------------------------------------------------------------------
-- usage_logs.user_id -- CASCADE -> SET NULL (audit-előzmény megőrzése)
-- -----------------------------------------------------------------------------
alter table public.usage_logs drop constraint usage_logs_user_id_fkey;
alter table public.usage_logs alter column user_id drop not null;
alter table public.usage_logs
  add constraint usage_logs_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;
