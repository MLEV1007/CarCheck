import type { CarInfoState } from '@/lib/inspections/types';

/**
 * Szigorú adatvalidáció (PROJEKT_INSTRUKCIOK.md, "Szigorú adatvalidáció" lépés) az
 * "Autó adatok" lépéshez. Két réteg:
 *  - `sanitize*` függvények: minden billentyűleütésnél lefutnak (StepCarInfo.tsx
 *    `onChange`), és a mezőt azonnal a kívánt kanonikus formára hozzák (nagybetűsítés,
 *    nem megengedett karakterek eltávolítása) -- ezek SOHA nem dobnak hibát, csak tisztítanak.
 *  - `getCarInfoErrors`: a teljes `CarInfoState`-et validálja, és mezőnkénti hibaüzenetet ad
 *    vissza -- ez jelenik meg piros szöveggel a mező alatt, és ez blokkolja a "Tovább" gombot.
 */

export type CarInfoErrors = Partial<Record<keyof CarInfoState, string>>;

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1900;
const MAX_ODOMETER = 2_000_000;
const VIN_MAX_LENGTH = 17;

/** Alvázszám (VIN): nagybetűsítés + csak alfanumerikus karakterek, max 17 karakter. */
export function sanitizeVin(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, VIN_MAX_LENGTH);
}

/** Rendszám: nagybetűsítés + szóközök/kötőjelek és egyéb elválasztók eltávolítása,
 * hogy a "AA-BB-123" / "AA BB 123" / "AABB123" beírási variánsok ugyanazt a kanonikus
 * értéket adják (fontos a Dashboard kereséséhez és a duplikátumok elkerüléséhez is). */
export function sanitizeLicensePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Évjárat: csak számjegyek, max 4 karakter (nincs itt tartomány-korlátozás -- azt a
 * `validateYear` végzi, hogy beírás közben még lehessen pl. "20" állapotban lenni). */
export function sanitizeYear(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 4);
}

/** Km óra állás: csak számjegyek (nincs felső korlát itt -- azt a `validateOdometer` végzi). */
export function sanitizeOdometer(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function validateYear(raw: string): string | null {
  if (raw.trim() === '') return null; // opcionális mező
  if (!/^\d{4}$/.test(raw)) return 'Az évjárat 4 számjegyű szám legyen (pl. 2019).';
  const year = Number(raw);
  if (year < MIN_YEAR || year > CURRENT_YEAR) {
    return `Az évjárat ${MIN_YEAR} és ${CURRENT_YEAR} között lehet.`;
  }
  return null;
}

export function validateOdometer(raw: string): string | null {
  if (raw.trim() === '') return null; // opcionális mező
  if (!/^\d+$/.test(raw)) return 'A km óra állás csak pozitív egész szám lehet.';
  const odometer = Number(raw);
  if (odometer < 0 || odometer > MAX_ODOMETER) {
    return `A km óra állás 0 és ${MAX_ODOMETER.toLocaleString('hu-HU')} km között lehet.`;
  }
  return null;
}

export function validateVin(raw: string): string | null {
  if (raw.trim() === '') return null; // opcionális mező
  if (raw.length > VIN_MAX_LENGTH) return `Az alvázszám legfeljebb ${VIN_MAX_LENGTH} karakter lehet.`;
  return null;
}

export function validateLicensePlate(raw: string): string | null {
  if (raw.trim() === '') return 'A rendszám megadása kötelező.';
  return null;
}

export function validateCarBrand(raw: string): string | null {
  if (raw.trim() === '') return 'A márka megadása kötelező.';
  return null;
}

/** A teljes "Autó adatok" lépés validálása -- a `Tovább` gomb csak akkor engedélyezett,
 * ha ennek a visszatérési objektumnak minden mezője `undefined`. */
export function getCarInfoErrors(value: CarInfoState): CarInfoErrors {
  const errors: CarInfoErrors = {};

  const brandError = validateCarBrand(value.carBrand);
  if (brandError) errors.carBrand = brandError;

  const plateError = validateLicensePlate(value.licensePlate);
  if (plateError) errors.licensePlate = plateError;

  const yearError = validateYear(value.year);
  if (yearError) errors.year = yearError;

  const odometerError = validateOdometer(value.odometer);
  if (odometerError) errors.odometer = odometerError;

  const vinError = validateVin(value.vin);
  if (vinError) errors.vin = vinError;

  return errors;
}

export function isCarInfoValid(value: CarInfoState): boolean {
  return Object.keys(getCarInfoErrors(value)).length === 0;
}

/** Diagnosztikai hibakód (pl. "P0300"): nagybetűsítés + csak alfanumerikus karakterek,
 * max 8 karakter (bőven elég a szabványos OBD-II kódoknak, pl. "P0300", "U0100"). */
export function sanitizeDiagnosticCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

/** Gumiabroncs DOT kód: csak számjegyek, pontosan 4 karakter (WWYY -- lásd `tireDot.ts`). */
export function sanitizeDotCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 4);
}

/** Gumiabroncs profilmélység (mm): számjegyek + legfeljebb egy tizedespont, max 5
 * karakter (pl. "12.5") -- reális profilmélység 0-20 mm körül mozog. */
export function sanitizeMm(raw: string): string {
  let value = raw.replace(/[^0-9.]/g, '');
  const firstDot = value.indexOf('.');
  if (firstDot !== -1) {
    value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, '');
  }
  return value.slice(0, 5);
}

/** Festékvastagság mérési pont (µm): csak számjegyek, max 4 karakter (0-2000 µm bőven
 * elég reális tartomány) -- lásd StepPaintMeasurements.tsx 3 pontos beviteli mezői. */
export function sanitizeMicron(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 4);
}
