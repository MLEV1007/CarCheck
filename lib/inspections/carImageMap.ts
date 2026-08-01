/**
 * Képalapú (image-based) hotspot-térkép a `public/cars.webp` referenciaképhez
 * (PROJEKT_INSTRUKCIOK.md, "Képalapú interaktív rétegvastagság-mérő hőtérkép" lépés).
 * A kép 850×563 px, 5 nézettel: bal felül elölnézet, középen felül hátulnézet, jobb
 * oldalon (teljes magasságban) felülnézet, alul két oldalnézet (a felső = BAL oldal,
 * az alsó = JOBB oldal -- lásd lent a pontos indoklást).
 *
 * A koordináták a kép PIXEL-tartalmának ténylegesen mért (nem becsült!) határvonalai
 * alapján lettek kiszámolva -- a képet Python/Pillow-val elemezve (nem fehér pixelek
 * sor-/oszlop-vetülete) határoztuk meg az 5 rész-kép pontos bounding boxát:
 *   - Elölnézet:  x 36–255,  y 34–195
 *   - Hátulnézet: x 330–535, y 35–195
 *   - Felülnézet: x 586–813, y 32–537
 *   - Oldalnézet 1 (BAL oldal): x 34–539,  y 212–368
 *   - Oldalnézet 2 (JOBB oldal): x 35–542, y 376–535
 * Ezekben a téglalapokban helyeztük el a karosszéria-elemek anatómiai szempontból
 * legpontosabb pozícióját (pl. az ajtó a kettő közötti oszlopok között, a sárvédő a
 * kerékjárat fölött stb.), majd az abszolút pixel-koordinátákat a teljes kép
 * százalékos (`top`/`left`) értékeire váltottuk, hogy a hotspot-pozíciók a kép
 * TETSZŐLEGES reszponzív méreténél helyesen igazodjanak (a kép `w-full`, a
 * konténer `position: relative`, minden hotspot `position: absolute` a saját
 * `top%`/`left%` értékén).
 *
 * Miért a felső oldalnézet a BAL, az alsó a JOBB oldal? A referenciaképen mindkét
 * oldalnézet ugyanabból a szögből (orr balra, csomagtartó jobbra) van rajzolva --
 * gyári vektor-illusztrációs készletekben ritka a tükrözött jobb oldali nézet külön
 * megrajzolva. A projekt-instrukció explicit példája ("A Bal első ajtó a középső
 * (bal oldali profil) autónál legyen") alapján a FELSŐ (középső pozíciójú) oldalnézetet
 * jelöltük ki BAL oldalnak, az ALSÓ (harmadik sorban lévő) oldalnézetet pedig JOBB
 * oldalnak -- ez egy tudatos, dokumentált konvenció, nem tükrözött grafika.
 */

export interface CarImageHotspot {
  elementName: string;
  /** Százalékos pozíció a kép bal szélétől (CSS `left`). */
  left: number;
  /** Százalékos pozíció a kép tetejétől (CSS `top`). */
  top: number;
}

export const CAR_IMAGE_SRC = '/cars.webp';
export const CAR_IMAGE_WIDTH = 850;
export const CAR_IMAGE_HEIGHT = 563;

export const CAR_IMAGE_HOTSPOTS: CarImageHotspot[] = [
  // Felülnézet (jobb oldali kép) -- motorháztető elöl, tető középen, csomagtérfedél hátul.
  { elementName: 'Motorháztető', left: 82.35, top: 15.99 },
  { elementName: 'Tető', left: 82.35, top: 47.96 },
  { elementName: 'Csomagtérfedél', left: 82.35, top: 79.04 },

  // BAL oldal -- felső oldalnézet, elölről hátrafelé.
  { elementName: 'Bal első sárvédő', left: 12.94, top: 58.44 },
  { elementName: 'A-oszlop (bal)', left: 18.82, top: 49.38 },
  { elementName: 'Bal első ajtó', left: 26.59, top: 53.29 },
  { elementName: 'B-oszlop (bal)', left: 34.35, top: 49.38 },
  { elementName: 'Bal hátsó ajtó', left: 42.0, top: 53.29 },
  { elementName: 'C-oszlop (bal)', left: 49.76, top: 49.38 },
  { elementName: 'Bal hátsó sárvédő', left: 55.65, top: 58.44 },
  { elementName: 'Bal küszöb', left: 34.35, top: 63.06 },

  // JOBB oldal -- alsó oldalnézet, ugyanabban a sorrendben.
  { elementName: 'Jobb első sárvédő', left: 13.06, top: 87.92 },
  { elementName: 'A-oszlop (jobb)', left: 19.06, top: 78.69 },
  { elementName: 'Jobb első ajtó', left: 26.82, top: 82.24 },
  { elementName: 'B-oszlop (jobb)', left: 34.59, top: 78.69 },
  { elementName: 'Jobb hátsó ajtó', left: 42.24, top: 82.24 },
  { elementName: 'C-oszlop (jobb)', left: 50.0, top: 78.69 },
  { elementName: 'Jobb hátsó sárvédő', left: 56.0, top: 87.92 },
  { elementName: 'Jobb küszöb', left: 34.59, top: 92.72 },
];

/** `CAR_IMAGE_HOTSPOTS`-ból származtatott névlista -- ez az EGYETLEN forrása a
 * `lib/inspections/constants.ts` `PAINT_PANELS`-nek. */
export const CAR_IMAGE_PANEL_NAMES: string[] = CAR_IMAGE_HOTSPOTS.map((h) => h.elementName);
