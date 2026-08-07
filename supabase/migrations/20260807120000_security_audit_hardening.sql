-- =============================================================================
-- Biztonsági audit -- SECURITY DEFINER segédfüggvények anonim elérésének szűkítése
-- (2026-08-07, "Security & Authorization Audit" lépés)
-- =============================================================================
-- A Supabase Security Advisor (`get_advisors`, type=security) 6 WARN-t jelzett:
-- a `current_user_organization_id()` / `current_user_role()` /
-- `current_user_can_view_all_reports()` / `is_platform_admin()` SECURITY DEFINER
-- segédfüggvények (lásd `20260803_organizations_rbac.sql` és
-- `20260803_platform_admin_entitlements.sql`) alapértelmezetten `PUBLIC`-nak
-- (tehát `anon` szerepkörnek IS) futtathatók a PostgREST `/rest/v1/rpc/...`
-- végponton keresztül -- ÚJONNAN létrehozott Postgres függvényeknél ez a
-- Postgres-alapértelmezett `GRANT EXECUTE ... TO PUBLIC` viselkedés, amit ezek a
-- migrációk eddig NEM írtak felül explicit `revoke`-kal.
--
-- **A tényleges kockázat ALACSONY** (nem adatszivárgás): mind a 4 függvény
-- KIZÁRÓLAG a HÍVÓ SAJÁT `auth.uid()`-jára vonatkozó információt ad vissza
-- (a saját szervezet-azonosítóját/szerepkörét/riport-láthatósági kapcsolóját/
-- platform-admin-e), `anon` (bejelentkezés nélküli) hívónál `auth.uid()` NULL,
-- tehát a válasz is NULL/false -- más felhasználó/szervezet adatát SOHA nem
-- lehet ezekkel lekérdezni. Ennek ellenére -- a PROJEKT_INSTRUKCIOK.md 3. pont
-- ("Adatszivárgás... TILTOTT") szigorú szellemében és a security advisor
-- ajánlása szerint -- feleslegesen NEM kell ezeknek a belső, kizárólag RLS
-- policy-kön belüli használatra szánt segédfüggvényeknek a nyilvános
-- (`anon`) PostgREST felületen elérhetőnek lenniük.
--
-- Ez a migráció `revoke execute ... from public`-kal, majd EXPLICIT
-- `grant execute ... to authenticated`-del szűkíti ezt a 4 függvényt --
-- az `authenticated` grant KRITIKUSAN szükséges marad, mert az `inspections`/
-- `profiles`/`user_credits`/`organizations` táblák RLS policy-i (`to authenticated`)
-- belül hívják ezeket (`using (organization_id = public.current_user_organization_id())`
-- stb.) -- enélkül a bejelentkezett felhasználók MINDEN lekérdezése eltörne.
--
-- A `get_public_report` és `check_and_increment_report_chat_usage` függvényeket
-- EZ A MIGRÁCIÓ SZÁNDÉKOSAN NEM ÉRINTI -- azok TERVEZETT, bejelentkezés NÉLKÜLI
-- (`anon`) publikus hozzáférésre szolgálnak (`/report/[public_token]` oldal),
-- az `anon`/`authenticated` EXECUTE grant-juk ott a helyes, szükséges viselkedés.
-- =============================================================================

-- MEGJEGYZÉS: a Supabase projekt alapból (`alter default privileges`) EXPLICIT
-- `anon`/`authenticated` EXECUTE grantot ad minden ÚJ `public` séma-beli
-- függvényre -- ez NEM a PUBLIC pseudo-role-on keresztül öröklődik, tehát a
-- `revoke ... from public` önmagában NEM elég, az `anon`-tól KÜLÖN, explicit
-- revoke szükséges (élesben ellenőrizve `pg_proc.proacl`-lel).

revoke execute on function public.current_user_organization_id() from public;
revoke execute on function public.current_user_organization_id() from anon;
grant execute on function public.current_user_organization_id() to authenticated;

revoke execute on function public.current_user_role() from public;
revoke execute on function public.current_user_role() from anon;
grant execute on function public.current_user_role() to authenticated;

revoke execute on function public.current_user_can_view_all_reports() from public;
revoke execute on function public.current_user_can_view_all_reports() from anon;
grant execute on function public.current_user_can_view_all_reports() to authenticated;

revoke execute on function public.is_platform_admin() from public;
revoke execute on function public.is_platform_admin() from anon;
grant execute on function public.is_platform_admin() to authenticated;
