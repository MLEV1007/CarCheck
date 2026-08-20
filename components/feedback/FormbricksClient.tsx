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
    // A jelenlegi user azonosítását NEM itt végezzük -- lásd lent, a 2) useEffect
    // (onAuthStateChange feliratkozás) gondoskodik róla, hogy setup UTÁN azonnal (és
    // minden későbbi login/logout eseményre is) lefusson a setUserId/setEmail/logout.
  }, []);

  // 2) Auth-állapot követése -- mivel a projektnek nincs globális kliens-oldali auth
  // contextje (lásd az elemzés 3.2 pontját), közvetlenül a Supabase auth eseményeire
  // iratkozunk fel. Ez automatikusan lefedi: első betöltéskor meglévő session,
  // bejelentkezés, KIJELENTKEZÉS (kritikus multi-tenant biztonsági szempontból -- lásd
  // 3.2 -- hogy a következő user ne az előző identitásával küldjön visszajelzést, pl.
  // egy közösen használt céges tableten a műhelyben).
  useEffect(() => {
    const supabase = createClient();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      import('@formbricks/js')
        .then(async ({ default: formbricks }) => {
          if (event === 'SIGNED_OUT') {
            await formbricks.logout();
            return;
          }
          if (session?.user) {
            await formbricks.setUserId(session.user.id);
            if (session.user.email) {
              await formbricks.setEmail(session.user.email);
            }
          }
        })
        .catch((error) => console.error('[Formbricks] auth-állapot szinkronizálási hiba:', error));
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
