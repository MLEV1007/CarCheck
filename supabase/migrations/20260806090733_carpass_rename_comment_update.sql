-- =============================================================================
-- Rendszernév-váltás: "CarCheck" -> "CarPass" (2026-08-06)
-- Csak dokumentációs célú `comment on` szövegek frissítése, séma-változás nincs.
-- =============================================================================

comment on table public.platform_admins is
  'A CarPass SaaS ÜZEMELTETŐI (nem egy autóvizsgáló cég Menedzsere!) -- explicit '
  'allow-list, kizárólag SQL-en/Supabase Dashboardon keresztül bővíthető. Nincs '
  'insert/update/delete RLS policy szándékosan -- az alkalmazásból SENKI nem tudja '
  'magát vagy mást platform adminná tenni.';

comment on column public.organizations.team_management_enabled is
  'A CarPass ÜZEMELTETŐJE (platform_admins) engedélyezi ügyfelenként -- ha false, a '
  'szervezet Menedzsere a Csapatkezelés fület zárolt állapotban látja, és a '
  'handle_new_user() trigger sem honorálja az ehhez a szervezethez szóló meghívó-linket.';
