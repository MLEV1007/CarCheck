import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { InspectionWizard } from '@/components/inspections/wizard/InspectionWizard';
import { InspectionDetailView } from '@/components/inspections/detail/InspectionDetailView';
import { InspectionNotFound } from '@/components/inspections/detail/InspectionNotFound';
import { EQUIPMENT_ITEMS, TIRE_BRANDS } from '@/lib/inspections/constants';
import type {
  CarInfoState,
  DefectState,
  DiagnosticsState,
  EquipmentItemState,
  EquipmentStatus,
  GeneralPhotoState,
  PaintPointState,
  RimType,
  ServiceHistoryState,
  ServiceHistoryStatus,
  TireGeneralInfoState,
  TiresState,
} from '@/lib/inspections/types';
import { EMPTY_TIRE_GENERAL_INFO, EMPTY_TIRES } from '@/lib/inspections/types';

/** DB (JSONB) -> wizard state konverzió a 3 új szakértői modulhoz (PROJEKT_INSTRUKCIOK.md,
 * "3 új szakértői modul" lépés). Külön, oldal-szintű helperek, mert csak itt (piszkozat
 * előtöltésekor) van rá szükség -- a mentés iránya (wizard state -> DB) az
 * InspectionWizard.tsx `handleSubmit`-jában él. */
function toInitialDiagnostics(raw: unknown): DiagnosticsState {
  const value = (raw ?? {}) as { no_dtc?: boolean; codes?: Array<{ code?: string; description?: string }> };
  const codes = Array.isArray(value.codes) ? value.codes : [];
  return {
    noDtc: value.no_dtc ?? true,
    codes: codes.map((entry, index) => ({
      clientId: `dtc-${index}`,
      code: entry.code ?? '',
      description: entry.description ?? '',
    })),
  };
}

function toInitialEquipment(raw: unknown): EquipmentItemState[] {
  const stored = Array.isArray(raw) ? (raw as Array<{ name?: string; status?: string }>) : [];
  const VALID_STATUSES: EquipmentStatus[] = ['working', 'not_working', 'na'];
  // A teljes, JELENLEGI katalógust (EQUIPMENT_ITEMS) használjuk alapnak -- ha a tárolt
  // tömbben egy elem hiányzik (pl. a katalógus bővült a vizsgálat rögzítése óta), az
  // alapértelmezett `na` státusszal jelenik meg, nem esik ki a listából.
  return EQUIPMENT_ITEMS.map((name) => {
    const match = stored.find((entry) => entry.name === name);
    const status = match?.status && VALID_STATUSES.includes(match.status as EquipmentStatus)
      ? (match.status as EquipmentStatus)
      : 'na';
    return { name, status };
  });
}

function toInitialTires(raw: unknown): TiresState {
  const value = (raw ?? {}) as Partial<Record<keyof TiresState, { mm?: number | null; dot?: string | null }>>;
  const positions: Array<keyof TiresState> = ['fl', 'fr', 'rl', 'rr'];
  const result = { ...EMPTY_TIRES };
  for (const position of positions) {
    const tire = value[position];
    if (!tire) continue;
    result[position] = {
      mm: tire.mm != null ? String(tire.mm) : '',
      dot: tire.dot ?? '',
    };
  }
  return result;
}

/** DB (JSONB) -> wizard state konverzió a Szervizmúlt & Dokumentumok modulhoz. A `photos`
 * (tárolt string-tömb) itt alakul vissza `GeneralPhotoState[]`-re (`file: null`, a tárolt
 * URL a `previewUrl`) -- ugyanaz a minta, mint az `initialGeneralPhotos` konverziónál lentebb,
 * hogy a `StepServiceHistory.tsx` (piszkozat) és az `InspectionDetailView.tsx` (befejezett)
 * egyaránt a wizard-state formát kapja. */
