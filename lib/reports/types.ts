import type {
  DamageType,
  FeatureStatus,
  FinalAssessmentRecommendation,
  RimType,
  ServiceHistoryStatus,
  TirePosition,
} from '@/lib/inspections/types';

/**
 * A `public.get_public_report(p_token uuid)` Postgres RPC (SECURITY DEFINER)
 * visszatérési (jsonb) struktúrájának TS megfelelője -- lásd PROJEKT_INSTRUKCIOK.md
 * 5.C: Publikus Ügyfélriport. A függvény bejelentkezés nélkül (anon szerepkörrel)
 * is hívható, és csak a `public_token`-hez tartozó egyetlen vizsgálatot adja vissza,
 * RLS megkerülésével -- ezért az oldal SOHA nem kérdezhet le közvetlenül táblákat,
 * kizárólag ezt az RPC-t.
 */

export interface PublicReportInspection {
  id: string;
  car_brand: string | null;
  car_model: string | null;
  year: number | null;
  vin: string | null;
  license_plate: string | null;
  /** Rendszám felségjelzés betűkódja (pl. "H", "SK") -- lásd
   * `lib/inspections/constants.ts` `LICENSE_PLATE_COUNTRIES`. */
  license_plate_country: string | null;
  odometer: number | null;
  status: 'draft' | 'completed' | string;
  /** Általános autó fotók (elölről/hátulról/oldalról/beltér/műszerfal stb.) -- a
   * `get_public_report` RPC 2026-07-31-es kiegészítése óta tartalmazza. */
  general_photos: string[];
  /** Diagnosztikai hibakódok modul (3 új szakértői modul lépés) -- ha `no_dtc` igaz,
   * a `codes` a mentéskor mindig üresen kerül be (lásd InspectionWizard.tsx). */
  diagnostics: PublicReportDiagnostics;
  /** Felszereltségi elemek állapota modul -- UX teljes újratervezés (2026-08-02),
   * "Szupergyors tömeges kijelölés" lépés. */
  equipment: PublicReportFeature[];
  /** Gumiabroncsok állapota modul -- kerékpozíciónként opcionális, mert egy régi
   * (e modul előtti) vizsgálatnál vagy részlegesen kitöltött piszkozatnál hiányozhat.
   * A `rim_type`/`brand` ÁLTALÁNOS mezők (Gumiabroncs & Felni modul bővítése, A pont) --
   * ugyanabban a `tires` JSONB objektumban élnek, a kerékpozíciók testvéreiként. */
  tires: PublicReportTiresData;
  /** Szervizmúlt & Dokumentumok modul -- `status` `null` lehet, ha a vizsgáló még nem
   * választott (a `get_public_report` RPC 2026-08-01-es kiegészítése óta tartalmazza). */
  service_history: PublicReportServiceHistory;
  /** Sérülés- és Hibatérkép modul -- ugyanaz a `general_photos`/`diagnostics`/`equipment`/
   * `tires` minta: egyetlen JSONB oszlop az `inspections` sorban, nincs külön gyerek-tábla. */
  damages: PublicReportDamage[];
  /** Végső Szakvélemény & Várható Költségek modul -- TELJESEN OPCIONÁLIS, minden mező
   * `null` lehet (a `get_public_report` RPC 2026-08-02-es kiegészítése óta tartalmazza).
   * Ha minden mező `null`/üres, a `FinalAssessmentCard.tsx` a teljes szekciót elrejti. */
  final_assessment: PublicReportFinalAssessment;
  created_at: string;
  updated_at: string;
}

export interface PublicReportFinalAssessment {
  recommendation: FinalAssessmentRecommendation | null;
  estimated_cost_min: number | null;
  estimated_cost_max: number | null;
  cost_notes: string | null;
  summary_text: string | null;
}

/**
 * Sérülés- és Hibatérkép modul -- egy szabadkézi pont a `cars.webp` referenciaképen
 * (ugyanaz az `x`/`y` százalékos-relatív-pozíció elv, mint a `PublicReportPaintMeasurement`-
 * nél). Lásd `lib/inspections/types.ts` `DamagePointState` a wizard-oldali megfelelőjéért.
 */
export interface PublicReportDamage {
  id: string;
  x: number;
  y: number;
  type: DamageType;
  title: string;
  description: string;
  photo_url: string | null;
}

export interface PublicReportServiceHistoryEntry {
  id: string;
  date: string;
  mileage: number;
  type: string;
  notes?: string;
}

export interface PublicReportServiceHistory {
  status: ServiceHistoryStatus | null;
  photos: string[];
  /** CarVertical (vagy hasonló autó-előéleti szolgáltatás) PDF riport -- mindkét mező
   * `null`, ha a vizsgáló nem töltött fel ilyet. */
  carvertical_pdf_url: string | null;
  carvertical_pdf_name: string | null;
  entries: PublicReportServiceHistoryEntry[];
}

export interface PublicReportDiagnosticCode {
  code: string;
  description: string;
}

export interface PublicReportDiagnostics {
  no_dtc: boolean;
  codes: PublicReportDiagnosticCode[];
}

/**
 * A `get_public_report` RPC-n keresztül visszaadott felszereltség-elem alak -- 1:1 az
 * `inspections.equipment` JSONB-ben ténylegesen tárolt (lásd `lib/inspections/types.ts`
 * `FeatureState`) struktúra. `notes`/`photo_url` csak `status === 'defective'` esetén
 * lehet jelen (a mentéskor `InspectionWizard.tsx` csak ekkor írja be).
 */
export interface PublicReportFeature {
  id: string;
  status: FeatureStatus;
  notes?: string | null;
  photo_url?: string | null;
}

export interface PublicReportTireMeasurement {
  mm: number | null;
  dot: string | null;
}

export type PublicReportTiresData = Partial<Record<TirePosition, PublicReportTireMeasurement>> & {
  rim_type?: RimType | null;
  brand?: string | null;
};

/**
 * Szabadkézi (free-form) rétegvastagság-mérési pont (PROJEKT_INSTRUKCIOK.md,
 * "Rétegvastagság-mérő Szabadkézi (Free-form Canvas) átalakítása" lépés) -- NINCS
 * előre definiált karosszéria-elem, `x`/`y` a kép bal szélétől/tetejétől mért
 * SZÁZALÉKOS relatív pozíció, `value` a mért érték (µm). A `status` (zöld/sárga/piros)
 * a `value`-ból a `getPaintStatus()`-szal számolódik ki mindkét helyen (Wizard +
 * publikus riport), nincs külön tárolva.
 */
export interface PublicReportPaintMeasurement {
  id: string;
  x: number;
  y: number;
  value: number;
  created_at: string;
}

export interface PublicReportDefect {
  id: string;
  category: string;
  description: string | null;
  media_url: string | null;
  created_at: string;
}

export interface PublicReportCompany {
  company_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  phone: string | null;
  email: string | null;
}

export interface PublicReportData {
  inspection: PublicReportInspection;
  paint_measurements: PublicReportPaintMeasurement[];
  defects: PublicReportDefect[];
  company: PublicReportCompany | null;
}
