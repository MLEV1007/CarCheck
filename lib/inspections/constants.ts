import type { EquipmentStatus, PaintStatus, TirePosition } from '@/lib/inspections/types';

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

/**
 * Felszereltségi Elemek Állapota Modul (PROJEKT_INSTRUKCIOK.md, "3 új szakértői modul"
 * lépés, B pont) -- a leggyakoribb kényelmi/biztonsági extrák előre definiált listája.
 */
export const EQUIPMENT_ITEMS: string[] = [
  'Klímaberendezés',
  'Távolságtartó tempomat',
  'Tolatókamera / Radar',
  'Ülésfűtés',
  'Sávtartó asszisztens',
  'Mátrix LED / Xenon fényszórók',
  'Elektromos ablakok',
  'Navigáció',
];

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  working: 'Működik',
  not_working: 'Nem működik',
  na: 'Nem releváns',
};

/** Gumiabroncsok Állapota modul (PROJEKT_INSTRUKCIOK.md, "3 új szakértői modul" lépés,
 * C pont) -- a 4 kerékpozíció megjelenítési sorrendje és felirata. */
export const TIRE_POSITIONS: { position: TirePosition; label: string }[] = [
  { position: 'fl', label: 'Bal első (FL)' },
  { position: 'fr', label: 'Jobb első (FR)' },
  { position: 'rl', label: 'Bal hátsó (RL)' },
  { position: 'rr', label: 'Jobb hátsó (RR)' },
];

/** A gumiabroncs "koros" figyelmeztetés küszöbe (PROJEKT_INSTRUKCIOK.md: "Ha a gumik
 * életkora meghaladja az 5 évet"), lásd `lib/inspections/tireDot.ts` `decodeDot()`. */
export const TIRE_AGE_WARNING_YEARS = 5;
