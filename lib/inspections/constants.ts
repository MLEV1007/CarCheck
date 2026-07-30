import type { PaintStatus } from '@/lib/inspections/types';

/**
 * Előre definiált karosszéria elemek a festékvastagság-méréshez
 * (PROJEKT_INSTRUKCIOK.md 5.B.2: "Karosszéria elemek listája értékmegadással").
 */
export const PAINT_PANELS: string[] = [
  'Motorháztető',
  'Tető',
  'Csomagtérfedél',
  'Bal első sárvédő',
  'Jobb első sárvédő',
  'Bal hátsó sárvédő',
  'Jobb hátsó sárvédő',
  'Bal első ajtó',
  'Jobb első ajtó',
  'Bal hátsó ajtó',
  'Jobb hátsó ajtó',
];

/** Hiba-kategóriák (PROJEKT_INSTRUKCIOK.md 5.B.3). */
export const DEFECT_CATEGORIES: string[] = ['Motor', 'Váltó', 'Karosszéria', 'Beltér', 'Fék/Futómű', 'Egyéb'];

export const PAINT_STATUS_LABEL: Record<PaintStatus, string> = {
  gyari: 'Gyári',
  ujrafujt: 'Újrafújt',
  gittelt: 'Gittelt / Sérült',
};

/**
 * Mikron érték -> státusz besorolás (PROJEKT_INSTRUKCIOK.md 5.B.2):
 * 0-160 -> Gyári, 161-300 -> Újrafújt, 300 felett -> Gittelt/Sérült.
 */
export function getPaintStatus(micronValue: number): PaintStatus {
  if (micronValue <= 160) return 'gyari';
  if (micronValue <= 300) return 'ujrafujt';
  return 'gittelt';
}
