-- =============================================================================
-- Illetéktelen /admin hozzáférési kísérletek naplózása + riasztás alapja (2026-08-11)
-- =============================================================================
-- Kérés (Levi, a security audit "Nincs naplózás/riasztás" pontjára): amikor egy
-- bejelentkezett, DE NEM platform admin user megpróbálja betölteni a /admin felületet,
-- ez kerüljön naplózásra, ÉS küldjön a rendszer emailt a test@buildmysite.hu címre --
-- lásd `app/admin/page.tsx` "Hozzáférés megtagadva" ágát + `lib/adminAlerts.ts`.
--
-- Csak SELECT policy van (platform_admin-nak, kézi/jövőbeli review célra) -- a sorokat
-- KIZÁRÓLAG a szerver-oldali, service-role admin kliens (`lib/supabase/admin.ts`) írja
-- (`app/admin/page.tsx` -> `notifyUnauthorizedAdminAccess`), ez RLS-t megkerülve fut,
-- tehát szándékosan NINCS insert/update/delete policy `authenticated`-nek -- egy
-- "elutasított" user semmilyen API-hívással nem tudna saját maga helyett hamis sort
-- beszúrni/törölni ebbe a naplóba.
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-követés
-- célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével lett közvetlenül
-- az éles projektre (`nsejmkcwvksbwxscvrvb`) alkalmazva, ez a fájl UGYANEZT az SQL-t
-- tartalmazza.
-- =============================================================================

create table public.admin_access_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  attempted_at timestamptz not null default now(),
  alert_email_sent boolean not null default false
);

comment on table public.admin_access_attempts is
  'Audit-napló: mikor próbálta egy NEM platform admin user betölteni a /admin felületet '
  '(app/admin/page.tsx "Hozzáférés megtagadva" ága). alert_email_sent csak akkor true, '
  'ha ehhez a sorhoz TÉNYLEGESEN sikerült riasztó emailt küldeni (lib/adminAlerts.ts a '
  'throttle-elt kísérleteknél is beszúr egy sort false-szal, de nem küld emailt).';

alter table public.admin_access_attempts enable row level security;

create index admin_access_attempts_user_id_attempted_at_idx
  on public.admin_access_attempts (user_id, attempted_at desc);

create policy admin_access_attempts_select_platform_admin
  on public.admin_access_attempts for select
  to authenticated
  using (public.is_platform_admin());
