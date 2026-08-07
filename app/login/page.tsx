import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Autóvizsgáló Partner Belépés | CarPass',
};

export default function LoginPage() {
  return (
    <AuthLayout
      eyebrow="Autóvizsgáló Partnereknek"
      title="Autóvizsgáló Partner Belépés"
      subtitle="Kezeld a vizsgálataidat és generálj interaktív riportokat pillanatok alatt."
      footer={
        <span>
          © {new Date().getFullYear()} CarPass ·{' '}
          <Link href="/adatkezeles" className="hover:underline">
            Adatkezelési tájékoztató
          </Link>
        </span>
      }
    >
      {/* useSearchParams miatt (redirectTo query param) Suspense boundary szükséges */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
