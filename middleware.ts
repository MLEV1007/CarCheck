import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Fusson minden útvonalon, KIVÉVE:
     * - _next/static (statikus build fájlok)
     * - _next/image (kép-optimalizálás)
     * - favicon.ico
     * - képfájlok kiterjesztései
     * Így a middleware nem fut le feleslegesen statikus asseteknél.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
