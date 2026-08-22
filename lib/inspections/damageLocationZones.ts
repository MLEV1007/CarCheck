/**
 * **2026-08-17, HASZNÁLATON KÍVÜL.** A felhasználó explicit kérésére ("Nincs szükség az
 * ai-nál arra, hogy elhelyezze és meghatározza a hiba pontos helyét, majd bejelölje azt") az
 * AI-alapú hely-becslés funkció TELJESEN eltávolításra került a `DamageCanvas.tsx`-ből és a
 * `/api/ai/scan-damage` route-ból, ez a fájl semmilyen élő kódból nincs importálva. A
 * projekt "ne töröld jóváhagyás nélkül" konvenciója szerint (lásd `carSilhouette.ts` hasonló
 * esetét) a fájl változatlanul itt maradt, ha valaha újra szükség lenne rá. A lenti dokumentáció
 * a funkció EREDETI (2026-08-16-i) indoklását írja le.
 *
 * Zárt "hely-zóna" katalógus a Sérülés- és Hibatérkép (`StepDamageMap.tsx` / `DamageCanvas.tsx`)
 * AI-alapú, fotóból induló sérülés-felismeréséhez (`/api/ai/scan-damage`, 2026-08-16, a
 * felhasználó explicit kérésére: "ugyanaz a rendszer, mint a Hibák és Média AI-elemzése,
 * DE jelölje is be, hogy nagyjából hol lehet a sérülés").
 *
 * **2026-08-17 FRISSÍTÉS, nézetenkénti képek (lásd `lib/inspections/carViews.ts`):** a
 * `cars.webp` egyetlen kompozit képe helyett MOSTANTÓL 5 külön kép/fül (elöl/bal oldal/
 * hátul/jobb oldal/felül) létezik, egy zóna ezért már NEM elég egyetlen `{x,y}` ponttal,
 * meg kell mondania AZT IS, MELYIK fülre kell váltani (`view`). A lenti "bal"/"jobb"
 * vetület-geometriai levezetés (jármű-relatív irány -> hol jelenik meg a KÉPEN) továbbra is
 * érvényes, csak most már nem egy kompozit kép egy-egy sávján belüli pozíciót jelent, hanem
 * a MEGFELELŐ ÖNÁLLÓ kép/fül belsejét. A `side_right_*` zónák a `right` fülre mutatnak, ami
 * a `car-side.webp` CSS-sel (`scaleX(-1)`) TÜKRÖZÖTT megjelenítése (lásd `CarViewImage.tsx`),
 * az `x` koordináták ezért a MEGJELENÍTETT (tükrözött) képre vonatkoznak, nem a fájlban
 * tárolt eredeti pixelekre (lásd lent a `side_right_*` bejegyzéseknél).
 *
 * **MIÉRT ZÁRT ZÓNA-KATALÓGUS, NEM NYERS x/y KOORDINÁTA A MODELLTŐL:** a `PLAN_ai_scan_defect.md`
 * 3. pontjában leírt hallucináció-védelmi elv itt MÉG SZIGORÚBBAN érvényes, a Gemini modell
 * a felhasználó KÖZELI sérülés-fotóját látja, a `public/cars.webp` REFERENCIAKÉPET (amin a
 * pontot végül elhelyezzük) SOSE kapja meg bemenetként. Egy nyers "add vissza a pontos x/y
 * pixel-koordinátát" kérés ezért ÉRTELMEZHETETLEN feladat lenne a modell számára, nincs mihez
 * viszonyítania a válaszát, a kimenet garantáltan kitalált (hallucinált) szám lenne. Ehelyett a
 * modell egy ZÁRT, a `parse-equipment`/`scan-defect` mintáját követő katalógusból választ egy
 * NEVESÍTETT zónát (pl. "front_left") KIZÁRÓLAG a fotón ténylegesen látható tájékozódási pontok
 * (lámpa, lökhárító, ajtó, kerék stb.) alapján, ezt a szerver (`sanitizeScanDamageResponse()`
 * a `scan-damage/route.ts`-ben) MÉG EGYSZER ellenőrzi, és a kliens (`DamageCanvas.tsx`) ebből a
 * fájlból, DETERMINISZTIKUSAN (nem AI-val) számolt, FIX koordinátára képezi le.
 *
 * **2026-08-16 (folyt.), JAVÍTÁS: "bal"/"jobb" mostantól JÁRMŰ-RELATÍV, nem kép-relatív.**
 * A felhasználó visszajelzése szerint az első verzió ("bal oldal" = a KÉP bal fele) rendszeresen
 * összekeveredett a szakmai, jármű-relatív "bal oldal" (= vezetőoldal, ahogy egy vizsgáló a
 * "bal hátsó sárvédő" kifejezést használná) értelmezéssel, a modell (és minden autós ember)
 * TERMÉSZETESEN jármű-relatívan gondolkodik "bal"/"jobb" kapcsán, ezért a kép-relatív definíció
 * maga volt a hiba forrása, NEM a modell megbízhatatlansága. A jármű-relatív "bal oldal" fix,
 * geometriai definíció (vezetőülésből előre nézve a bal kéz oldala), amiből LEVEZETHETŐ, hogy
 * az egyes nézeteken a KÉPEN hol jelenik meg, ez NEM találgatás, hanem egyszerű vetület-
 * geometria (iránytű-analógiával levezetve, lásd lent nézetenként):
 * - **Elölnézet (a jármű orra a fényképező felé néz):** a fényképező és a jármű "szemben áll
 *   egymással", a jármű BAL oldala (nyugat, ha az orr északra néz és a fényképező délről néz
 *   rá) a fényképező JOBB kezéhez esik közelebb, tehát a KÉPEN JOBBRA látszik. A jármű JOBB
 *   oldala a KÉPEN BALRA.
 * - **Hátulnézet (a jármű far-/csomagtérajtaja felé néz a fényképező):** a fényképező és a
 *   jármű "egy irányba néz" (mindkettő "előre", észak felé), NINCS tükröződés, a jármű BAL
 *   oldala a KÉPEN IS BALRA látszik, a JOBB oldala a KÉPEN IS JOBBRA.
 * - **Oldalnézet:** ha a jármű BAL oldalát fényképezik (a fényképező a jármű nyugati oldalán
 *   áll, kelet felé néz), a jármű orra (észak) a fényképező BAL kezéhez esik, tehát a KÉPEN
 *   BALRA néz. Ha a JOBB oldalát fényképezik (fényképező keleten áll, nyugat felé néz), az orr
 *   a KÉPEN JOBBRA néz. Ez pontosan megegyezik a `public/cars.webp` KÉT oldalnézet-sorával: a
 *   FELSŐ sor orra a KÉPEN BALRA néz (=jármű BAL/vezetőoldala), az ALSÓ sor orra JOBBRA néz
 *   (=jármű JOBB/utasoldala), ellenőrizve Python/Pillow-val: az alsó sor a felső sor
 *   ~88%-ban egyező, VÍZSZINTESEN TÜKRÖZÖTT párja (`diff` tükrözve: 11.8 vs tükrözés nélkül:
 *   49.4 pixelérték-eltérés), tehát a két sor ténylegesen a két oldalt ábrázolja, nem
 *   véletlenszerű duplikátum.
 *
 * **HA a fenti levezetés a gyakorlati tesztelés során mégis fordítva bizonyulna** (pl. a
 * `public/cars.webp` illusztrátora nem a fenti, fényképészeti vetület-konvenciót követte),
 * a teendő KIZÁRÓLAG ennek a fájlnak a `DAMAGE_LOCATION_ZONE_POINT` tábláját érinti, cseréld
 * fel a `front_left`/`front_right`, a `rear_left`/`rear_right`, ill. a `side_left_*`/
 * `side_right_*` csoportok KOORDINÁTÁIT (a `y`-okat NE, azok a sor-magasságot jelölik), a
 * rendszerutasítást (`scan-damage/route.ts`) NEM kell módosítani, mert az a jármű-relatív
 * fogalmat kéri a modelltől, nem a kép-relatív pozíciót.
 *
 * **A koordináták eredete:** a `public/cars.webp` (850x563px) kompozit kép 5 al-nézetének
 * (elölnézet/hátulnézet/2 oldalnézet/felülnézet) képkocka-határait egy egyszeri, offline
 * Python/Pillow szkript mérte meg (a nem-fehér pixelek sor-/oszlop-tartományai alapján, a
 * fehér "hézagok" mentén elválasztva a 3 sort és a bal/jobb blokkot), ez a fájl a MÁR
 * KISZÁMOLT, statikus eredményt tárolja, a mérés futásidőben NEM ismétlődik meg (ugyanaz az
 * elv, mint a `carSilhouette.ts` "egyszeri generálás, statikus konstans" mintája). Minden
 * zóna-pont az adott al-nézet befoglaló téglalapjának egy pontja (elöl/hátul esetén a szélesség
 * HARMADOLÁSÁVAL bal/közép/jobb, oldalnézetnél a szélesség harmadolásával elöl/közép/hátul,
 * mindkét oldalnézet-sor önálló y-magassággal). HA a `cars.webp` referenciakép valaha
 * lecserélődik/átrendeződik, ezeket a koordinátákat ÚJRA KELL mérni, különben a jelölő a régi
 * elrendezéshez képest fog "csúszni".
 */

