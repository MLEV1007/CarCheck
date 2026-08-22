import Link from 'next/link';
import { Settings } from 'lucide-react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { HeaderCreditBadge } from '@/components/credits/HeaderCreditBadge';
import { CarPassLogo } from '@/components/branding/CarPassLogo';
import { FeedbackTriggerButton } from '@/components/feedback/FeedbackTriggerButton';

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
 * oldalon navigáció + kijelentkezés.
 *
 * **Tablet-egymásracsúszás javítás (2026-08-08):** korábban a középső logó `sm:block`-kal
 * (>= 640px) jelent meg, UGYANAKKOR a jobb oldali `HeaderCreditBadge` "Előfizetés" felirata
 * és a `Beállítások`/`Kijelentkezés` szövegek is `sm:`-nél váltak láthatóvá -- tableten
 * (kb. 640--1024px, pl. iPad álló/fekvő) mind a négy elem EGYSZERRE jelent meg, a bal
 * oldali cégnév + jobb oldali (Előfizetés + vizsgálat-jelvény + AI-jelvény + Beállítások +
 * Kijelentkezés, mind teljes szöveggel) összesített szélessége pedig már ezen a
 * képernyőméreten TÖBB volt, mint a rendelkezésre álló hely -- az `absolute`-tal középre
 * pozicionált logó emiatt ténylegesen RÁCSÚSZOTT a bal/jobb oldali flow-tartalomra (az
 * `absolute` elem nem "foglal helyet" a flexboxban, tehát semmi nem tolta el mellőle a
 * szöveget). Javítás: a jobb oldali szöveges labelek (lásd lent + `HeaderCreditBadge.tsx`,
 * `SignOutButton.tsx`) mostantól `lg:` (>= 1024px) breakpointnál jelennek meg (tableten
 * továbbra is kompakt, csak-ikon nézet, mint mobilon), a középső logó pedig csak `xl:`-nél
 * (>= 1280px) -- így a két réteg (szöveges jobb oldal / középső logó) SOSEM aktiválódik
 * ugyanazon a szélességen, biztos térköz marad közöttük.
 */
export function DashboardHeader({ companyName, logoUrl, role = 'manager' }: DashboardHeaderProps) {
  const displayName = companyName || 'CarPass';

  return (
    <header className="relative flex h-16 items-center justify-between gap-2 border-b border-linear-hairline px-3 sm:px-6">
      <div className="flex min-w-0 shrink items-center gap-2.5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a logó a Supabase Storage-ból, tetszőleges méretben érkezik
          <img src={logoUrl} alt={displayName} className="h-7 w-7 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-linear-primary text-[13px] font-semibold text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="min-w-0 truncate text-[14px] font-medium text-linear-ink">{displayName}</span>
      </div>

      <Link
        href="/dashboard"
        aria-label="CarPass -- vissza a dashboardra"
        className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 xl:block"
      >
        <CarPassLogo variant="auto" size={40} />
      </Link>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        {role !== 'inspector' && <HeaderCreditBadge />}
        {/* < 1024px (telefon ÉS tablet, a projekt fő céleszközei) csak az ikon látszik --
            ilyenkor a `min-w-11`/`h-11` a tényleges dobozt is 44x44px-re növeli, mert a
            szöveges label hiányában a korábbi `px-2` padding-only szélesség kb. csak 32px
            volt. `lg:`-nél (asztali nézet, szöveges label) visszaáll a kompakt 32px-es
            magasságra -- lásd docs/ux-touch-targets-plan-2026-08-14.md G) pont. */}
        {/* Saját, pillekönnyű visszajelző widget (2026-08-22) -- lásd
            `FeedbackTriggerButton.tsx` JSDoc-ját arról, hogy ez a variáns MIÉRT marad
            örökre csak-ikon (a korábbi Formbricks-kísérlet navbar-ütközésének elkerülése). */}
        <FeedbackTriggerButton variant="header-icon" />
        <Link
          href="/settings"
          aria-label="Beállítások"
          className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-linear-ink-subtle transition-colors hover:bg-linear-surface-1 hover:text-linear-ink lg:h-8 lg:min-w-0 lg:justify-start lg:px-3"
        >
          <Settings className="h-4 w-4" />
          <span className="hidden lg:inline">Beállítások</span>
        </Link>
        <SignOutButton />
      </div>
    </header>
  );
}
