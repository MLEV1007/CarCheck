'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { AuthDivider } from '@/components/auth/AuthDivider';

export function RegisterForm() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('A jelszónak legalább 8 karakter hosszúnak kell lennie.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('A két jelszó nem egyezik.');
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signUpError) {
      setError(
        signUpError.message === 'User already registered'
          ? 'Ezzel az email címmel már regisztráltak.'
          : signUpError.message
      );
      setIsLoading(false);
      return;
    }

    // Ha a Supabase projektben ki van kapcsolva az email-megerősítés, `data.session`
    // azonnal érvényes lesz -- ilyenkor mehet is tovább a dashboardra.
    if (data.session) {
      router.push('/dashboard');
      router.refresh();
      return;
    }

    // Egyébként megerősítő emailt küldött ki a Supabase -- erről tájékoztatjuk a usert.
    setConfirmationSent(true);
    setIsLoading(false);
  }

  if (confirmationSent) {
    return (
      <div className="flex flex-col gap-4 rounded-stripe-md border border-stripe-hairline bg-white p-6 text-center">
        <p className="font-sohne text-[16px] font-normal text-stripe-ink">
          ✉️ Visszaigazoló e-mailt küldtünk!
        </p>
        <p className="font-sohne text-[15px] font-light text-stripe-ink">
          Kérlek, ellenőrizd a postaládádat (<span className="font-normal">{email}</span>) és a Spam
          mappát a regisztráció befejezéséhez.
        </p>
        <Link href="/login">
          <Button variant="secondary" fullWidth type="button">
            Vissza a bejelentkezéshez
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <GoogleAuthButton redirectTo="/dashboard" />
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
          autoComplete="new-password"
          placeholder="Legalább 8 karakter"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="Jelszó megerősítése"
          type="password"
          name="password_confirm"
          autoComplete="new-password"
          placeholder="••••••••"
          required
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
        />

        <Button type="submit" isLoading={isLoading} fullWidth>
          Fiók létrehozása
        </Button>

        <p className="text-center font-sohne text-[14px] font-light text-stripe-ink-mute">
          Már van fiókod?{' '}
          <Link href="/login" className="font-normal text-stripe-primary hover:underline">
            Jelentkezz be
          </Link>
        </p>
      </form>
    </div>
  );
}
