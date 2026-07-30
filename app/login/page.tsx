import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Autóvizsgáló Partner Belépés | Autó Állapotfelmérő',
};

export default function LoginPage() {
  return (
    <AuthLayout
      eyebrow="Autóvizsgáló Partnereknek"
      title="Autóvizsgáló Partner Belépés"
      subtitle="Kezeld a vizsgálataidat és generálj interaktív riportokat pillanatok alatt."
      footer={<span>© {new Date().getFullYear()} Autó Állapotfelmérő</span>}
    >
      {/* useSearchParams miatt (redirectTo query param) Suspense boundary szükséges */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
