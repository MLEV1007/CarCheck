import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * `/inspections/[id]` -- ha az adott `id`-jú vizsgálat nem létezik, VAGY nem a
 * bejelentkezett usert illeti (`user_id != auth.uid()`), ugyanezt az állapotot
 * mutatjuk (a két esetet szándékosan nem különböztetjük meg a felhasználó felé --
 * lásd PROJEKT_INSTRUKCIOK.md 3. pont, multi-tenant izoláció: egy idegen vizsgálat
 * létezéséről sem szabad információt szivárogtatni). Linear Dark Design Style.
 */
export function InspectionNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-linear-canvas px-4 text-center">
      <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">404</p>
      <h1 className="max-w-md text-[22px] font-semibold tracking-[-0.4px] text-linear-ink">
        A vizsgálat nem található, vagy nincs hozzá jogosultságod
      </h1>
      <p className="max-w-sm text-[14px] text-linear-ink-subtle">
        Ellenőrizd a linket, vagy térj vissza a Dashboardra a saját vizsgálataid listájához.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-md bg-linear-primary px-5 text-[14px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
      >
        <ArrowLeft className="h-4 w-4" />
        Vissza a Dashboardra
      </Link>
    </div>
  );
}
