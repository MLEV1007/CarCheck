'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { isProtectedPath } from '@/lib/formbricks/protectedPrefixes';

// ssr:false -- lásd az elemzés 3.1 pontját: garantáltan sosem fut szerveren, és a
// @formbricks/js bundle csak akkor kerül a hálózati kérések közé, amikor ez a
// dinamikus import ténylegesen kiértékelődik (tehát védett útvonalon, bejelentkezve).
const FormbricksClient = dynamic(() => import('@/components/feedback/FormbricksClient'), {
  ssr: false,
});

/**
 * A gyökér layoutban (`app/layout.tsx`) mountolt kapcsoló (2026-08-20, "Formbricks
 * visszajelzés-widget" lépés, lásd docs/formbricks-feedback-widget-elemzes-2026-08-20.md).
 * Publikus oldalakon (`/`, `/login`, `/register`, `/report/[public_token]`) `null`-t
 * rendereld -- a Formbricks bundle-je le sem töltődik ott, tehát nulla hatással van a
 * nyilvános, ügyfeleknek szóló riport-oldal LCP/CLS-ére.
 */
export function FormbricksProvider() {
  const pathname = usePathname();
  if (!isProtectedPath(pathname)) return null;
  return <FormbricksClient />;
}