import type { DamageType } from '@/lib/inspections/types';
import type { CarPointView } from '@/lib/inspections/carViews';

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

/** `'unclear'`: a modell NEM tudta egyértelműen eldönteni a helyet a fotóból, lásd a
 * fájl-JSDoc-ot és a `scan-damage/route.ts` rendszerutasítását. Ilyenkor a `DamageCanvas.tsx`
 * NEM helyez el automatikusan jelölőt, hanem a felhasználót kéri, hogy kattintson a képre. */
export type DamageLocationZoneOrUnclear = DamageLocationZone | 'unclear';

export function isDamageLocationZone(value: unknown): value is DamageLocationZone {
  return typeof value === 'string' && (DAMAGE_LOCATION_ZONES as readonly string[]).includes(value);
}

/** Magyar, felhasználó-barát felirat, a `DamageCanvas.tsx` "AI javaslat" panelén jelenik
 * meg ("Becsült hely: ..."), hogy a szakértő szövegesen is lássa, mielőtt elfogadja. A "bal"/
 * "jobb" mindenhol JÁRMŰ-RELATÍV (vezetőoldal/utasoldal), lásd a fájl-JSDoc-ot, ezért a
 * felirat zárójelben mindig kiírja a vezetőoldal/utasoldal megfelelést is, hogy a kép-relatív
 * "bal"/"jobb" értelmezéssel ne lehessen összekeverni. */
