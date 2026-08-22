import { createClient } from '@/lib/supabase/server';
import { getUserRoleContext } from '@/lib/auth/roles';

/**
 * "1 AI kredit = 1 vizsgálat", claim-alapú AI-hozzáférés segédmodul (2026-08-06).
 *
 * Korábban mind az 5 `/api/ai/*` route (`scan-vin`/`parse-equipment`/`generate-summary`/
 * `scan-service-doc`/`fix-grammar`) MINDEN egyes sikeres hívás után önállóan levont 1-1
 * egységet a szervezet AI-keretéből (`lib/credits.ts` `deductCredits` + `lib/quotas.ts`
 * `consumeAiQuota`), egy vizsgálat, amit a szaki 4-5 különböző AI-funkcióval segített
 * (VIN-szkennelés, szervizkönyv-beolvasás, felszereltség-diktálás, összefoglaló-generálás),
 * ténylegesen 4-5 egységet fogyasztott.
 *
 * Az ÚJ modell: egy VIZSGÁLAT (nem egy AI-HÍVÁS) az elszámolási egység, az adott
 * vizsgálaton az ELSŐ sikeres AI-hívás vonja le az 1 egységet, utána a vizsgálat MINDEN
 * további AI-hívása (bármelyik az 5 funkció közül) ingyenes. Ezt a `inspection_ai_credit_usage`
 * tábla (lásd `supabase/migrations/20260806_inspection_ai_credit_usage.sql`) egyetlen sora
 * jelzi vizsgálatonként.
 *
 * **Használati minta minden `/api/ai/*` route-ban** (a Gemini-hívás KÖRÜL):
 * ```ts
 * const alreadyClaimed = await hasInspectionClaimedAiCredit(user.id, inspectionId);
 * if (!alreadyClaimed) {
 *   // Csak akkor kell a szervezet keretét ellenőrizni, ha ez a vizsgálat MÉG nem "AI-aktív".
 *   const hasCredits = await hasEnoughCredits(user.id, 1);
 *   if (!hasCredits) return 402 INSUFFICIENT_CREDITS;
 *   const hasAiQuota = await checkAiQuota(user.id);
 *   if (!hasAiQuota) return 402 INSUFFICIENT_AI_QUOTA;
 * }
 * // ... Gemini-hívás ...
 * // Sikeres, validált válasz UTÁN:
 * if (!alreadyClaimed) {
 *   const wonClaim = await claimInspectionAiCredit(user.id, inspectionId);
 *   if (wonClaim) {
 *     await deductCredits(user.id, FEATURE_NAME, 1);
 *     await consumeAiQuota(user.id);
 *   }
 *   // wonClaim === false: egy PÁRHUZAMOS kérés időközben (ugyanerre a vizsgálatra) már
 *   // megnyerte a claimet, ez a hívás ingyenes, NEM vonunk le semmit.
 * }
 * ```
 *
 * **Race-condition kezelés:** a `claimInspectionAiCredit` egy atomikus `INSERT`-et próbál
 * az `inspection_ai_credit_usage` táblába, aminek `inspection_id` az elsődleges kulcsa,
 * két, majdnem egyidejű, ugyanarra a vizsgálatra irányuló sikeres AI-hívás közül a Postgres
 * garantáltan csak az EGYIK insertet engedi át, a másik `23505` (unique_violation) hibát kap.
 * Ez PONTOSAN ugyanaz a "DB-szintű egyedi kulcs dönt a versenyhelyzetben" elv, mint amit a
 * `deduct_credits`/`consume_ai_quota` RPC-k `for update` sor-zárolása biztosít a
 * kredit-/kvóta-levonásnál (lásd `lib/credits.ts`/`lib/quotas.ts`), itt nem kell külön RPC,
 * mert maga az egyedi kulcs az arbiter.
 *
 * A claim SZÁNDÉKOSAN a sikeres Gemini-válasz UTÁN történik (nem előtte), ugyanaz az elv,
 * mint a meglévő kredit-levonásnál: egy sikertelen/hibás AI-hívás ne "égesse el" a vizsgálat
 * 1 kreditjét.
 *
 * NINCS FK az `inspections.id`-ra a claim-táblán, lásd a migráció JSDoc-ját: az első
 * AI-hívás (pl. VIN-szkennelés a wizard 1. lépésében) megelőzheti a vizsgálat első mentését.
 */

