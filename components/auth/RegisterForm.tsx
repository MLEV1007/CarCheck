'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PasskeyButton } from '@/components/auth/PasskeyButton';
import { MagicLinkForm } from '@/components/auth/MagicLinkForm';
import { AuthDivider } from '@/components/auth/AuthDivider';

/**
 * Jelszómentes regisztráció (PROJEKT_INSTRUKCIOK.md "Átállás Jelszómentes hitelesítésre"
 * lépés): NINCS jelszó mező és NINCS Google OAuth gomb. Új felhasználónak nincs még
 * regisztrált passkey-je, ezért a valódi "regisztráció" a Magic Link útján történik --
 * a Supabase alapértelmezetten létrehozza a fiókot az e-mail linkre kattintáskor
 * (`signInWithOtp` `shouldCreateUser` alapértéke `true`). A Passkey gomb itt is megjelenik
 * (elsődleges akció, ugyanaz a komponens, mint a Login oldalon) arra az esetre, ha valaki
 * tévedésből a Regisztráció oldalra jött, pedig már van fiókja és passkey-je.
 */
export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSentTo, setMagicLinkSentTo] = useState<string | null>(null);

  if (magicLinkSentTo) {
    return (
      <div className="flex flex-col gap-4 rounded-stripe-md border border-stripe-hairline bg-white p-6 text-center">
        <p className="font-sohne text-[16px] font-normal text-stripe-ink">
          ✉️ Ellenőrizd a postaládádat!
        </p>
        <p className="font-sohne text-[15px] font-light text-stripe-ink">
          Elküldtük a biztonsági belépési linket a(z) <span className="font-normal">{magicLinkSentTo}</span>{' '}
          címre. A linkre kattintva jön létre / aktiválódik a fiókod -- utána a Beállítások oldalon
          rögzítheted a Face ID / Touch ID-t a jövőbeli gyors belépéshez.
        </p>
        <button
          type="button"
          onClick={() => setMagicLinkSentTo(null)}
          className="font-sohne text-[14px] font-normal text-stripe-primary hover:underline"
        >
          Vissza
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PasskeyButton redirectTo="/dashboard" onError={setError} />
      <AuthDivider label="vagy" />

      {error && (
        <p
          role="alert"
          className="rounded-stripe-sm border border-stripe-ruby/30 bg-stripe-ruby/5 px-3 py-2 font-sohne text-[13px] text-stripe-ruby"
        >
          {error}
        </p>
      )}

      <MagicLinkForm redirectTo="/dashboard" onSent={setMagicLinkSentTo} onError={setError} />

      <p className="text-center font-sohne text-[14px] font-light text-stripe-ink-mute">
        Már van fiókod?{' '}
        <Link href="/login" className="font-normal text-stripe-primary hover:underline">
          Jelentkezz be
        </Link>
      </p>
    </div>
  );
}