export const DAMAGE_LOCATION_ZONE_LABEL: Record<DamageLocationZone, string> = {
  front_left: 'Elöl, a jármű bal oldalán (vezetőoldal)',
  front_center: 'Elöl, középen',
  front_right: 'Elöl, a jármű jobb oldalán (utasoldal)',
  rear_left: 'Hátul, a jármű bal oldalán (vezetőoldal)',
  rear_center: 'Hátul, középen',
  rear_right: 'Hátul, a jármű jobb oldalán (utasoldal)',
  side_left_front: 'Bal oldalon (vezetőoldal), elöl, első ajtó/kerék környéke',
  side_left_middle: 'Bal oldalon (vezetőoldal), középen',
  side_left_rear: 'Bal oldalon (vezetőoldal), hátul, hátsó ajtó/kerék környéke',
  side_right_front: 'Jobb oldalon (utasoldal), elöl, első ajtó/kerék környéke',
  side_right_middle: 'Jobb oldalon (utasoldal), középen',
  side_right_rear: 'Jobb oldalon (utasoldal), hátul, hátsó ajtó/kerék környéke',
  roof: 'Tetőn',
};

/** Nézet (fül) + az azon belüli, SZÁZALÉKBAN (0-100) kifejezett pont minden zónához, lásd
 * a fájl-JSDoc "2026-08-17 FRISSÍTÉS" szakaszát ÉS a "bal"/"jobb" vetület-geometriai
 * levezetését. FIGYELEM: a `front_left`/`front_right` KOORDINÁTÁI FEL VANNAK CSERÉLVE a
 * kép-relatív elhelyezkedésükhöz képest (a `front_left`, jármű bal oldala, a
 * `car-front.webp` KÉP SZERINT JOBB oldali harmadára mutat), ez SZÁNDÉKOS, lásd a fájl-JSDoc
 * elölnézet-levezetését, NEM elírás. A `rear_left`/`rear_right` NINCS felcserélve (hátulnézetnél
 * nincs tükröződés). Ugyanaz a koordináta-rendszer, mint a `DamagePointState.x`/`y` mezőié
 * (`CarPointPin.tsx`), KONTÉNER-relatív, nem a kép fájlban tárolt pixeleire vonatkozik, ezért
 * a `side_right_*` `x` értékei a MEGJELENÍTETT (CSS-sel tükrözött) képre vonatkoznak: a
 * `side_left_*`-hoz képest `100 - x`, hogy a tükrözött megjelenítésen is a jármű valódi elejére/
 * hátuljára mutassanak (lásd `CarViewImage.tsx` a tükrözésért). */
export const DAMAGE_LOCATION_ZONE_POINT: Record<DamageLocationZone, { view: CarPointView; x: number; y: number }> = {
  front_left: { view: 'front', x: 75, y: 58 },
  front_center: { view: 'front', x: 50, y: 58 },
  front_right: { view: 'front', x: 25, y: 58 },
  rear_left: { view: 'rear', x: 25, y: 58 },
  rear_center: { view: 'rear', x: 50, y: 58 },
  rear_right: { view: 'rear', x: 75, y: 58 },
  // `left` fül (`car-side.webp`, NEM tükrözve), orra a képen BALRA néz, lásd a fájl-JSDoc
  // oldalnézet-levezetését, ez a jármű BAL (vezető-) oldala. Az "elöl" (nose-hoz közeli) a
  // KÉP SZERINT BAL harmad, a "hátul" a KÉP SZERINT JOBB harmad.
  side_left_front: { view: 'left', x: 25, y: 55 },
  side_left_middle: { view: 'left', x: 50, y: 55 },
  side_left_rear: { view: 'left', x: 75, y: 55 },
  // `right` fül, UGYANAZ a `car-side.webp` fájl, de MEGJELENÍTÉSKOR `scaleX(-1)`-gyel
  // tükrözve, a `left`-hez képest `100 - x`, hogy a tükrözött képen is helyesen az elejére/
  // hátuljára mutasson.
  side_right_front: { view: 'right', x: 75, y: 55 },
  side_right_middle: { view: 'right', x: 50, y: 55 },
  side_right_rear: { view: 'right', x: 25, y: 55 },
  roof: { view: 'top', x: 50, y: 50 },
};

/** Csak dokumentációs célból újra-exportálva, lásd `scan-damage/route.ts`, ahol a
 * rendszerutasítás a `DamageType` katalógust (`DAMAGE_TYPES`) a `parse-equipment`/
 * `scan-defect` mintájához hasonlóan explicit felsorolja. */
export type { DamageType };
