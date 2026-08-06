import Link from 'next/link';
import { Settings } from 'lucide-react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { HeaderCreditBadge } from '@/components/credits/HeaderCreditBadge';
import { CarPassLogo } from '@/components/branding/CarPassLogo';

interface DashboardHeaderProps {
  companyName: string | null;
  logoUrl: string | null;
  /** Szervezeti szerepkör (PROJEKT_INSTRUKCIOK.md "Átvizsgálói UI" lépés) -- Átvizsgáló
   * NEM láthatja a céges AI kredit-egyenleget, ezért `role === 'inspector'` esetén a
   * `HeaderCreditBadge` szerver-oldalon, renderelés ELŐTT kimarad (nincs kliens-oldali
   * villanás/flash, mert ez itt egy Server Component). Opcionális -- ha a hívó nem adja
   * meg, a badge alapértelmezetten megjelenik (visszafelé kompatibilis viselkedés). */
  role?: 'manager' | 'inspector';
}

/**
 * Linear design system (linear.md): `top-nav` -- canvas háttér, hairline alsó szegély,
 * 56-64px magasság, body-sm tipográfia. Bal oldalon a céges branding (logó vagy
 * kezdőbetű-monogram, ha még nincs feltöltve logó), KÖZÉPEN a teljes CarPass logó-lockup
 * (ikon + wordmark + alcím, lásd `components/branding/CarPassLogo.tsx`) `absolute`-tal
 * pozicionálva -- ez a felhasználó explicit kérése ("a navbarban középen legyen az a
 * logó"), a kicsi, ikon-only márkajelzés SZÁNDÉKOSAN NEM jelenik meg itt (a felhasználó
 * kérésére a kicsi verzió KIZÁRÓLAG a böngésző-favicon, lásd `app/icon.svg`). Jobb
 * oldalon navigáció + kijelentkezés. Mobilon (< `sm`) a középső logó rejtve marad, hogy
 * ne ütközzön a bal/jobb oldali, egyébként is szűkös tartalommal (lásd a `HeaderCreditBadge`
 * és a cégnév `truncate` viselkedését keskeny képernyőn).
 */
export function DashboardHeader({ companyName, logoUrl, role = 'manager' }: DashboardHeaderProps) {
  const displayName = companyName || 'CarPass';

  return (
    <header className="relative flex h-16 items-center justify-between border-b border-linear-hairline px-4 sm:px-6">
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

      <Link
        href="/dashboard"
        aria-label="CarPass -- vissza a dashboardra"
        className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 sm:block"
      >
        <CarPassLogo variant="auto" size={40} />
      </Link>

      <div className="flex shrink-0 items-center gap-3">
        {role !== 'inspector' && <HeaderCreditBadge />}
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
