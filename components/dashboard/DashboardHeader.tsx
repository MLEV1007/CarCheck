import Link from 'next/link';
import { Settings } from 'lucide-react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { HeaderCreditBadge } from '@/components/credits/HeaderCreditBadge';

interface DashboardHeaderProps {
  companyName: string | null;
  logoUrl: string | null;
}

/**
 * Linear design system (linear.md): `top-nav` -- canvas háttér, hairline alsó szegély,
 * 56-64px magasság, body-sm tipográfia. Bal oldalon a céges branding (logó vagy
 * kezdőbetű-monogram, ha még nincs feltöltve logó), jobb oldalon navigáció + kijelentkezés.
 */
export function DashboardHeader({ companyName, logoUrl }: DashboardHeaderProps) {
  const displayName = companyName || 'Autó Állapotfelmérő';

  return (
    <header className="flex h-16 items-center justify-between border-b border-linear-hairline px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a logó a Supabase Storage-ból, tetszőleges méretben érkezik
          <img src={logoUrl} alt={displayName} className="h-7 w-7 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-linear-primary text-[13px] font-semibold text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="truncate text-[14px] font-medium text-linear-ink">{displayName}</span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <HeaderCreditBadge />
        <Link
          href="/settings"
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-linear-ink-subtle transition-colors hover:bg-linear-surface-1 hover:text-linear-ink"
        >
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Beállítások</span>
        </Link>
        <SignOutButton />
      </div>
    </header>
  );
}
