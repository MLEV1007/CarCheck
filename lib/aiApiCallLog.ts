import { createClient } from '@/lib/supabase/server';
import { getUserRoleContext } from '@/lib/auth/roles';

/**
 * "Minden AI API hívás naplózása" -- Platform Admin láthatóság segédmodul (2026-08-17).
 *
 * Kérés (Levi): a `/admin` felületen lássa fiókonként/szervezetenként, hány AI API hívás
 * történt, és melyik Gemini modellnek. Ez KÜLÖNBÖZIK a meglévő "1 AI-kredit = 1 vizsgálat"
 * elszámolástól (lásd `lib/inspectionAiCredit.ts`) -- az csak vizsgálatonként az ELSŐ
 * sikeres hívást vonja le a szervezet kreditjéből, ez a modul viszont MINDEN egyes
 * ténylegesen megtörtént `ai.models.generateContent()` próbálkozást naplóz (sikereset ÉS
 * sikertelent is), modellnevenként -- tisztán megjelenítési/megfigyelési célra
 * (`ai_api_calls` tábla, lásd `supabase/migrations/20260817000000_ai_api_calls_admin_usage_tracking.sql`).
 *
 * **Használati minta minden `/api/ai/*` route-ban** (a Gemini-hívás fallback-lánca UTÁN,
 * FÜGGETLENÜL attól, hogy a válasz később átment-e az app-szintű JSON-validáción --
 * ez a napló a Google felé TÉNYLEGESEN megtörtént API-hívásokat tükrözi, nem a mi
 * validációnk kimenetét):
 * ```ts
 * await logAiApiCall(user.id, FEATURE_NAME, usedModel ?? MODEL_CANDIDATES[0], succeeded);
 * ```
 *
 * **Szigorúan "best-effort, sosem dob hibát a hívó route felé"** -- ugyanaz az elv, mint
 * `deductCredits`/`consumeAiQuota`-nál: ez egy tisztán megfigyelési mellékhatás, a
 * felhasználó által kért, MÁR lefutott AI-válasz kiszolgálását egy naplózási hiba (DB-hiba,
 * hálózat, RLS) SOHA nem akaszthatja meg -- minden hibát elnyel/logol.
 */
export async function logAiApiCall(
  userId: string,
  featureName: string,
  model: string,
  success: boolean
): Promise<void> {
  try {
    const context = await getUserRoleContext(userId);
    if (!context) return;

    const supabase = await createClient();
    const { error } = await supabase.rpc('log_ai_api_call', {
      p_organization_id: context.organizationId,
      p_user_id: userId,
      p_feature_name: featureName,
      p_model: model,
      p_success: success,
    });

    if (error) {
      console.error('[logAiApiCall] Naplózás sikertelen (a hívó AI-válasz ettől függetlenül visszaadva):', error);
    }
  } catch (error) {
    console.error('[logAiApiCall] Váratlan hiba a naplózás közben:', error);
  }
}

/**
 * Ugyanaz, mint `logAiApiCall`, de a PUBLIKUS (bejelentkezés nélküli) riport AI chat
 * (`/api/report-chat`) hívásaihoz -- nincs `userId`/`organizationId`, amit a hívó
 * ismerne, ezért a `log_public_report_ai_api_call` RPC-t hívjuk, ami a szervezetet a
 * `public_token`-ből resolválja szerver-oldalon (lásd a migráció JSDoc-ját). Ugyanúgy
 * best-effort, sosem dob hibát.
 */
export async function logPublicReportAiApiCall(
  token: string,
  model: string,
  success: boolean,
  usedCache: boolean = false
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('log_public_report_ai_api_call', {
      p_token: token,
      p_model: model,
      p_success: success,
      p_used_cache: usedCache,
    });

    if (error) {
      console.error('[logPublicReportAiApiCall] Naplózás sikertelen:', error);
    }
  } catch (error) {
    console.error('[logPublicReportAiApiCall] Váratlan hiba a naplózás közben:', error);
  }
}
