/**
 * Onboarding "tipp" (hint/tutorial) dismiss-állapot, `localStorage`-alapú, ugyanaz a
 * felépítés/hibakezelési elv, mint `lib/inspections/draftPersistence.ts`-nél (SSR-biztos
 * `typeof window` őrzés, csendes `try/catch`, egy sikertelen `localStorage` írás/olvasás
 * SOSE dobjon hibát, legfeljebb a tipp minden alkalommal újra megjelenik).
 *
 * **Mire való:** a wizard (`InspectionWizard.tsx`) 11 lépésének mindegyikén, és a
 * kiemelt AI-funkcióknál (VIN/forgalmi AI-szkennelés, AI diktálás, AI szakvélemény-írás,
 * mikrofon) egy-egy rövid, bezárható `HintCallout` (`components/onboarding/`) mutatja meg
 * ELŐSZÖR, mire való az adott vezérlő. Miután a felhasználó bezárt egy tippet, az adott
 * `id` SOHA többé nem jelenik meg, sem ugyanabban, sem egy jövőbeli vizsgálatban,
 * amíg a böngésző `localStorage`-a nem törlődik. Ez tehát böngészőnkénti/eszközönkénti
 * állapot, NEM szerver-oldali/fiókhoz kötött, ha a vizsgáló egy másik gépen jelentkezik
 * be, a tippeket ott újra látja. Ez a projekt jelenlegi kérése szerint (2026-08-10,
 * "Csak a hint, tutorial-ra van szükségem") szándékosan elegendő, nincs hozzá DB-migráció
 * vagy fiókhoz kötött állapot.
 */

const STORAGE_KEY = 'carpass:onboarding:dismissed-hints:v1';

/** Az összes eddig bezárt tipp `id`-jét adja vissza. SSR-en (vagy hibás/hiányzó
 * `localStorage` esetén) mindig üres halmazt ad, ilyenkor MINDEN tipp megjelenik,
 * ami a biztonságos alapértelmezés (inkább mutassuk meg feleslegesen, mint hogy egy
 * hibás olvasás miatt véglegesen elrejtsünk egy hasznos tippet). */
export function loadDismissedHints(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((entry): entry is string => typeof entry === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

/** Egyetlen tipp `id`-t jelöl bezártnak, a MÁR korábban bezárt id-ket megtartja
 * (`loadDismissedHints()`-tel újraolvasva), tehát nem írja felül a teljes listát. */
export function persistDismissedHint(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = loadDismissedHints();
    current.add(id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(current)));
  } catch {
    // Csendes hibakezelés, lásd a modul JSDoc-ját fent.
  }
}
