'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PasskeyButton } from '@/components/auth/PasskeyButton';
import { MagicLinkForm } from '@/components/auth/MagicLinkForm';
import { AuthDivider } from '@/components/auth/AuthDivider';

// Az /auth/callback route ezekkel a kódokkal irányít ide vissza, ha a Magic Link
// vagy egy korábbi belépési kísérlet folyamata elakadt.
const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: 'A bejelentkezés megszakadt vagy sikertelen volt. Próbáld újra.',
  confirmation_failed: 'A belépési link érvénytelen vagy lejárt. Kérj egy újat.',
};

/**
 * Jelszómentes belépés (PROJEKT_INSTRUKCIOK.md "Átállás Jelszómentes hitelesítésre" lépés):
 * NINCS jelszó mező és NINCS Google OAuth gomb -- kizárólag Passkey (elsődleges) és Magic
 * Link (másodlagos, fallback) belépési mód. Lásd PasskeyButton.tsx / MagicLinkForm.tsx.
 */
export function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') ?? '/dashboard';
  const callbackError = searchParams.get('error');
  // `DeleteAccountCard.tsx` ide irányít vissza sikeres fiók-törlés után
  // (`/login?accountDeleted=1`) -- egy semleges, nem hiba-stílusú visszajelzés, hogy a
  // user tudja, a törlés ténylegesen megtörtént, nem csak kijelentkezett.
  const accountDeleted = searchParams.get('accountDeleted') === '1';

  const [error, setError] = useState<string | null>(
    callbackError ? CALLBACK_ERROR_MESSAGES[callbackError] ?? 'Váratlan hiba történt. Próbáld újra.' : null
  );
  const [magicLinkSentTo, setMagicLinkSentTo] = useState<string | null>(null);

  if (magicLinkSentTo) {
    return (
      <div className="flex flex-col gap-4 rounded-stripe-md border border-stripe-hairline bg-white p-6 text-center">
        <p className="font-sohne text-[16px] font-normal text-stripe-ink">
          ✉️ Ellenőrizd a postaládádat!
        </p>
        <p className="font-sohne text-[15px] font-light text-stripe-ink">
          Elküldtük a biztonsági belépési linket a(z) <span className="font-normal">{magicLinkSentTo}</span>{' '}
          címre.
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
      {accountDeleted && (
        <p className="rounded-stripe-sm border border-stripe-hairline bg-stripe-canvas-soft px-3 py-2 font-sohne text-[13px] text-stripe-ink-secondary">
          A fiókod törölve lett. A korábban rögzített vizsgálatok adatai megmaradtak a
          cégednél.
        </p>
      )}

      <PasskeyButton redirectTo={redirectTo} onError={setError} />
      <AuthDivider label="vagy" />

      {error && (
        <p
          role="alert"
          className="rounded-stripe-sm border border-stripe-ruby/30 bg-stripe-ruby/5 px-3 py-2 font-sohne text-[13px] text-stripe-ruby"
        >
          {error}
        </p>
      )}

      <MagicLinkForm redirectTo={redirectTo} onSent={setMagicLinkSentTo} onError={setError} />

      <p className="text-center font-sohne text-[14px] font-light text-stripe-ink-mute">
        Még nincs fiókod?{' '}
        <Link href="/register" className="font-normal text-stripe-primary hover:underline">
          Regisztrálj itt
        </Link>
      </p>
    </div>
  );
}
