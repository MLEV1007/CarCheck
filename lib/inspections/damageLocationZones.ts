/**
 * Zárt "hely-zóna" katalógus a Sérülés- és Hibatérkép (`StepDamageMap.tsx` / `DamageCanvas.tsx`)
 * AI-alapú, fotóból induló sérülés-felismeréséhez (`/api/ai/scan-damage`, 2026-08-16, a
 * felhasználó explicit kérésére: "ugyanaz a rendszer, mint a Hibák és Média AI-elemzése,
 * DE jelölje is be, hogy nagyjából hol lehet a sérülés").
 *
 * **MIÉRT ZÁRT ZÓNA-KATALÓGUS, NEM NYERS x/y KOORDINÁTA A MODELLTŐL:** a `PLAN_ai_scan_defect.md`
 * 3. pontjában leírt hallucináció-védelmi elv itt MÉG SZIGORÚBBAN érvényes -- a Gemini modell
 * a felhasználó KÖZELI sérülés-fotóját látja, a `public/cars.webp` REFERENCIAKÉPET (amin a
 * pontot végül elhelyezzük) SOSE kapja meg bemenetként. Egy nyers "add vissza a pontos x/y
 * pixel-koordinátát" kérés ezért ÉRTELMEZHETETLEN feladat lenne a modell számára -- nincs mihez
 * viszonyítania a válaszát, a kimenet garantáltan kitalált (hallucinált) szám lenne. Ehelyett a
 * modell egy ZÁRT, a `parse-equipment`/`scan-defect` mintáját követő katalógusból választ egy
 * NEVESÍTETT zónát (pl. "front_left") KIZÁRÓLAG a fotón ténylegesen látható tájékozódási pontok
 * (lámpa, lökhárító, ajtó, kerék stb.) alapján -- ezt a szerver (`sanitizeScanDamageResponse()`
 * a `scan-damage/route.ts`-ben) MÉG EGYSZER ellenőrzi, és a kliens (`DamageCanvas.tsx`) ebből a
 * fájlból, DETERMINISZTIKUSAN (nem AI-val) számolt, FIX koordinátára képezi le.
 *
 * **A koordináták eredete:** a `public/cars.webp` (850x563px) kompozit kép 5 al-nézetének
 * (elölnézet/hátulnézet/2 oldalnézet/felülnézet) képkocka-határait egy egyszeri, offline
 * Python/Pillow szkript mérte meg (a nem-fehér pixelek sor-/oszlop-tartományai alapján, a
 * fehér "hézagok" mentén elválasztva a 3 sort és a bal/jobb blokkot) -- ez a fájl a MÁR
 * KISZÁMOLT, statikus eredményt tárolja, a mérés futásidőben NEM ismétlődik meg (ugyanaz az
 * elv, mint a `carSilhouette.ts` "egyszeri generálás, statikus konstans" mintája). Minden
 * zóna-pont az adott al-nézet befoglaló téglalapjának a KÖZÉPPONTJA (elöl/hátul/oldal esetén
 * a szélesség HARMADOLÁSÁVAL bal/közép/jobb -- ill. oldalnézetnél elöl/közép/hátul --
 * alzónákra bontva). HA a `cars.webp` referenciakép valaha lecserélődik/átrendeződik, ezeket a
 * koordinátákat ÚJRA KELL mérni, különben a jelölő a régi elrendezéshez képest fog "csúszni".
 *
 * **Az oldalnézet két sora (`side_front`/`side_middle`/`side_rear`) SZÁNDÉKOSAN NEM
 * különbözteti meg a jármű bal/jobb oldalát** -- a `cars.webp`-n a 2 oldalnézet-sor egymás
 * tükörképe (mindkettő ugyanazt az oldal-sziluettet mutatja), és egy közeli sérülés-fotóból
 * amúgy sem állapítható meg megbízhatóan, hogy a jármű melyik fizikai oldaláról készült --
 * ezt a `scan-damage/route.ts` rendszerutasítása explicit TILTJA kitalálni. A zóna-pontok ezért
 * mindig a FELSŐ oldalnézet-sorra mutatnak (`y` a 2. sor bbox-ának középpontja) -- a felhasználó
 * úgyis csak "nagyjából" jelölést kap, amit a mentés előtt ellenőriz/módosíthat.
 */

import type { DamageType } from '@/lib/inspections/types';

export const DAMAGE_LOCATION_ZONES = [
  'front_left',
  'front_center',
  'front_right',
  'rear_left',
  'rear_center',
  'rear_right',
  'side_front',
  'side_middle',
  'side_rear',
  'roof',
] as const;

export type DamageLocationZone = (typeof DAMAGE_LOCATION_ZONES)[number];

/** `'unclear'`: a modell NEM tudta egyértelműen eldönteni a helyet a fotóból -- lásd a
 * fájl-JSDoc-ot és a `scan-damage/route.ts` rendszerutasítását. Ilyenkor a `DamageCanvas.tsx`
 * NEM helyez el automatikusan jelölőt, hanem a felhasználót kéri, hogy kattintson a képre. */
export type DamageLocationZoneOrUnclear = DamageLocationZone | 'unclear';

export function isDamageLocationZone(value: unknown): value is DamageLocationZone {
  return typeof value === 'string' && (DAMAGE_LOCATION_ZONES as readonly string[]).includes(value);
}

/** Magyar, felhasználó-barát felirat -- a `DamageCanvas.tsx` "AI javaslat" panelén jelenik
 * meg ("Becsült hely: ..."), hogy a szakértő szövegesen is lássa, mielőtt elfogadja. */
export const DAMAGE_LOCATION_ZONE_LABEL: Record<DamageLocationZone, string> = {
  front_left: 'Elöl, a kép szerint bal oldalon',
  front_center: 'Elöl, középen',
  front_right: 'Elöl, a kép szerint jobb oldalon',
  rear_left: 'Hátul, a kép szerint bal oldalon',
  rear_center: 'Hátul, középen',
  rear_right: 'Hátul, a kép szerint jobb oldalon',
  side_front: 'Oldalt, elöl (első ajtó/kerék környéke)',
  side_middle: 'Oldalt, középen',
  side_rear: 'Oldalt, hátul (hátsó ajtó/kerék környéke)',
  roof: 'Tetőn',
};

/** A `public/cars.webp` (850x563px) képen belüli, SZÁZALÉKBAN (0-100) kifejezett középpont
 * minden zónához -- lásd a fájl-JSDoc "A koordináták eredete" szakaszát a méréshez. Ugyanaz a
 * koordináta-rendszer, mint a `DamagePointState.x`/`y` mezőié (`CarPointPin.tsx`). */
export const DAMAGE_LOCATION_ZONE_POINT: Record<DamageLocationZone, { x: number; y: number }> = {
  front_left: { x: 8.5, y: 20.3 },
  front_center: { x: 17.1, y: 20.3 },
  front_right: { x: 25.7, y: 20.3 },
  rear_left: { x: 42.8, y: 20.3 },
  rear_center: { x: 50.9, y: 20.3 },
  rear_right: { x: 58.9, y: 20.3 },
  side_front: { x: 13.9, y: 51.6 },
  side_middle: { x: 33.7, y: 51.6 },
  side_rear: { x: 53.5, y: 51.6 },
  roof: { x: 82.2, y: 50.6 },
};

/** Csak dokumentációs célból újra-exportálva -- lásd `scan-damage/route.ts`, ahol a
 * rendszerutasítás a `DamageType` katalógust (`DAMAGE_TYPES`) a `parse-equipment`/
 * `scan-defect` mintájához hasonlóan explicit felsorolja. */
export type { DamageType };
