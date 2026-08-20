import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { PROTECTED_PREFIXES } from '@/lib/formbricks/protectedPrefixes';

// Ezekhez az útvonalakhoz (és minden al-útvonalukhoz) érvényes bejelentkezés kell.
// `/admin` (Platform Admin felület, lásd `app/admin/page.tsx`) itt CSAK a bejelentkezést
// követeli meg -- a tényleges "platform admin-e a user?" ellenőrzés (allow-list,
// `platform_admins` tábla) az oldal Server Component-jében történik, RLS-sel védve.
//
// A lista maga 2026-08-20 óta a `lib/formbricks/protectedPrefixes.ts`-ben él (nem itt) --
// ugyanezt a forrást használja a `FormbricksProvider.tsx` is annak eldöntésére, mely
// útvonalakon töltse be a visszajelzés-widgetet, lásd
// docs/formbricks-feedback-widget-elemzes-2026-08-20.md 5. pontját.

// Ha egy már bejelentkezett felhasználó idelátogat, inkább a dashboardra tereljük,
// nincs értelme neki újra a login/register képernyőt mutatni.
const AUTH_ONLY_PATHS = ['/login', '/register'];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // FONTOS: soha ne `getSession()`-t használj middleware-ben/Proxy-ban route védésre --
  // az nincs garantáltan validálva a JWT aláírás ellen. A `getClaims()` viszont
  // helyben (WebCrypto + JWKS) ellenőrzi a tokent, ezért ez a biztonságos módszer.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isAuthOnly = AUTH_ONLY_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthOnly && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  // Ez a lépés kritikus: a válasz objektumot változatlanul kell visszaadni,
  // különben a frissített session cookie-k elvesznek, és a felhasználó
  // véletlenszerűen kijelentkezik.
  return supabaseResponse;
}
