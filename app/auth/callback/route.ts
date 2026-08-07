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
  // Csapattag-meghívó ellenőrzés (2026-08-04, hibajavítás -- lásd status.md): a
  // `MagicLinkForm.tsx` a meghívó szervezet id-ját a redirect URL-be is beégeti,
  // mert a `handle_new_user()` trigger `raw_user_meta_data`-ból olvasott
  // `invite_org_id`-je NEM ér célba, ha a megadott email címhez már létezik fiók
  // (ekkor nincs `auth.users` INSERT, a trigger nem fut le), VAGY ha a meghívó
  // szervezet `team_management_enabled` mezője közben `false`-ra állt. Mindkét
  // esetben a user csendben a sajátjától eltérő, "rossz" fiókba/szervezetbe
  // jelentkezne be -- ezt itt, a session létrejötte UTÁN vesszük észre.
  const inviteOrgId = searchParams.get('invite_org_id');

  // GoTrue `code` nélkül, `error` / `error_description` paraméterekkel tér vissza ide, ha a
  // `/verify` lépés elhasalt -- ez a gyakorlatban SZINTE MINDIG azt jelenti, hogy a Magic
  // Linket a user már elavult/felhasznált állapotban kattintotta meg (pl. mert időközben
  // újat kért, vagy egy email-biztonsági szűrő korábban "megelőlegezte" a kattintást és
  // elhasználta az egyszer-használatos tokent -- valós eset, lásd status.md). Mivel a
  // Google OAuth gomb jelenleg SEHOL nincs kitéve a felületen (LoginForm/RegisterForm
  // kizárólag Passkey + Magic Link), ez a hibaág ténylegesen csak a lejárt/érvénytelen
  // linkes esetet fedi le -- ezért a pontosabb, már létező `confirmation_failed`
  // üzenetre ("A belépési link érvénytelen vagy lejárt. Kérj egy újat.") irányítjuk a
  // usert a félrevezető `oauth_failed` ("A bejelentkezés megszakadt...") helyett.
  const providerError = searchParams.get('error_description') ?? searchParams.get('error');
  if (providerError) {
    return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (inviteOrgId && data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', data.user.id)
          .single();

        // A profil szervezete NEM egyezik a meghívóéval -> a meghívás nem
        // érvényesült erre a fiókra. Visszairányítjuk a regisztrációs oldalra
        // egy egyértelmű hibaüzenettel, ahelyett hogy a (a meghívótól független)
        // dashboardjára engednénk, mintha minden rendben lenne.
        if (profile && profile.organization_id !== inviteOrgId) {
          return NextResponse.redirect(`${origin}/register?error=invite_not_applied`);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
