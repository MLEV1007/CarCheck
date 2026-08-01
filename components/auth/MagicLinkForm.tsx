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
export function MagicLinkForm({ redirectTo = '/dashboard', onSent, onError }: MagicLinkFormProps) {
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
      },
    });

    setIsLoading(false);

    if (error) {
      onError(
        error.message === 'Signups not allowed for otp'
          ? 'Ezzel az email címmel nincs még fiók, és az önkiszolgáló regisztráció jelenleg le van tiltva.'
          : 'Nem sikerült elküldeni a belépési linket. Ellenőrizd az email címet, majd próbáld újra.'
      );
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
      <Button type="submit" variant="secondary" isLoading={isLoading} fullWidth>
        {!isLoading && <Mail className="h-[18px] w-[18px]" />}
        ✉️ Belépési link küldése e-mailben
      </Button>
    </form>
  );
}
