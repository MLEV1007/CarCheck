-- =============================================================================
-- Platform admin csere: test@buildmysite.hu (2026-08-11)
-- =============================================================================
-- Kérés (Levi): a CarPass üzemeltetői fiók (`platform_admins`, lásd
-- `20260803_platform_admin_entitlements.sql`) mostantól `test@buildmysite.hu` legyen,
-- a `manyilevente@gmail.com` fiók NE legyen platform admin.
--
-- Élesben ellenőrizve (Supabase MCP `execute_sql`) a futtatás ELŐTT: a `platform_admins`
-- tábla ÜRES volt -- a `20260803_platform_admin_entitlements.sql` migráció seed-sora
-- (`manyilevente@gmail.com` felvétele) ténylegesen NEM futott le/érvényesült ezen a
-- projekten (vagy azóta törölték), tehát ez a lépés facto módon is az ELSŐ tényleges
-- platform admin beállítás volt, nem csere.
--
-- Mindkét irányban idempotens (DELETE + INSERT ... ON CONFLICT DO NOTHING) -- ha a
-- migráció véletlenül kétszer futna le, nincs hibás állapot.
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-
-- követés célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével lett
-- közvetlenül az éles projektre alkalmazva (nincs helyi Supabase CLI/
-- `supabase db push` munkafolyamat), ez a fájl UGYANEZT az SQL-t tartalmazza.
-- =============================================================================

delete from public.platform_admins
where user_id in (select id from auth.users where email = 'manyilevente@gmail.com');

insert into public.platform_admins (user_id)
select id from auth.users where email = 'test@buildmysite.hu'
on conflict (user_id) do nothing;
