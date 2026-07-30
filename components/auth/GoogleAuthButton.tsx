'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface GoogleAuthButtonProps {
  /** Hova irányítson sikeres bejelentkezés után (a /auth/callback route ezt olvassa a `next` paraméterből). */
  redirectTo?: string;
}

/**
 * "Folytatás Google fiókkal" gomb -- Supabase Google OAuth provider.
 * Stripe design system (stripe.md): `button-secondary` geometria (rounded-full, hairline border),
 * fehér háttéren, hogy vizuálisan alárendelt maradjon az elsődleges indigó CTA-nak.
 *
 * FONTOS: a Google provider-t be kell kapcsolni a Supabase Dashboardban
 * (Authentication -> Providers -> Google), és be kell állítani a Client ID / Secret párost.
 */
export function GoogleAuthButton({ redirectTo = '/dashboard' }: GoogleAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleClick() {
    setIsLoading(true);
    const supabase = createClient();

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });
    // Ha a hívás elindult, a böngésző átirányít a Google bejelentkező oldalára --
    // a loading state-et szándékosan nem állítjuk vissza, hogy a gomb az átirányításig letiltva maradjon.
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-stripe-hairline bg-white px-4 font-sohne text-[15px] font-normal text-stripe-ink transition-colors duration-150 hover:bg-stripe-canvas-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stripe-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <GoogleIcon className="h-[18px] w-[18px]" />
      {isLoading ? 'Átirányítás…' : 'Folytatás Google fiókkal'}
    </button>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59a14.5 14.5 0 0 1-.76-4.59c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.87.92 7.53 2.56 10.78z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.9l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
