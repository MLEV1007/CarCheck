import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = {
  title: 'Autóvizsgáló Fiók Létrehozása | CarPass',
};

export default function RegisterPage() {
  return (
    <AuthLayout
      eyebrow="Autóvizsgáló Partnereknek"
      title="Autóvizsgáló Fiók Létrehozása"
      subtitle="Kezeld a vizsgálataidat és generálj interaktív riportokat pillanatok alatt."
      footer={
        <span>
          © {new Date().getFullYear()} CarPass · A regisztrációval elfogadod az{' '}
          <Link href="/adatkezeles" className="hover:underline">
            Adatkezelési tájékoztatót
          </Link>
          .
        </span>
      }
    >
      {/* `RegisterForm` a `useSearchParams()`-t használja a `?invite=<organization_id>`
          csapattag-meghívó link kiolvasásához -- a Next.js App Router ezt Suspense
          boundary-n belül várja, különben a teljes oldal client-side renderelésre
          esne vissza build-időben (lásd "Csapattag meghívása" lépés). */}
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </AuthLayout>
  );
}
