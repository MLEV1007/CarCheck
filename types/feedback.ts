export type FeedbackCategory = 'bug' | 'feature' | 'other';

/**
 * A saját, pillekönnyű in-app visszajelző modal (`components/feedback/FeedbackModal.tsx`)
 * kategória-választójának címkéi -- UGYANEZEK a Notion "Category" select property opciói
 * is (lásd `app/api/feedback/route.ts` + `docs/notion-feedback-widget-setup-2026-08-22.md`),
 * hogy a kliens és a szerver EGYETLEN forrásból dolgozzon, a két oldal szövegezése sose
 * térhessen el egymástól. Ha itt egy címkét megváltoztatsz, a Notion adatbázis "Category"
 * select property opciójának NEVÉT is ugyanerre kell átnevezni (lásd a docs fájlt).
 */
export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: 'Hiba (Bug)',
  feature: 'Új funkció (Feature)',
  other: 'Egyéb',
};

export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = ['bug', 'feature', 'other'];

/**
 * A `FeedbackModal.tsx` (kliens) és az `app/api/feedback/route.ts` (szerver) közötti
 * megosztott alak -- a kliens ezt a JSON-t POST-olja a `/api/feedback` végpontra.
 *
 * `userId`/`userEmail`: a kliens elküldi (lásd `FeedbackModal.tsx`), DE a szerver a
 * `userId`-t SOSEM a body-ból, hanem a hitelesített Supabase session-ből olvassa (lásd a
 * route JSDoc-ját) -- ne bízzunk azonosításra kliens-oldali payloadban. Az email-t a
 * szerver a body-ból fogadja el elsődlegesen (fallback a session `user.email`-jére),
 * mert ez kizárólag a Notion lap egy megjelenítő mezője, nem azonosítás.
 */
export interface FeedbackSubmitPayload {
  category: FeedbackCategory;
  description: string;
  imageUrl: string | null;
  userEmail: string | null;
  userId: string;
}
