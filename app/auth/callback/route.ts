import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Ide fut be MINDEN Supabase auth-redirect: a regisztrációs megerősítő email
// (`emailRedirectTo` a RegisterForm-ban) ÉS a Google OAuth folyamat is
// (`redirectTo` a GoogleAuthButton-ban) -- mindkettő egy `code` paramétert ad át,
// amit munkamenetre kell váltani.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  // Ha a user megszakította a Google bejelentkezést (pl. "Cancel" a consent screenen),
  // a provider `error` / `error_description` paraméterekkel tér vissza `code` nélkül.
  const providerError = searchParams.get('error_description') ?? searchParams.get('error');
  if (providerError) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