/** Feloldja a hívó user `organization_id`-ját, ugyanaz a minta, mint `lib/credits.ts`
 * `resolveOrganizationId`-je. */
async function resolveOrganizationId(userId: string): Promise<string> {
  const context = await getUserRoleContext(userId);
  if (!context) {
    throw new Error('Nem sikerült feloldani a felhasználó szervezetét.');
  }
  return context.organizationId;
}

/**
 * Igaz, ha a megadott vizsgálat MÁR "kifizette" az AI-hozzáférését (volt már rajta korábban
 * sikeres AI-hívás), ha igaz, a hívó route-nak NEM kell a szervezet kredit-/kvóta-keretét
 * ellenőriznie, a Gemini-hívás mehet a keret állapotától függetlenül.
 *
 * **Szigorúan "fail-closed", UGYANAZ a minta, mint `hasEnoughCredits`/`checkAiQuota`:**
 * BÁRMILYEN hiba esetén (DB/hálózat/RLS/hiányzó szervezet) `false`-t ad vissza, ez a
 * BIZTONSÁGOS irány, mert `false` esetén a hívó route a normál (keret-ellenőrzős) útra esik
 * vissza, SOSE enged át egy AI-hívást tévesen "ingyenesnek" hitt bizonytalan állapotban.
 */
export async function hasInspectionClaimedAiCredit(userId: string, inspectionId: string): Promise<boolean> {
  try {
    const organizationId = await resolveOrganizationId(userId);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('inspection_ai_credit_usage')
      .select('inspection_id')
      .eq('inspection_id', inspectionId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) {
      console.error('[hasInspectionClaimedAiCredit] Hiba a claim-státusz lekérése közben, fail-closed:', error);
      return false;
    }

    return Boolean(data);
  } catch (error) {
    console.error('[hasInspectionClaimedAiCredit] Váratlan hiba, fail-closed:', error);
    return false;
  }
}

/**
 * Megpróbálja atomikusan "lefoglalni" a vizsgálat AI-kreditjét, `true`-t ad vissza, ha EZ
 * a hívás nyerte a claimet (a hívónak ezután le KELL vonnia az 1 kreditet/kvótát), `false`-t,
 * ha a claim MÁR létezett (akár egy korábbi, akár egy párhuzamosan időközben lefutott hívás
 * miatt), ilyenkor a hívó NE vonjon le semmit, ez a hívás ingyenes.
 *
 * Kizárólag sikeres, validált AI-válasz UTÁN hívandó, lásd a fájl tetején lévő JSDoc
 * "Használati minta" szakaszát.
 */
export async function claimInspectionAiCredit(userId: string, inspectionId: string): Promise<boolean> {
  const organizationId = await resolveOrganizationId(userId);
  const supabase = await createClient();

  const { error } = await supabase
    .from('inspection_ai_credit_usage')
    .insert({ inspection_id: inspectionId, organization_id: organizationId });

  if (!error) {
    return true;
  }

  // 23505 = unique_violation (Postgres), a claim már létezett, egy másik hívás nyerte.
  // Ez a VÁRT, normális versenyhelyzet-kimenetel, nem hiba, csendben `false`-t adunk vissza.
  if (error.code === '23505') {
    return false;
  }

  // Bármilyen MÁS hiba (RLS/hálózat/váratlan DB-hiba) esetén, a `deductCredits`/
  // `consumeAiQuota` "best-effort, csak logolva" elvét követve itt sem dobunk kivételt a
  // hívó route felé (a felhasználó a MÁR lefutott, sikeres AI-válaszért cserébe jogosan
  // kapja meg az eredményt, még ha a claim-könyvelés emiatt pontatlan is marad), de mivel
  // ez a függvény `boolean`-t ad vissza, itt logolunk és `false`-t adunk, hogy a hívó NE
  // vonjon le duplán egy esetleg részlegesen sikerült írás után.
  console.error('[claimInspectionAiCredit] Váratlan hiba a claim beszúrása közben:', error);
  return false;
}
