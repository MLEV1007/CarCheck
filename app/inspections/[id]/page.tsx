import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { InspectionWizard } from '@/components/inspections/wizard/InspectionWizard';
import { InspectionDetailView } from '@/components/inspections/detail/InspectionDetailView';
import { InspectionNotFound } from '@/components/inspections/detail/InspectionNotFound';
import { HeaderCreditBadge } from '@/components/credits/HeaderCreditBadge';
import {
  DAMAGE_TYPES,
  DEFAULT_LICENSE_PLATE_COUNTRY,
  DEFAULT_REPORT_THRESHOLDS,
  EQUIPMENT_ITEMS,
  TIRE_BRANDS,
} from '@/lib/inspections/constants';
import type {
  CarInfoState,
  ClientInfoState,
  DamagePointState,
  DamageType,
  DefectState,
  DiagnosticsState,
  FeatureFormState,
  FeatureStatus,
  FinalAssessmentRecommendation,
  FinalAssessmentState,
  FuelType,
  GeneralPhotoState,
  PaintPointState,
  ReportThresholds,
  RimType,
  ServiceHistoryState,
  ServiceHistoryStatus,
  TireGeneralInfoState,
  TiresState,
} from '@/lib/inspections/types';
import { EMPTY_CLIENT_INFO, EMPTY_TIRE_GENERAL_INFO, EMPTY_TIRES } from '@/lib/inspections/types';
import { FUEL_TYPES } from '@/lib/inspections/constants';

/** Üzemanyag típusa (2026-08-10) -- DB -> wizard state konverzió típus-őre, ugyanaz az
 * elv, mint a `toInitialDamages()` `DAMAGE_TYPES.includes(...)` ellenőrzésénél: egy
 * ismeretlen/érvénytelen tárolt érték (elméletileg nem fordulhat elő a DB CHECK
 * constraint miatt, de defenzíven) üres string ('') -re esik vissza, SOSE kerül TS-en
 * kívüli érték a wizard state-be. */
function isFuelType(value: string | null): value is FuelType {
  return value !== null && (FUEL_TYPES as string[]).includes(value);
}

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

/** Felszereltség UX-újratervezés (2026-08-02) -- a `stored` tömb elemei KÉTFÉLE alakúak
 * lehetnek: a `migrate_equipment_to_feature_state_shape` Supabase migráció az ÉLES
 * adatbázison már átalakította a korábbi ({ name, status: working/not_working/na })
 * sorokat az új ({ id, status: working/defective/not_present, notes?, photo_url? })
 * alakra, de a kódot defenzíven MINDKÉT alakra felkészítjük (`entry.id ?? entry.name`
 * az azonosítóhoz, `LEGACY_STATUS_MAP` a régi státusz-értékekhez) -- ugyanaz az elv, mint
 * a `toInitialTireGeneralInfo`-nál a régi szabad szöveges márkanevekkel. */
const LEGACY_FEATURE_STATUS_MAP: Record<string, FeatureStatus> = {
  working: 'working',
  not_working: 'defective',
  na: 'not_present',
};

