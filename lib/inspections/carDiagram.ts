/**
 * Interaktív autó-diagram geometria (PROJEKT_INSTRUKCIOK.md, "Vizualizált autó-diagram a
 * Rétegvastagság-mérő modulban" lépés). Stilizált, felülnézeti ("kiterített") autó-alaprajz:
 * a motorháztető/tető/csomagtérfedél egy középső oszlopban, a sárvédők/oszlopok/ajtók/küszöbök
 * két oldalsó oszlopban helyezkednek el -- ez NEM egy mérnökileg pontos ortográfiai felülnézet
 * (abban az ajtók a tető alatt nem látszanának), hanem egy iparágban bevett, "kiterített"
 * szemléltető ábra, ami mind a 19 elemet egyszerre, jól tapinthatóan jeleníti meg.
 *
 * Ez az EGYETLEN forrás a 19 karosszéria elem nevére -- `lib/inspections/constants.ts`
 * `PAINT_PANELS` ebből származtatja a listáját, hogy a diagram geometriája és az elem-lista
 * SOSE csússzon szét egymástól.
 */

export interface CarPanelZone {
  elementName: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  /** Rövid, a diagramba írható felirat (\n-nel tördelve) -- KIZÁRÓLAG a nagyobb zónáknál
   * (motorháztető/tető/csomagtérfedél/sárvédők/ajtók) van hely szövegre. Az oszlopok és
   * küszöbök (vékony sávok) csak színt + tooltipet kapnak, feliratot nem. */
  shortLabel?: string;
}

/** A diagram SVG `viewBox`-a -- minden zóna-koordináta ebben a koordinátarendszerben él. */
export const CAR_DIAGRAM_VIEWBOX = '0 0 360 600';

export const CAR_PANEL_ZONES: CarPanelZone[] = [
  // Középső oszlop: motorháztető (elöl) -> tető -> csomagtérfedél (hátul).
  { elementName: 'Motorháztető', x: 116, y: 20, w: 128, h: 130, rx: 28, shortLabel: 'Motor-\nháztető' },
  { elementName: 'Tető', x: 116, y: 150, w: 128, h: 300, shortLabel: 'Tető' },
  { elementName: 'Csomagtérfedél', x: 116, y: 450, w: 128, h: 130, rx: 28, shortLabel: 'Csomag-\ntérfedél' },

  // Bal oldal, elölről hátrafelé: sárvédő -> A-oszlop -> ajtó -> B-oszlop -> ajtó -> C-oszlop -> sárvédő.
  { elementName: 'Bal első sárvédő', x: 32, y: 20, w: 84, h: 130, rx: 10, shortLabel: 'Bal e.\nsárvédő' },
  { elementName: 'A-oszlop (bal)', x: 32, y: 150, w: 84, h: 25 },
  { elementName: 'Bal első ajtó', x: 32, y: 175, w: 84, h: 125, rx: 6, shortLabel: 'Bal e.\najtó' },
  { elementName: 'B-oszlop (bal)', x: 32, y: 300, w: 84, h: 25 },
  { elementName: 'Bal hátsó ajtó', x: 32, y: 325, w: 84, h: 125, rx: 6, shortLabel: 'Bal h.\najtó' },
  { elementName: 'C-oszlop (bal)', x: 32, y: 450, w: 84, h: 25 },
  { elementName: 'Bal hátsó sárvédő', x: 32, y: 475, w: 84, h: 105, rx: 10, shortLabel: 'Bal h.\nsárvédő' },

  // Jobb oldal -- tükrözve, azonos y-tartományokkal.
  { elementName: 'Jobb első sárvédő', x: 244, y: 20, w: 84, h: 130, rx: 10, shortLabel: 'Jobb e.\nsárvédő' },
  { elementName: 'A-oszlop (jobb)', x: 244, y: 150, w: 84, h: 25 },
  { elementName: 'Jobb első ajtó', x: 244, y: 175, w: 84, h: 125, rx: 6, shortLabel: 'Jobb e.\najtó' },
  { elementName: 'B-oszlop (jobb)', x: 244, y: 300, w: 84, h: 25 },
  { elementName: 'Jobb hátsó ajtó', x: 244, y: 325, w: 84, h: 125, rx: 6, shortLabel: 'Jobb h.\najtó' },
  { elementName: 'C-oszlop (jobb)', x: 244, y: 450, w: 84, h: 25 },
  { elementName: 'Jobb hátsó sárvédő', x: 244, y: 475, w: 84, h: 105, rx: 10, shortLabel: 'Jobb h.\nsárvédő' },

  // Küszöbök -- a legkülső, vékony sávok, az ajtók teljes hosszában (A-oszloptól C-oszlopig).
  { elementName: 'Bal küszöb', x: 0, y: 175, w: 32, h: 275 },
  { elementName: 'Jobb küszöb', x: 328, y: 175, w: 32, h: 275 },
];

/** `CAR_PANEL_ZONES`-ból származtatott névlista -- ez az EGYETLEN forrás a
 * `lib/inspections/constants.ts` `PAINT_PANELS`-hez. */
export const CAR_PANEL_NAMES: string[] = CAR_PANEL_ZONES.map((zone) => zone.elementName);

/** Díszítő kerék-formák (nem interaktívak, csak vizuálisan teszik felismerhetővé az
 * ábrát autóként) -- a sárvédők függőleges tartományában, a küszöbök sávján kívül eső
 * "üres" területen helyezkednek el, hogy ne fedjenek át egyetlen kattintható zónával sem. */
export const CAR_DIAGRAM_WHEELS: Array<{ x: number; y: number; w: number; h: number; rx: number }> = [
  { x: 4, y: 55, w: 24, h: 75, rx: 10 },
  { x: 332, y: 55, w: 24, h: 75, rx: 10 },
  { x: 4, y: 470, w: 24, h: 75, rx: 10 },
  { x: 332, y: 470, w: 24, h: 75, rx: 10 },
];

/** Díszítő szélvédő/hátsó ablak sávok a motorháztető/tető és tető/csomagtérfedél
 * határán -- nem interaktívak, csak vizuális kiegészítők. */
export const CAR_DIAGRAM_WINDOWS: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 124, y: 142, w: 112, h: 16 },
  { x: 124, y: 442, w: 112, h: 16 },
];
