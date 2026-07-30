import type { Metadata } from 'next';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = {
  title: 'Autóvizsgáló Fiók Létrehozása | Autó Állapotfelmérő',
};

export default function RegisterPage() {
  return (
    <AuthLayout
      eyebrow="Autóvizsgáló Partnereknek"
      title="Autóvizsgáló Fiók Létrehozása"
      subtitle="Kezeld a vizsgálataidat és generálj interaktív riportokat pillanatok alatt."
      footer={<span>© {new Date().getFullYear()} Autó Állapotfelmérő</span>}
    >
      <RegisterForm />
    </AuthLayout>
  );
}
