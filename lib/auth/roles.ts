import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { OrganizationRole } from '@/types/credits';

/**
 * Szervezeti szerepkör-kontextus (PROJEKT_INSTRUKCIOK.md "Szervezeti szerepkezelés"
 * lépés), minden Server Component/route handler, amelynek tudnia kell a bejelentkezett
 * user szervezetét/szerepkörét (fejléc kredit-jelvény elrejtése, Csapatkezelés fül,
 * Dashboard riport-lekérdezés, `/api/stripe/*` védelem), ezt a helpert használja a
 * kódduplikáció elkerülésére.
 */
export interface UserRoleContext {
  organizationId: string;
  role: OrganizationRole;
  canViewAllReports: boolean;
}

/**
 * Lekéri a bejelentkezett user `profiles` sorából a szervezeti kontextust, a request-
 * hatókörű, cookie-alapú Supabase klienssel (`lib/supabase/server.ts`), tehát a hívó
 * SAJÁT RLS-jogosultságával fut (a `profiles_select_own` policy mindig engedi a saját
 * sor olvasását, függetlenül a szerepkörtől). `null`-t ad vissza, ha a profil-sor
 * valamiért nem található (nem várt, defenzíven kezelt eset).
 */
export async function getUserRoleContext(userId: string): Promise<UserRoleContext | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('organization_id, role, can_view_all_reports')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data || !data.organization_id) {
    return null;
  }

  const role: OrganizationRole = data.role === 'inspector' ? 'inspector' : 'manager';

  return {
    organizationId: data.organization_id,
    role,
    canViewAllReports: Boolean(data.can_view_all_reports),
  };
}

/**
 * Pénzügyi/előfizetés-kezelő végpontok védelme (PROJEKT_INSTRUKCIOK.md "Pénzügyi
 * Végpontok Védelme" lépés): "Az `/api/stripe/*` útvonalak azonnal dobjanak `403
 * Forbidden` hibát, ha `role !== 'manager'`." A projektben JELENLEG még nincs egyetlen
 * `/api/stripe/*` route SEM (a Stripe checkout/webhook integráció külön, jövőbeli lépés,
 * lásd status.md "Következő lépés"), ez a guard előre elkészítve várja azt a lépést,
 * hogy amint az első ilyen route létrejön, egyetlen hívással bedrótozható legyen:
 *
 * ```ts
 * const guard = await requireManager();
 * if (guard) return guard; // 401 vagy 403 NextResponse, a route itt return-öl
 * ```
 *
 * `null`-t ad vissza, ha a hívó bejelentkezett Menedzser (a route folytathatja).
 */
export async function requireManager(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: 'A művelethez bejelentkezés szükséges.', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  const context = await getUserRoleContext(user.id);

  if (!context || context.role !== 'manager') {
    return NextResponse.json(
      { success: false, error: 'Ehhez a művelethez Menedzser jogosultság szükséges.', code: 'FORBIDDEN' },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Platform Admin (2026-08-03, "Platform Admin + Csapatkezelés-entitlement" lépés),
 * ÚJ, a szervezetek FÖLÖTTI szerepkör: a CarPass SaaS ÜZEMELTETŐJE (nem egy
 * autóvizsgáló cég Menedzsere!), aki a `/admin` felületen dönti el, melyik ÜGYFÉL
 * (szervezet) kap Menedzser-szintű csapatkezelést (`organizations.
 * team_management_enabled`). A `platform_admins` tábla explicit allow-list,
 * KIZÁRÓLAG SQL-en/Supabase Dashboardon keresztül bővíthető (nincs insert/update RLS
 * policy rajta), hogy egy alkalmazás-szintű hiba se tudjon valakit önmagát platform
 * adminná léptetni. Lásd `supabase/migrations/20260803_platform_admin_entitlements.sql`.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return true;
}
