import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { InspectionWizard } from '@/components/inspections/wizard/InspectionWizard';
import { HeaderCreditBadge } from '@/components/credits/HeaderCreditBadge';
import { DEFAULT_LICENSE_PLATE_COUNTRY, DEFAULT_REPORT_THRESHOLDS } from '@/lib/inspections/constants';
import { checkInspectionQuota, InsufficientInspectionQuotaError } from '@/lib/quotas';
import type { ReportThresholds } from '@/lib/inspections/types';

export const metadata: Metadata = {
  title: 'Új vizsgálat | CarPass',
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
  // Ugyanez a lekérdezés adja a Riport küszöbértékeket is (2026-08-07, lásd
  // `ReportThresholdsCard.tsx`) -- a wizard Festékvastagság/Gumiabroncsok/Összegzés
  // lépései ezekkel jelenítik meg élőben a "Gyári/Újrafújt/Gittelt" ill.
  // "Koros/Kopott gumiabroncs" jelzéseket, NEM a korábban hardkódolt konstansokkal.
  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select(
          'role, paint_threshold_gyari_max_micron, paint_threshold_ujrafujt_max_micron, tire_age_warning_years, tire_tread_warning_mm'
        )
        .eq('id', user.id)
        .maybeSingle()
    : { data: null };
  const role = profile?.role === 'inspector' ? 'inspector' : 'manager';
  const reportThresholds: ReportThresholds = {
    paintGyariMaxMicron: profile?.paint_threshold_gyari_max_micron ?? DEFAULT_REPORT_THRESHOLDS.paintGyariMaxMicron,
    paintUjrafujtMaxMicron:
      profile?.paint_threshold_ujrafujt_max_micron ?? DEFAULT_REPORT_THRESHOLDS.paintUjrafujtMaxMicron,
    tireAgeWarningYears: profile?.tire_age_warning_years ?? DEFAULT_REPORT_THRESHOLDS.tireAgeWarningYears,
    tireTreadWarningMm: profile?.tire_tread_warning_mm ?? DEFAULT_REPORT_THRESHOLDS.tireTreadWarningMm,
  };

  // VIZSGÁLATI KVÓTA ELLENŐRZÉS (PROJEKT_INSTRUKCIOK.md "Keret-ellenőrző és fogyasztó
  // logika" lépés, 2026-08-04) -- "Új autó vizsgálat indításakor ellenőrizze, hogy van-e
  // még elérhető vizsgálati keret... Ha nincs, dobjon hibát." Ez a Server Component a
  // legtermészetesebb hely erre: MIELŐTT a user egyáltalán elkezdene adatokat gépelni a
  // Wizardba, itt derül ki, ha a szervezetnek elfogyott a kerete (havi + vásárolt Top-up
  // összesen <= 0) -- ilyenkor egy blokkoló üzenetet mutatunk a Wizard HELYETT, link a
  // Beállítások > Előfizetés oldalra. A TÉNYLEGES levonás (1 egységgel) csak a vizsgálat
  // első sikeres MENTÉSEKOR történik (lásd `InspectionWizard.tsx` `/api/inspections/
  // consume-quota` hívását), NEM itt -- ez a lépés csak egy előzetes, blokkoló ellenőrzés.
  let quotaExceeded = false;
  if (user) {
    try {
      await checkInspectionQuota(user.id);
    } catch (error) {
      if (error instanceof InsufficientInspectionQuotaError) {
        quotaExceeded = true;
      } else {
        // Egy váratlan (DB/hálózati) hiba esetén NEM blokkoljuk a usert -- inkább egy
        // esetlegesen sikertelen kvóta-levonás derül ki a mentéskor, mint hogy egy
        // átmeneti infrastruktúra-hiba miatt senki ne tudjon vizsgálatot indítani.
        console.error('[inspections/new] Váratlan hiba a vizsgálati kvóta ellenőrzése közben:', error);
      }
    }
  }

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

      {quotaExceeded ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-linear-surface-2">
            <Lock className="h-5 w-5 text-linear-ink-subtle" />
          </div>
          <p className="text-[15px] font-medium text-linear-ink">Elfogyott a havi vizsgálati kereted</p>
          <p className="text-[13px] text-linear-ink-subtle">
            {role === 'manager'
              ? 'Vásárolj "+10 Autó" Top-up csomagot, vagy válts magasabb előfizetésre a Beállítások > Előfizetés oldalon.'
              : 'A céges vizsgálati keret kimerült. Kérjük, értesítsd a Menedzsert a feltöltéshez!'}
          </p>
          {role === 'manager' && (
            <Link
              href="/settings/billing"
              className="mt-2 inline-flex h-9 items-center rounded-md bg-linear-primary px-4 text-[13px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
            >
              Ugrás az Előfizetéshez
            </Link>
          )}
        </div>
      ) : (
        <InspectionWizard defaultLicensePlateCountry={defaultLicensePlateCountry} reportThresholds={reportThresholds} />
      )}
    </div>
  );
}
