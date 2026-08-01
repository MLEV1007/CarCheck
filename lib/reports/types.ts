import type { EquipmentStatus, RimType, TirePosition } from '@/lib/inspections/types';

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
  odometer: number | null;
  status: 'draft' | 'completed' | string;
  /** Általános autó fotók (elölről/hátulról/oldalról/beltér/műszerfal stb.) -- a
   * `get_public_report` RPC 2026-07-31-es kiegészítése óta tartalmazza. */
  general_photos: string[];
  /** Diagnosztikai hibakódok modul (3 új szakértői modul lépés) -- ha `no_dtc` igaz,
   * a `codes` a mentéskor mindig üresen kerül be (lásd InspectionWizard.tsx). */
  diagnostics: PublicReportDiagnostics;
  /** Felszereltségi elemek állapota modul. */
  equipment: PublicReportEquipmentItem[];
  /** Gumiabroncsok állapota modul -- kerékpozíciónként opcionális, mert egy régi
   * (e modul előtti) vizsgálatnál vagy részlegesen kitöltött piszkozatnál hiányozhat.
   * A `rim_type`/`brand` ÁLTALÁNOS mezők (Gumiabroncs & Felni modul bővítése, A pont) --
   * ugyanabban a `tires` JSONB objektumban élnek, a kerékpozíciók testvéreiként. */
  tires: PublicReportTiresData;
  created_at: string;
  updated_at: string;
}

export interface PublicReportDiagnosticCode {
  code: string;
  description: string;
}

export interface PublicReportDiagnostics {
  no_dtc: boolean;
  codes: PublicReportDiagnosticCode[];
}

export interface PublicReportEquipmentItem {
  name: string;
  status: EquipmentStatus;
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
