'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const environmentId = process.env.NEXT_PUBLIC_FORMBRICKS_ENVIRONMENT_ID;
const appUrl = process.env.NEXT_PUBLIC_FORMBRICKS_API_HOST;

/**
 * Formbricks in-app visszajelzés-widget -- a tényleges SDK-hívó logika (2026-08-20,
 * "Formbricks visszajelzés-widget" lépés, lásd
 * docs/formbricks-feedback-widget-elemzes-2026-08-20.md 6. pontját). Csak a
 * `FormbricksProvider.tsx`-en keresztül, `next/dynamic({ ssr: false })`-dal
 * mountolódik, kizárólag védett útvonalakon (lásd `lib/formbricks/protectedPrefixes.ts`)
 * -- tehát sosem fut szerveren, és a bundle-je sem töltődik le a publikus
 * landing/login/register/riport oldalakon.
 *
 * FONTOS -- API-verzió (`@formbricks/js` 5.0.0, ellenőrizve a telepített csomag
 * `dist/types/formbricks.d.ts`-éből): NINCS egységes `identify()` metódus, a
 * felhasználó azonosítása külön `setUserId()` + `setEmail()` hívással történik.
 *
 * `environmentId` (NEM `workspaceId`) -- 2026-08-20 este VISSZAÁLLÍTVA: a `setup()`
 * `environmentId` mezője a csomagban DEPRECATED a `workspaceId` javára, de a Vercel
 * Environment Variables között MÁR beállított, éles változó neve
 * `NEXT_PUBLIC_FORMBRICKS_ENVIRONMENT_ID` -- a kód ehhez a TÉNYLEGESEN beállított
 * névhez igazodik (a `workspaceId` mező technikailag ugyanúgy működne, de az azzal járó
 * env var átnevezés a Vercelen felesleges plusz lépés lenne).
 *
 * **`setUserId`/`setEmail` ELTÁVOLÍTVA (2026-08-20, éles konzol-hiba alapján):** a
 * felhasználó éles konzoljában minden auth-állapotváltáskor megjelent egy 403-as hiba:
 * `"Failed to send updates: User identification is only available for enterprise
 * users."` -- a Formbricks Cloud **Hobby (ingyenes) csomagja NEM támogatja a
 * felhasználó-azonosítást** (`setUserId`/`setEmail`), ez kizárólag Enterprise
 * előfizetéssel érhető el. A hívás emiatt a hoszted API-n mindig elbukott, feleslegesen
 * zajos hibaüzeneteket generált minden oldalbetöltésen/bejelentkezésen -- eltávolítva.
 * A visszajelzések így NÉVTELENÜL (Formbricks-oldali session-azonosítóval) érkeznek,
 * ami az eredeti követelménynek ("a visszajelzések legyenek privátak, csak az admin
 * látja") továbbra is megfelel. Ha később szükség lenne arra, hogy a visszajelzéshez a
 * beküldő felhasználó/email is társuljon, az csak a Formbricks Cloud előfizetés
 * Enterprise szintre emelésével lehetséges -- addig ezt a két hívást ne állítsd vissza.
 */
export default function FormbricksClient() {
  const pathname = usePathname();
  const isInitialized = useRef(false);

  // 1) Egyszeri setup -- csak kliensen, csak egyszer.
  useEffect(() => {
    if (!environmentId || !appUrl) {
      console.warn('[Formbricks] Hiányzó NEXT_PUBLIC_FORMBRICKS_* env változó, a widget kikapcsolva.');
      return;
    }
    if (isInitialized.current) return;
    isInitialized.current = true;

    import('@formbricks/js')
      .then(({ default: formbricks }) => formbricks.setup({ environmentId, appUrl }))
      .catch((error) => console.error('[Formbricks] setup() hiba:', error));
  }, []);

  // 2) Kijelentkezés -- a widget lokális (böngésző-oldali) session-állapotát nullázzuk,
  // hogy egy közösen használt céges tableten (pl. a műhelyben) a következő bejelentkező
  // user NE a korábbi böngészési session válaszfolyamába kerüljön bele. (Felhasználó-
  // azonosítás -- `setUserId`/`setEmail` -- NEM történik itt, lásd a fenti JSDoc-ot: a
  // Formbricks Cloud Hobby csomag ezt nem támogatja, 403-at ad rá.)
  useEffect(() => {
    const supabase = createClient();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      import('@formbricks/js')
        .then(({ default: formbricks }) => formbricks.logout())
        .catch((error) => console.error('[Formbricks] logout() hiba:', error));
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // 3) Next.js App Router route-változás jelzése a Formbricksnek (a klasszikus
  // "page view" trigger továbbra is működjön, mert az App Router kliens-oldali
  // navigációja nem jár teljes oldalbetöltéssel).
  useEffect(() => {
    import('@formbricks/js')
      .then(({ default: formbricks }) => formbricks.registerRouteChange())
      .catch((error) => console.error('[Formbricks] registerRouteChange() hiba:', error));
  }, [pathname]);

  return null;
}
