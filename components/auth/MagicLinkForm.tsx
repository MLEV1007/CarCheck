'use client';

import { FormEvent, useState } from 'react';
import { Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface MagicLinkFormProps {
  /** Hova irányítson a Supabase, miután a user rákattint az e-mailben kapott linkre. */
  redirectTo?: string;
  /** A szülő ide kapja meg, hogy sikerült-e a link kiküldése (ő váltja a "megerősítés" nézetre). */
  onSent: (email: string) => void;
  /** A szülő ide kapja meg a hibaüzenetet (ugyanaz a diszkrét hibasáv jeleníti meg, mint a Passkey gombnál). */
  onError: (message: string | null) => void;
  /** 'primary' -- a Regisztráció oldalon ez az EGYETLEN ténylegesen működő akció, ezért ott
   * ez a vizuálisan kiemelt gomb, nem a Passkey (lásd RegisterForm.tsx). */
  variant?: 'primary' | 'secondary';
  /** Csapattag-meghívó regisztráció (PROJEKT_INSTRUKCIOK.md "Csapattag meghívása" lépés)
   * -- ha a `/register?invite=<organization_id>` linkről érkezik a user, ez a mező kerül
   * a `signInWithOtp` `options.data`-jába (`raw_user_meta_data`), amit a DB-oldali
   * `handle_new_user()` trigger olvas ki, hogy a MEGLÉVŐ szervezethez, 'inspector'
   * szerepkörrel csatlakoztassa az új usert (a "sima", meghívó nélküli regisztráció
   * helyett, ami mindig ÚJ, önálló szervezetet + 'manager' szerepkört hoz létre). */
  signUpData?: Record<string, string>;
}

/**
 * Másodlagos (fallback) belépési mód (PROJEKT_INSTRUKCIOK.md "Átállás Jelszómentes
 * hitelesítésre" lépés): `supabase.auth.signInWithOtp({ email })` -- Magic Link. Ez az
 * EGYETLEN mód, ami ÚJ userre is működik (a Supabase alapértelmezetten létrehozza a
 * felhasználót, ha még nem létezik -- `shouldCreateUser` alapértéke `true`), ezért ez
 * szolgál a jelszómentes regisztráció belépőjeként is: a user a linkre kattintva
 * bejelentkezik, utána a /settings oldalon rögzítheti a Face ID / Touch ID passkey-jét
 * a jövőbeli gyors belépéshez.
 */
export function MagicLinkForm({
  redirectTo = '/dashboard',
  onSent,
  onError,
  variant = 'secondary',
  signUpData,
}: MagicLinkFormProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError(null);
    setIsLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        ...(signUpData ? { data: signUpData } : {}),
      },
    });

    setIsLoading(false);

    if (error) {
      onError(describeOtpError(error));
      return;
    }

    onSent(email);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Input
        label="Email cím"
        type="email"
        name="email"
        autoComplete="email"
        placeholder="nev@ceged.hu"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" variant={variant} isLoading={isLoading} fullWidth>
        {!isLoading && <Mail className="h-[18px] w-[18px]" />}
        ✉️ Belépési link küldése e-mailben
      </Button>
    </form>
  );
}

/**
 * A Supabase beépített (`noreply@mail.app.supabase.io`) email küldő szolgáltatása SZIGORÚ
 * óránkénti korlátot szab -- csak fejlesztési/teszt célra való, ÉLES forgalomhoz egyedi SMTP
 * szolgáltató beállítása szükséges (Supabase Dashboard -> Authentication -> Settings ->
 * SMTP Settings). Enélkül ez a hiba (`over_email_send_rate_limit`, HTTP 429) valós
 * regisztrációkat is blokkolhat -- lásd status.md 15. pont.
 */
function describeOtpError(error: { code?: string; status?: number; message?: string }): string {
  if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Túl sok belépési linket kértél rövid idő alatt. Várj néhány percet, majd próbáld újra -- vagy szólj a rendszergazdának, hogy állítson be egyedi email-küldő szolgáltatást (a beépített teszt-küldőnek szigorú korlátja van).';
  }

  if (error.code === 'signup_disabled' || error.message === 'Signups not allowed for otp') {
    return 'Ezzel az email címmel nincs még fiók, és az önkiszolgáló regisztráció jelenleg le van tiltva.';
  }

  return 'Nem sikerült elküldeni a belépési linket. Ellenőrizd az email címet, majd próbáld újra.';
}
