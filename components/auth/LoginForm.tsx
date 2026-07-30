'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { AuthDivider } from '@/components/auth/AuthDivider';

// Az /auth/callback route ezekkel a kódokkal irányít ide vissza, ha a Google OAuth
// vagy az email-megerősítő link folyamata elakadt.
const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: 'A Google bejelentkezés megszakadt vagy sikertelen volt. Próbáld újra.',
  confirmation_failed: 'A megerősítő link érvénytelen vagy lejárt.',
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') ?? '/dashboard';
  const callbackError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    callbackError ? CALLBACK_ERROR_MESSAGES[callbackError] ?? 'Váratlan hiba történt. Próbáld újra.' : null
  );
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'Hibás email cím vagy jelszó.'
          : signInError.message
      );
      setIsLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <GoogleAuthButton redirectTo={redirectTo} />
      <AuthDivider />

      {error && (
        <p
          role="alert"
          className="rounded-stripe-sm border border-stripe-ruby/30 bg-stripe-ruby/5 px-3 py-2 font-sohne text-[13px] text-stripe-ruby"
        >
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
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
        <Input
          label="Jelszó"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button type="submit" isLoading={isLoading} fullWidth>
          Bejelentkezés
        </Button>

        <p className="text-center font-sohne text-[14px] font-light text-stripe-ink-mute">
          Még nincs fiókod?{' '}
          <Link href="/register" className="font-normal text-stripe-primary hover:underline">
            Regisztrálj itt
          </Link>
        </p>
      </form>
    </div>
  );
}
