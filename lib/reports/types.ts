import type { PaintStatus } from '@/lib/inspections/types';

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
  created_at: string;
  updated_at: string;
}

export interface PublicReportPaintMeasurement {
  id: string;
  element_name: string;
  micron_value: number;
  status: PaintStatus;
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
