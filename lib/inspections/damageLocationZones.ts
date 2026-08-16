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
 * **2026-08-16 (folyt.) -- JAVÍTÁS: "bal"/"jobb" mostantól JÁRMŰ-RELATÍV, nem kép-relatív.**
 * A felhasználó visszajelzése szerint az első verzió ("bal oldal" = a KÉP bal fele) rendszeresen
 * összekeveredett a szakmai, jármű-relatív "bal oldal" (= vezetőoldal, ahogy egy vizsgáló a
 * "bal hátsó sárvédő" kifejezést használná) értelmezéssel -- a modell (és minden autós ember)
 * TERMÉSZETESEN jármű-relatívan gondolkodik "bal"/"jobb" kapcsán, ezért a kép-relatív definíció
 * maga volt a hiba forrása, NEM a modell megbízhatatlansága. A jármű-relatív "bal oldal" fix,
 * geometriai definíció (vezetőülésből előre nézve a bal kéz oldala), amiből LEVEZETHETŐ, hogy
 * az egyes nézeteken a KÉPEN hol jelenik meg -- ez NEM találgatás, hanem egyszerű vetület-
 * geometria (iránytű-analógiával levezetve, lásd lent nézetenként):
 * - **Elölnézet (a jármű orra a fényképező felé néz):** a fényképező és a jármű "szemben áll
 *   egymással" -- a jármű BAL oldala (nyugat, ha az orr északra néz és a fényképező délről néz
 *   rá) a fényképező JOBB kezéhez esik közelebb -- tehát a KÉPEN JOBBRA látszik. A jármű JOBB
 *   oldala a KÉPEN BALRA.
 * - **Hátulnézet (a jármű far-/csomagtérajtaja felé néz a fényképező):** a fényképező és a
 *   jármű "egy irányba néz" (mindkettő "előre", észak felé) -- NINCS tükröződés, a jármű BAL
 *   oldala a KÉPEN IS BALRA látszik, a JOBB oldala a KÉPEN IS JOBBRA.
 * - **Oldalnézet:** ha a jármű BAL oldalát fényképezik (a fényképező a jármű nyugati oldalán
 *   áll, kelet felé néz), a jármű orra (észak) a fényképező BAL kezéhez esik -- tehát a KÉPEN
 *   BALRA néz. Ha a JOBB oldalát fényképezik (fényképező keleten áll, nyugat felé néz), az orr
 *   a KÉPEN JOBBRA néz. Ez pontosan megegyezik a `public/cars.webp` KÉT oldalnézet-sorával: a
 *   FELSŐ sor orra a KÉPEN BALRA néz (=jármű BAL/vezetőoldala), az ALSÓ sor orra JOBBRA néz
 *   (=jármű JOBB/utasoldala) -- ellenőrizve Python/Pillow-val: az alsó sor a felső sor
 *   ~88%-ban egyező, VÍZSZINTESEN TÜKRÖZÖTT párja (`diff` tükrözve: 11.8 vs tükrözés nélkül:
 *   49.4 pixelérték-eltérés), tehát a két sor ténylegesen a két oldalt ábrázolja, nem
 *   véletlenszerű duplikátum.
 *
 * **HA a fenti levezetés a gyakorlati tesztelés során mégis fordítva bizonyulna** (pl. a
 * `public/cars.webp` illusztrátora nem a fenti, fényképészeti vetület-konvenciót követte),
 * a teendő KIZÁRÓLAG ennek a fájlnak a `DAMAGE_LOCATION_ZONE_POINT` tábláját érinti -- cseréld
 * fel a `front_left`/`front_right`, a `rear_left`/`rear_right`, ill. a `side_left_*`/
 * `side_right_*` csoportok KOORDINÁTÁIT (a `y`-okat NE, azok a sor-magasságot jelölik), a
 * rendszerutasítást (`scan-damage/route.ts`) NEM kell módosítani, mert az a jármű-relatív
 * fogalmat kéri a modelltől, nem a kép-relatív pozíciót.
 *
 * **A koordináták eredete:** a `public/cars.webp` (850x563px) kompozit kép 5 al-nézetének
 * (elölnézet/hátulnézet/2 oldalnézet/felülnézet) képkocka-határait egy egyszeri, offline
 * Python/Pillow szkript mérte meg (a nem-fehér pixelek sor-/oszlop-tartományai alapján, a
 * fehér "hézagok" mentén elválasztva a 3 sort és a bal/jobb blokkot) -- ez a fájl a MÁR
 * KISZÁMOLT, statikus eredményt tárolja, a mérés futásidőben NEM ismétlődik meg (ugyanaz az
 * elv, mint a `carSilhouette.ts` "egyszeri generálás, statikus konstans" mintája). Minden
 * zóna-pont az adott al-nézet befoglaló téglalapjának egy pontja (elöl/hátul esetén a szélesség
 * HARMADOLÁSÁVAL bal/közép/jobb, oldalnézetnél a szélesség harmadolásával elöl/közép/hátul,
 * mindkét oldalnézet-sor önálló y-magassággal). HA a `cars.webp` referenciakép valaha
 * lecserélődik/átrendeződik, ezeket a koordinátákat ÚJRA KELL mérni, különben a jelölő a régi
 * elrendezéshez képest fog "csúszni".
 */