function toInitialServiceHistory(raw: unknown): ServiceHistoryState {
  const value = (raw ?? {}) as {
    status?: string | null;
    photos?: string[];
    carvertical_pdf_url?: string | null;
    carvertical_pdf_name?: string | null;
    entries?: Array<{ id?: string; date?: string; mileage?: number | null; type?: string; notes?: string }>;
  };
  const VALID_STATUSES: ServiceHistoryStatus[] = ['full', 'partial', 'digital', 'none'];
  const status =
    typeof value.status === 'string' && VALID_STATUSES.includes(value.status as ServiceHistoryStatus)
      ? (value.status as ServiceHistoryStatus)
      : null;
  const photos = Array.isArray(value.photos) ? value.photos : [];
  const entries = Array.isArray(value.entries) ? value.entries : [];
  return {
    status,
    photos: photos.map((url) => ({ clientId: url, file: null, previewUrl: url })),
    carVerticalPdf: {
      file: null,
      url: value.carvertical_pdf_url ?? null,
      fileName: value.carvertical_pdf_name ?? null,
    },
    entries: entries.map((entry, index) => ({
      id: entry.id ?? `svc-${index}`,
      date: entry.date ?? '',
      mileage: entry.mileage != null ? String(entry.mileage) : '',
      type: entry.type ?? '',
      notes: entry.notes ?? '',
    })),
  };
}

/** DB (JSONB `tires.rim_type`/`tires.brand`, a `fl`/`fr`/`rl`/`rr` kulcsok TESTVÉREI) ->
 * wizard state konverzió (Gumiabroncs & Felni modul bővítése, A pont). Ha a tárolt
 * `brand` pontosan megegyezik egy `TIRE_BRANDS` preset-tel, azt választjuk ki --
 * egyébként (szabad szöveges korábbi mentés) "Egyéb"-re esik vissza, a tárolt szöveg
 * a `customBrand` mezőbe kerül, hogy a UI-ban is helyesen jelenjen meg. */
function toInitialTireGeneralInfo(raw: unknown): TireGeneralInfoState {
  const value = (raw ?? {}) as { rim_type?: string | null; brand?: string | null };
  const rimType: RimType | '' = value.rim_type === 'alloy' || value.rim_type === 'steel' ? value.rim_type : '';
  const storedBrand = value.brand?.trim() ?? '';
  if (storedBrand === '') return { ...EMPTY_TIRE_GENERAL_INFO, rimType };
  const isPreset = TIRE_BRANDS.includes(storedBrand) && storedBrand !== 'Egyéb';
  return {
    rimType,
    brand: isPreset ? storedBrand : 'Egyéb',
    customBrand: isPreset ? '' : storedBrand,
  };
}

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
      'id, car_brand, car_model, year, vin, license_plate, odometer, status, public_token, general_photos, service_history, diagnostics, equipment, tires, created_at'
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
      .select('id, x, y, value')
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

    // Szabadkézi (free-form) mérési pontok visszatöltése -- egyszerű 1:1 leképezés, nincs
    // többé fix elem-lista/hátrafelé-kompatibilis "3 pontra szétosztott régi átlag" logika
    // (Rétegvastagság-mérő "Szabadkézi (Free-form Canvas)" átalakítása lépés).
    const initialPaintMeasurements: PaintPointState[] = (paintMeasurements ?? []).map((row) => ({
      id: row.id,
      x: row.x,
      y: row.y,
      value: row.value,
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
          initialServiceHistory={toInitialServiceHistory(inspection.service_history)}
          initialDiagnostics={toInitialDiagnostics(inspection.diagnostics)}
          initialEquipment={toInitialEquipment(inspection.equipment)}
          initialTires={toInitialTires(inspection.tires)}
          initialTireGeneralInfo={toInitialTireGeneralInfo(inspection.tires)}
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
      serviceHistory={toInitialServiceHistory(inspection.service_history)}
      diagnostics={toInitialDiagnostics(inspection.diagnostics)}
      equipment={toInitialEquipment(inspection.equipment)}
      tires={toInitialTires(inspection.tires)}
      tireGeneralInfo={toInitialTireGeneralInfo(inspection.tires)}
    />
  );
}
