import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { InspectionWizard } from '@/components/inspections/wizard/InspectionWizard';
import { InspectionDetailView } from '@/components/inspections/detail/InspectionDetailView';
import { InspectionNotFound } from '@/components/inspections/detail/InspectionNotFound';
import { PAINT_PANELS } from '@/lib/inspections/constants';
import type { CarInfoState, DefectState, GeneralPhotoState, PaintMeasurementState } from '@/lib/inspections/types';

interface InspectionDetailPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Vizsgálat | Autó Állapotfelmérő',
};

/**
 * Meglévő vizsgálat szerkesztő/részletező oldala (PROJEKT_INSTRUKCIOK.md 5.B,
 * a "Vizsgálat szerkesztő / részletező oldal" lépés). Linear Dark Design Style.
 *
 * Jogosultság-ellenőrzés: a `.eq('user_id', user.id)` szűrés a lekérdezésen az
 * `inspections_select_own` RLS policy (`auth.uid() = user_id`) mellett egy explicit,
 * defenzív második védelmi vonal -- lásd PROJEKT_INSTRUKCIOK.md 3. pont. Ha a sor nem
 * létezik VAGY nem a bejelentkezett usert illeti, ugyanaz a "nem található" állapot
 * jelenik meg (nem szivárogtatunk információt arról, hogy létezik-e idegen vizsgálat
 * ezzel az id-vel).
 *
 * Elágazás a `status` mezőn: 'draft' esetén a wizard tölti be a meglévő adatokat és
 * folytatja a rögzítést/publikálást; 'completed' esetén egy read-only szakértői
 * adatlap jelenik meg akciógombokkal (riport megtekintése/másolása, visszaállítás
 * piszkozatba).
 */
export default async function InspectionDetailPage({ params }: InspectionDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A middleware.ts (PROTECTED_PREFIXES) már véd minden /inspections route-ot,
  // ez itt csak egy defenzív, TS-biztonságos fallback (lásd a többi Server Component-et is).
  if (!user) {
    return null;
  }

  const { data: inspection } = await supabase
    .from('inspections')
    .select(
      'id, car_brand, car_model, year, vin, license_plate, odometer, status, public_token, general_photos, created_at'
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!inspection) {
    return <InspectionNotFound />;
  }

  const [{ data: paintMeasurements }, { data: defects }] = await Promise.all([
    supabase
      .from('paint_measurements')
      .select('id, element_name, micron_value, status')
      .eq('inspection_id', inspection.id)
      .eq('user_id', user.id),
    supabase
      .from('defects')
      .select('id, category, description, media_url')
      .eq('inspection_id', inspection.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
  ]);

  if (inspection.status === 'draft') {
    const initialCarInfo: CarInfoState = {
      carBrand: inspection.car_brand ?? '',
      carModel: inspection.car_model ?? '',
      year: inspection.year ? String(inspection.year) : '',
      vin: inspection.vin ?? '',
      licensePlate: inspection.license_plate ?? '',
      odometer: inspection.odometer ? String(inspection.odometer) : '',
    };

    const measurementsByElement = new Map(
      (paintMeasurements ?? []).map((row) => [row.element_name, row.micron_value])
    );
    const initialPaintMeasurements: PaintMeasurementState[] = PAINT_PANELS.map((elementName) => ({
      elementName,
      micronValue: measurementsByElement.has(elementName) ? String(measurementsByElement.get(elementName)) : '',
    }));

    const initialDefects: DefectState[] = (defects ?? []).map((row) => ({
      clientId: row.id,
      category: row.category ?? '',
      description: row.description ?? '',
      file: null,
      previewUrl: row.media_url,
    }));

    const initialGeneralPhotos: GeneralPhotoState[] = (inspection.general_photos ?? []).map((url: string) => ({
      clientId: url,
      file: null,
      previewUrl: url,
    }));

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
          <span className="text-[14px] font-medium text-linear-ink">Vizsgálat folytatása (piszkozat)</span>
        </header>

        <InspectionWizard
          inspectionId={inspection.id}
          initialCarInfo={initialCarInfo}
          initialGeneralPhotos={initialGeneralPhotos.length > 0 ? initialGeneralPhotos : undefined}
          initialPaintMeasurements={initialPaintMeasurements}
          initialDefects={initialDefects.length > 0 ? initialDefects : undefined}
        />
      </div>
    );
  }

  return (
    <InspectionDetailView
      inspection={inspection}
      paintMeasurements={paintMeasurements ?? []}
      defects={defects ?? []}
      generalPhotos={inspection.general_photos ?? []}
    />
  );
}