import type { DamageType } from '@/lib/inspections/types';

export const DAMAGE_LOCATION_ZONES = [
  'front_left',
  'front_center',
  'front_right',
  'rear_left',
  'rear_center',
  'rear_right',
  'side_left_front',
  'side_left_middle',
  'side_left_rear',
  'side_right_front',
  'side_right_middle',
  'side_right_rear',
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
 * meg ("Becsült hely: ..."), hogy a szakértő szövegesen is lássa, mielőtt elfogadja. A "bal"/
 * "jobb" mindenhol JÁRMŰ-RELATÍV (vezetőoldal/utasoldal) -- lásd a fájl-JSDoc-ot -- ezért a
 * felirat zárójelben mindig kiírja a vezetőoldal/utasoldal megfelelést is, hogy a kép-relatív
 * "bal"/"jobb" értelmezéssel ne lehessen összekeverni. */
export const DAMAGE_LOCATION_ZONE_LABEL: Record<DamageLocationZone, string> = {
  front_left: 'Elöl, a jármű bal oldalán (vezetőoldal)',
  front_center: 'Elöl, középen',
  front_right: 'Elöl, a jármű jobb oldalán (utasoldal)',
  rear_left: 'Hátul, a jármű bal oldalán (vezetőoldal)',
  rear_center: 'Hátul, középen',
  rear_right: 'Hátul, a jármű jobb oldalán (utasoldal)',
  side_left_front: 'Bal oldalon (vezetőoldal), elöl -- első ajtó/kerék környéke',
  side_left_middle: 'Bal oldalon (vezetőoldal), középen',
  side_left_rear: 'Bal oldalon (vezetőoldal), hátul -- hátsó ajtó/kerék környéke',
  side_right_front: 'Jobb oldalon (utasoldal), elöl -- első ajtó/kerék környéke',
  side_right_middle: 'Jobb oldalon (utasoldal), középen',
  side_right_rear: 'Jobb oldalon (utasoldal), hátul -- hátsó ajtó/kerék környéke',
  roof: 'Tetőn',
};

/** A `public/cars.webp` (850x563px) képen belüli, SZÁZALÉKBAN (0-100) kifejezett pont minden
 * zónához -- lásd a fájl-JSDoc "A koordináták eredete" ÉS a "bal"/"jobb" vetület-geometriai
 * levezetését. FIGYELEM: a `front_left`/`front_right` KOORDINÁTÁI FEL VANNAK CSERÉLVE a
 * kép-relatív elhelyezkedésükhöz képest (a `front_left` -- jármű bal oldala -- a `cars.webp`
 * elölnézetének KÉP SZERINT JOBB oldali harmadára mutat) -- ez SZÁNDÉKOS, lásd a fájl-JSDoc
 * elölnézet-levezetését, NEM elírás. A `rear_left`/`rear_right` NINCS felcserélve (hátulnézetnél
 * nincs tükröződés). Ugyanaz a koordináta-rendszer, mint a `DamagePointState.x`/`y` mezőié
 * (`CarPointPin.tsx`). */
export const DAMAGE_LOCATION_ZONE_POINT: Record<DamageLocationZone, { x: number; y: number }> = {
  front_left: { x: 25.7, y: 20.3 },
  front_center: { x: 17.1, y: 20.3 },
  front_right: { x: 8.5, y: 20.3 },
  rear_left: { x: 42.8, y: 20.3 },
  rear_center: { x: 50.9, y: 20.3 },
  rear_right: { x: 58.9, y: 20.3 },
  // FELSŐ oldalnézet-sor (y~51.6) -- orra a képen BALRA néz -- lásd a fájl-JSDoc oldalnézet-
  // levezetését -- ez a jármű BAL (vezető-) oldala. Az "elöl" (nose-hoz közeli) a sor KÉP
  // SZERINT BAL harmada, a "hátul" a KÉP SZERINT JOBB harmada.
  side_left_front: { x: 13.9, y: 51.6 },
  side_left_middle: { x: 33.7, y: 51.6 },
  side_left_rear: { x: 53.5, y: 51.6 },
  // ALSÓ oldalnézet-sor (y~81.0) -- orra a képen JOBBRA néz -- ez a jármű JOBB (utas-) oldala.
  // Az "elöl" itt a KÉP SZERINT JOBB harmad, a "hátul" a KÉP SZERINT BAL harmad (tükrözött a
  // felső sorhoz képest).
  side_right_front: { x: 53.9, y: 81.0 },
  side_right_middle: { x: 33.9, y: 81.0 },
  side_right_rear: { x: 14.0, y: 81.0 },
  roof: { x: 82.2, y: 50.6 },
};

/** Csak dokumentációs célból újra-exportálva -- lásd `scan-damage/route.ts`, ahol a
 * rendszerutasítás a `DamageType` katalógust (`DAMAGE_TYPES`) a `parse-equipment`/
 * `scan-defect` mintájához hasonlóan explicit felsorolja. */
export type { DamageType };