function toInitialEquipment(raw: unknown): FeatureFormState[] {
  const stored = Array.isArray(raw)
    ? (raw as Array<{ id?: string; name?: string; status?: string; notes?: string; photo_url?: string }>)
    : [];
  const VALID_STATUSES: FeatureStatus[] = ['working', 'defective', 'not_present'];
  // A teljes, JELENLEGI katalógust (EQUIPMENT_ITEMS) használjuk alapnak -- ha a tárolt
  // tömbben egy elem hiányzik (pl. a katalógus bővült a vizsgálat rögzítése óta), az
  // alapértelmezett `not_present` státusszal jelenik meg, nem esik ki a listából.
  return EQUIPMENT_ITEMS.map((name) => {
    const match = stored.find((entry) => (entry.id ?? entry.name) === name);
    const rawStatus = match?.status;
    const status: FeatureStatus =
      rawStatus && VALID_STATUSES.includes(rawStatus as FeatureStatus)
        ? (rawStatus as FeatureStatus)
        : rawStatus && rawStatus in LEGACY_FEATURE_STATUS_MAP
          ? LEGACY_FEATURE_STATUS_MAP[rawStatus]
          : 'not_present';
    return {
      id: name,
      status,
      notes: match?.notes ?? '',
      file: null,
      previewUrl: match?.photo_url ?? null,
    };
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

/** DB (JSONB) -> wizard state konverzió a Sérülés- és Hibatérkép modulhoz -- a `file`
 * mindig `null` (piszkozat szerkesztésekor a fotó már a Storage-ban van, a `photo_url`
 * a `previewUrl`-be kerül, ugyanaz a minta, mint a `defects`/`general_photos` fotóknál).
 * Érvénytelen/ismeretlen `type` esetén (pl. egy jövőbeli kategória-bővítés utáni, régebbi
 * mentés) `'other'`-re esik vissza, hogy sose kerüljön be egy TypeScript-en kívüli érték. */
function toInitialDamages(raw: unknown): DamagePointState[] {
  const stored = Array.isArray(raw)
    ? (raw as Array<{
        id?: string;
        x?: number;
        y?: number;
        type?: string;
        title?: string;
        description?: string;
        photo_url?: string | null;
      }>)
    : [];
  return stored.map((entry, index) => ({
    id: entry.id ?? `damage-${index}`,
    x: entry.x ?? 0,
    y: entry.y ?? 0,
    type: (DAMAGE_TYPES as string[]).includes(entry.type ?? '') ? (entry.type as DamageType) : 'other',
    title: entry.title ?? '',
    description: entry.description ?? '',
    file: null,
    previewUrl: entry.photo_url ?? null,
  }));
}

/** DB (JSONB) -> wizard state konverzió a Végső Szakvélemény & Várható Költségek modulhoz --
 * ugyanaz a minta, mint a többi helpernél ebben a fájlban. A két költség-mező `number|null`-ból
 * lesz beviteli-mező-string (`String(...)` vagy üres string), a `recommendation` ismeretlen/
 * érvénytelen érték esetén `null`-ra esik vissza, hogy sose kerüljön TS-en kívüli érték a state-be. */
function toInitialFinalAssessment(raw: unknown): FinalAssessmentState {
  const value = (raw ?? {}) as {
    recommendation?: string | null;
    estimated_cost_min?: number | null;
    estimated_cost_max?: number | null;
    cost_notes?: string | null;
    summary_text?: string | null;
  };
  const VALID_RECOMMENDATIONS: FinalAssessmentRecommendation[] = ['recommended', 'conditional', 'not_recommended'];
  const recommendation =
    typeof value.recommendation === 'string' &&
    VALID_RECOMMENDATIONS.includes(value.recommendation as FinalAssessmentRecommendation)
      ? (value.recommendation as FinalAssessmentRecommendation)
      : null;
  return {
    recommendation,
    estimatedCostMin: value.estimated_cost_min != null ? String(value.estimated_cost_min) : '',
    estimatedCostMax: value.estimated_cost_max != null ? String(value.estimated_cost_max) : '',
    costNotes: value.cost_notes ?? '',
    summaryText: value.summary_text ?? '',
  };
}

/** DB oszlopok -> wizard state konverzió az Átvizsgáló és Ügyfél adatok + PDF
 * megjelenítési kapcsolók modulhoz (2026-08-06) -- ugyanaz a minta, mint a többi
 * `toInitial*` helpernél ebben a fájlban: `null` DB-mezőkből üres string lesz a
 * kontrollált beviteli mezőkhöz, a 2 boolean kapcsoló pedig 1:1 átkerül (a DB oszlopok
 * `not null default`-tal jönnek létre, tehát valójában sosem `null`-ok, de a Supabase
 * generált típus mégis `boolean | null`-t ad vissza a select-ből -- a `??` a defenzív
 * fallback, ha egy jövőbeli migráció ezt megváltoztatná). */
function toInitialClientInfo(inspection: {
  inspector_name: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  show_inspector_on_pdf: boolean | null;
  show_client_on_pdf: boolean | null;
}): ClientInfoState {
  return {
    inspectorName: inspection.inspector_name ?? '',
    clientName: inspection.client_name ?? '',
    clientPhone: inspection.client_phone ?? '',
    clientEmail: inspection.client_email ?? '',
    showInspectorOnPdf: inspection.show_inspector_on_pdf ?? EMPTY_CLIENT_INFO.showInspectorOnPdf,
    showClientOnPdf: inspection.show_client_on_pdf ?? EMPTY_CLIENT_INFO.showClientOnPdf,
  };
}

interface InspectionDetailPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Vizsgálat | CarPass',
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
      'id, car_brand, car_model, year, vin, license_plate, license_plate_country, odometer, engine_type, power_kw, gross_weight_kg, fuel_type, status, public_token, general_photos, service_history, diagnostics, equipment, tires, damages, final_assessment, created_at, inspector_name, client_name, client_phone, client_email, show_inspector_on_pdf, show_client_on_pdf'
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!inspection) {
    return <InspectionNotFound />;
  }

  // Szervezeti RBAC (PROJEKT_INSTRUKCIOK.md "Átvizsgálói UI" lépés): az Átvizsgáló NEM
  // láthatja a céges AI kredit-egyenleget -- a `HeaderCreditBadge` szerver-oldalon,
  // renderelés ELŐTT marad ki `role === 'inspector'` esetén (nincs kliens-oldali villanás).
  // Ugyanez a lekérdezés adja a Riport küszöbértékeket is (2026-08-07, lásd
  // `ReportThresholdsCard.tsx`) -- MIND a piszkozat-szerkesztő wizard, MIND a befejezett
  // vizsgálat read-only adatlapja (`InspectionDetailView`) ezekkel jeleníti meg a
  // "Gyári/Újrafújt/Gittelt" ill. "Koros/Kopott gumiabroncs" jelzéseket.
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'role, paint_threshold_gyari_max_micron, paint_threshold_ujrafujt_max_micron, tire_age_warning_years, tire_tread_warning_mm'
    )
    .eq('id', user.id)
    .maybeSingle();
  const role = profile?.role === 'inspector' ? 'inspector' : 'manager';

  // Tutorial "Tipp" buborékok be/kikapcsolása (2026-08-10) -- lásd `app/inspections/new/page.tsx`
  // ugyanerről a blokkról szóló JSDoc-ját.
  const tutorialHintsEnabled = user.user_metadata?.tutorial_hints_enabled !== false;

  const reportThresholds: ReportThresholds = {
    paintGyariMaxMicron: profile?.paint_threshold_gyari_max_micron ?? DEFAULT_REPORT_THRESHOLDS.paintGyariMaxMicron,
    paintUjrafujtMaxMicron:
      profile?.paint_threshold_ujrafujt_max_micron ?? DEFAULT_REPORT_THRESHOLDS.paintUjrafujtMaxMicron,
    tireAgeWarningYears: profile?.tire_age_warning_years ?? DEFAULT_REPORT_THRESHOLDS.tireAgeWarningYears,
    tireTreadWarningMm: profile?.tire_tread_warning_mm ?? DEFAULT_REPORT_THRESHOLDS.tireTreadWarningMm,
  };

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
      licensePlateCountry: inspection.license_plate_country || DEFAULT_LICENSE_PLATE_COUNTRY,
      odometer: inspection.odometer ? String(inspection.odometer) : '',
      engineType: inspection.engine_type ?? '',
      powerKw: inspection.power_kw ? String(inspection.power_kw) : '',
      grossWeight: inspection.gross_weight_kg ? String(inspection.gross_weight_kg) : '',
      fuelType: isFuelType(inspection.fuel_type) ? inspection.fuel_type : '',
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
          <span className="flex-1 text-[14px] font-medium text-linear-ink">Vizsgálat folytatása (piszkozat)</span>
          {role !== 'inspector' && <HeaderCreditBadge />}
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
          initialDamages={toInitialDamages(inspection.damages)}
          initialDefects={initialDefects.length > 0 ? initialDefects : undefined}
          initialFinalAssessment={toInitialFinalAssessment(inspection.final_assessment)}
          initialClientInfo={toInitialClientInfo(inspection)}
          reportThresholds={reportThresholds}
          tutorialHintsEnabled={tutorialHintsEnabled}
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
      damages={toInitialDamages(inspection.damages)}
      finalAssessment={toInitialFinalAssessment(inspection.final_assessment)}
      reportThresholds={reportThresholds}
    />
  );
}
