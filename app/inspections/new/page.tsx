import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { InspectionWizard } from '@/components/inspections/wizard/InspectionWizard';
import { HeaderCreditBadge } from '@/components/credits/HeaderCreditBadge';
import { DEFAULT_LICENSE_PLATE_COUNTRY } from '@/lib/inspections/constants';

export const metadata: Metadata = {
  title: 'Új vizsgálat | Autó Állapotfelmérő',
};

// Linear design system (linear.md) -- sötét canvas, tömör fejléc, a wizard maga
// Client Component (InspectionWizard.tsx), mert a lépésváltás és a Supabase
// insert/upload logika kliens-oldali állapotot és böngésző-kliens hívásokat igényel.
// A middleware.ts (PROTECTED_PREFIXES) már véd minden /inspections route-ot.
//
// Server Component -- azért, hogy a bejelentkezett user `user_metadata.default_license_country`
// értékét (Settings oldalon testre szabható "Alapértelmezett rendszám felségjelzés") már a
// wizard ELSŐ renderelésekor átadhassuk a Rendszám felségjelzés dropdown kezdeti értékének
// (`InspectionWizard.tsx` `defaultLicensePlateCountry` propja) -- lásd "Rendszám felségjelzés
// dropdown és profilhoz kötött alapértelmezés" lépés.
export default async function NewInspectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const defaultLicensePlateCountry =
    (user?.user_metadata?.default_license_country as string | undefined) || DEFAULT_LICENSE_PLATE_COUNTRY;

  // Szervezeti RBAC (PROJEKT_INSTRUKCIOK.md "Átvizsgálói UI" lépés): az Átvizsgáló NEM
  // láthatja a céges AI kredit-egyenleget -- a `HeaderCreditBadge` szerver-oldalon,
  // renderelés ELŐTT marad ki `role === 'inspector'` esetén (nincs kliens-oldali villanás).
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  const role = profile?.role === 'inspector' ? 'inspector' : 'manager';

  return (
    <div className="min-h-screen bg-linear-canvas">
      <header className="flex h-16 items-center gap-3 border-b border-linear-hairline px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-linear-ink-subtle transition-colors hover:bg-linear-surface-1 hover:text-linear-ink"
          aria-label="Vissza a dashboardra"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="flex-1 text-[14px] font-medium text-linear-ink">Új vizsgálat indítása</span>
        {role !== 'inspector' && <HeaderCreditBadge />}
      </header>

      <InspectionWizard defaultLicensePlateCountry={defaultLicensePlateCountry} />
    </div>
  );
}
