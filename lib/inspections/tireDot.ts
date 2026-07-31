import { TIRE_AGE_WARNING_YEARS } from '@/lib/inspections/constants';

/**
 * Gumiabroncs DOT (Department of Transportation) gyártási kód dekódolása
 * (PROJEKT_INSTRUKCIOK.md, "Gumiabroncsok Állapota & DOT Dekódoló Modul" lépés).
 *
 * A modern (2000 utáni gyártású) gumikon a DOT kód utolsó 4 számjegye a gyártás
 * HETÉT és ÉVÉT kódolja WWYY formában -- pl. "1122" = 2022. 11. hét. (A 2000 előtti,
 * 3 számjegyű kódolás -- ahol az utolsó számjegy csak az évtizedet jelezte -- ennek az
 * MVP-nek nem célja, azoknál a gumik korukból adódóan amúgy is cserélendők lennének.)
 *
 * A gyártási dátumot a hét ELSŐ napjára közelítjük (`Date.UTC(year, 0, 1 + (week-1)*7)`)
 * -- ez néhány napos pontatlanságot okozhat a pontos ISO-hét-számításhoz képest, de a
 * "koros gumiabroncs" figyelmeztetéshez (5+ év) ez a pontosság bőven elegendő, nem
 * indokolt a teljes ISO 8601 hét-dátum algoritmus.
 */
export interface DotDecodeResult {
  week: number;
  year: number;
  manufactureDate: Date;
  /** A gumi kora években, tört értékkel (pl. 5.3). */
  ageYears: number;
  /** Igaz, ha a gumi kora eléri/meghaladja a `TIRE_AGE_WARNING_YEARS` (5 év) küszöböt. */
  isOld: boolean;
  /** Megjelenítésre kész felirat, pl. "2022. 11. hét". */
  label: string;
}

const DOT_PATTERN = /^\d{4}$/;
const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;

export function decodeDot(rawDot: string, referenceDate: Date = new Date()): DotDecodeResult | null {
  const dot = rawDot.trim();
  if (!DOT_PATTERN.test(dot)) return null;

  const week = Number(dot.slice(0, 2));
  const yearSuffix = Number(dot.slice(2, 4));
  // Hét (WW): kizárólag 01-53 lehet -- pl. "78" (mint a "7822" kódban) érvénytelen.
  if (week < 1 || week > 53) return null;

  // A DOT kód csak 2 jegyű évet kódol -- 2000+ gyártásit feltételezünk (lásd fenti
  // megjegyzés a 2000 előtti, 3 jegyű formátumról).
  const year = 2000 + yearSuffix;
  // Év (YY): nem lehet a JELENLEGI évnél későbbi -- egy gumi nem gyárthatták a jövőben.
  // Szándékosan a `referenceDate` (alapértelmezetten a mai nap) évéhez viszonyítunk
  // hardkódolt "26" helyett, hogy 2027-ben/2028-ban stb. is automatikusan helyes maradjon.
  if (year > referenceDate.getFullYear()) return null;

  const manufactureDate = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const ageYears = (referenceDate.getTime() - manufactureDate.getTime()) / MS_PER_YEAR;

  return {
    week,
    year,
    manufactureDate,
    ageYears,
    isOld: ageYears >= TIRE_AGE_WARNING_YEARS,
    label: `${year}. ${week}. hét`,
  };
}

/** A DOT kód év-részének (YY) jelenleg még érvényes maximuma, 2 jegyű, nullával
 * kitöltött formában (pl. "26" 2026-ban, "27" 2027-ben) -- a `decodeDot()`-tal azonos
 * `referenceDate`-hez viszonyítva, hogy a hibaüzenet (`StepTires.tsx`) mindig a
 * ténylegesen érvényes felső korlátot mutassa, nem egy évek múlva elavuló, beégetett
 * "26"-ot. */
export function getMaxDotYearSuffix(referenceDate: Date = new Date()): string {
  return String(referenceDate.getFullYear() % 100).padStart(2, '0');
}

/** Igaz, ha a 4 karakteres DOT kód formailag ÉS tartalmilag érvényes (lásd `decodeDot()`
 * szabályai) -- kényelmi wrapper, amikor csak a validitásra van szükség, nem a teljes
 * dekódolt eredményre (pl. `StepTires.tsx` "Tovább" gomb letiltásához). */
export function isValidDot(rawDot: string, referenceDate: Date = new Date()): boolean {
  return decodeDot(rawDot, referenceDate) !== null;
}
