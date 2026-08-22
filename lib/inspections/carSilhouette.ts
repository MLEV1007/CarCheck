/**
 * Autó-referenciakép RENDSZER-CSERE (2026-08-03, UX-egyszerűsítés a Sérülés-térkép/
 * Rétegvastagság-mérő modulokhoz), a korábbi, EGYETLEN 850x563px raszter (`public/
 * cars.webp`) képet, ami mind az 5 nézetet (elöl/hátul/felül/2 oldal) egyetlen apró
 * kompozit képbe zsúfolta, egy kézzel épített, TÉMA-FÜGGŐ (Linear sötét / BMW világos)
 * SVG vonalrajz-rendszer váltja le, KAROSSZÉRIA-TÍPUSONKÉNT (szedán/kombi/SUV) ÉS
 * NÉZETENKÉNT (elöl/oldal/hátul/felül) külön sziluettel.
 *
 * MIÉRT: 1) a régi kép egy konkrét, márkás (kék szedán) illusztráció volt, egy SUV-ot
 * vagy kombit vizsgáló szaki/vevő egy sosem látott karosszéria-formát látott a
 * riportban; 2) az 5 nézet egy 560px széles konténerbe zsúfolva kb. 150px-es
 * al-nézeteket adott, mobilon pontatlan kattintást eredményezve; 3) a raszter kép
 * kemény, fix fehér háttere (`bg-white`) a Linear SÖTÉT wizard-témában rikítóan ütött
 * el a `#010102`/`#0f1011` felületektől.
 *
 * MOST: minden `(bodyType, view)` párhoz egyetlen, NAGY, a konténert kitöltő SVG
 * sziluett tartozik (`SILHOUETTE_SPECS`), a felhasználó egy segmented-control
 * nézetváltóval vált nézetet (lásd `CarSilhouette.tsx` + `PaintCanvas.tsx`/
 * `DamageCanvas.tsx`), és minden mérési/hiba PONT mostantól egy KONKRÉT nézethez
 * (`view` mező, lásd `types.ts` `PaintPointState`/`DamagePointState`) tartozik, nem a
 * régi, összevont kompozit képhez.
 *
 * A sziluett `outlineD` (SVG path) koordinátái egy "lekerekített sokszög" algoritmussal
 * lettek generálva (kézzel felvett kontúr-csúcspontokból, csúcsonként eltérő
 * lekerekítési sugárral, pl. a lökhárító-sarkoknál kicsi, a tetővonalnál nagy sugár),
 * majd a végleges `d` string KÉSZ, statikus konstansként került ide, a generáló
 * algoritmus futásidőben NEM fut le a böngészőben, csak a fejlesztés során (egyszeri
 * Node-szkript) készült el vele ez a fájl, hogy a kliens-bundle ne cipeljen felesleges
 * geometria-számító kódot egy soha nem változó, statikus alak kirajzolásához.
 */

export type CarBodyType = 'sedan' | 'kombi' | 'suv';
export type CarView = 'front' | 'rear' | 'side' | 'top';

interface Circle {
  cx: number;
  cy: number;
  r: number;
}

interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Egy `(bodyType, view)` párhoz tartozó, TELJESEN elkészített rajz-recept, a
 * `CarSilhouette.tsx` ebből épít fel egy `<svg>`-t, a `viewBox`-tól a kerék-/
 * fényszóró-/lámpa-díszítésekig. */
export interface SilhouetteSpec {
  viewBoxWidth: number;
  viewBoxHeight: number;
  /** Karosszéria-körvonal (lekerekített sokszög, lásd fenti JSDoc). */
  outlineD: string;
  /** Szélvédő/ablaksáv, egyszerű sokszög, a körvonalnál valamivel világosabb/eltérő
   * tónussal töltve, hogy a "karosszéria vs. üveg" különbség egy pillantásra
   * érzékelhető legyen. */
  windowPoints: string;
  wheels?: Circle[];
  headlights?: Ellipse[];
  taillights?: Rect[];
  /** Elöl: hűtőrács-vonalak; Hátul: csomagtér-/csomagtartó-varrat; Felül: szélvédő
   * alatti "motorháztető-váll" vonal. Puszta díszítő részlet, nem interaktív. */
  detailLines?: { x1: number; y1: number; x2: number; y2: number }[];
}

const HEADLIGHT_LOW: Ellipse[] = [
  { cx: 42, cy: 95, rx: 9, ry: 6 },
  { cx: 178, cy: 95, rx: 9, ry: 6 },
];
const HEADLIGHT_TALL: Ellipse[] = [
  { cx: 42, cy: 77, rx: 9, ry: 6 },
  { cx: 178, cy: 77, rx: 9, ry: 6 },
];
const TAILLIGHT_LOW: Rect[] = [
  { x: 34, y: 78, w: 16, h: 26 },
  { x: 170, y: 78, w: 16, h: 26 },
];
const TAILLIGHT_TALL: Rect[] = [
  { x: 34, y: 60, w: 16, h: 28 },
  { x: 170, y: 60, w: 16, h: 28 },
];

const FR_LOW_D =
  'M 184.0,150.0 L 36.0,150.0 Q 30.0,150.0 27.6,144.5 L 26.0,141.0 Q 22.0,132.0 22.0,122.0 L 22.0,120.0 Q 22.0,108.0 28.0,98.0 Q 34.0,88.0 40.9,75.8 L 42.1,73.9 Q 50.0,60.0 59.9,47.4 L 62.1,44.6 Q 72.0,32.0 82.0,26.0 L 83.4,25.1 Q 92.0,20.0 102.0,20.0 L 118.0,20.0 Q 128.0,20.0 136.6,25.1 L 138.0,26.0 Q 148.0,32.0 157.9,44.6 L 160.1,47.4 Q 170.0,60.0 177.9,73.9 L 179.1,75.8 Q 186.0,88.0 192.0,98.0 Q 198.0,108.0 198.0,120.0 L 198.0,122.0 Q 198.0,132.0 194.0,141.0 L 192.4,144.5 Q 190.0,150.0 184.0,150.0 Z';
const FR_TALL_D =
  'M 184.0,150.0 L 36.0,150.0 Q 30.0,150.0 28.7,144.1 L 24.2,123.8 Q 22.0,114.0 22.0,104.0 L 22.0,102.0 Q 22.0,90.0 28.0,80.0 Q 34.0,70.0 40.9,57.8 L 42.1,55.9 Q 50.0,42.0 59.9,29.4 L 62.1,26.6 Q 72.0,14.0 82.0,8.0 L 83.4,7.1 Q 92.0,2.0 102.0,2.0 L 118.0,2.0 Q 128.0,2.0 136.6,7.1 L 138.0,8.0 Q 148.0,14.0 157.9,26.6 L 160.1,29.4 Q 170.0,42.0 177.9,55.9 L 179.1,57.8 Q 186.0,70.0 192.0,80.0 Q 198.0,90.0 198.0,102.0 L 198.0,104.0 Q 198.0,114.0 195.8,123.8 L 191.3,144.1 Q 190.0,150.0 184.0,150.0 Z';
const FR_LOW_WINDOW = '60,54 85,28 135,28 160,54';
const FR_TALL_WINDOW = '60,36 85,10 135,10 160,36';
const FR_LOW_WHEELS: Circle[] = [
  { cx: 42, cy: 148, r: 17 },
  { cx: 178, cy: 148, r: 17 },
];
const FR_TALL_WHEELS: Circle[] = [
  { cx: 45, cy: 148, r: 20 },
  { cx: 175, cy: 148, r: 20 },
];

/** SUV = "tall" magasság-osztály (nagyobb hasmagasság, magasabb tető), szedán+kombi =
 * "low", lásd a fenti fájl-JSDoc 3 kompromisszumát: elöl/hátul nézetnél a 3
 * karosszéria-típus 2 magasság-osztályra egyszerűsödik, mert ott a leglátványosabb
 * különbség (alacsony sportos vs. magas terepjáró) így is egyértelműen átjön, míg az
 * oldal- és felülnézet mindhárom típusnál TELJESEN egyedi sziluett. */
function heightClass(bodyType: CarBodyType): 'low' | 'tall' {
  return bodyType === 'suv' ? 'tall' : 'low';
}

const SIDE_OUTLINE: Record<CarBodyType, string> = {
  sedan:
    'M 412.0,150.0 L 30.0,150.0 Q 26.0,150.0 24.9,146.1 L 22.6,137.6 Q 20.0,128.0 23.5,120.0 L 23.8,119.3 Q 27.0,112.0 34.5,109.1 L 44.9,105.1 Q 58.0,100.0 71.7,97.3 L 90.3,93.5 Q 108.0,90.0 121.0,77.6 L 135.5,63.8 Q 150.0,50.0 169.4,45.1 L 176.4,43.4 Q 190.0,40.0 204.0,40.0 L 261.0,40.0 Q 275.0,40.0 286.5,48.0 L 295.6,54.5 Q 312.0,66.0 321.0,74.0 Q 330.0,82.0 343.8,84.2 L 376.2,89.5 Q 392.0,92.0 403.0,100.0 L 405.9,102.1 Q 414.0,108.0 416.9,117.6 L 417.1,118.4 Q 420.0,128.0 418.2,137.8 L 416.7,146.1 Q 416.0,150.0 412.0,150.0 Z',
  kombi:
    'M 404.0,150.0 L 30.0,150.0 Q 26.0,150.0 24.9,146.1 L 22.6,137.6 Q 20.0,128.0 23.5,120.0 L 23.8,119.3 Q 27.0,112.0 34.5,109.1 L 44.9,105.1 Q 58.0,100.0 71.7,97.3 L 90.3,93.5 Q 108.0,90.0 121.0,77.6 L 135.5,63.8 Q 150.0,50.0 169.2,44.3 L 176.6,42.0 Q 190.0,38.0 204.0,38.0 L 293.0,38.0 Q 305.0,38.0 316.8,39.9 L 339.2,43.5 Q 355.0,46.0 369.0,53.7 L 369.5,54.0 Q 384.0,62.0 389.2,79.2 L 394.5,96.5 Q 398.0,108.0 405.0,117.0 L 405.9,118.1 Q 412.0,126.0 410.4,135.9 L 408.7,146.1 Q 408.0,150.0 404.0,150.0 Z',
  suv:
    'M 400.0,150.0 L 28.0,150.0 Q 24.0,150.0 23.0,146.1 L 19.4,131.7 Q 17.0,122.0 21.5,113.1 L 22.4,111.2 Q 26.0,104.0 33.2,100.4 L 41.5,96.3 Q 54.0,90.0 67.6,86.8 L 80.4,83.7 Q 96.0,80.0 107.0,68.4 L 125.6,49.0 Q 138.0,36.0 155.7,32.8 L 170.2,30.1 Q 182.0,28.0 194.0,28.0 L 290.0,28.0 Q 302.0,28.0 313.6,31.0 L 332.5,36.0 Q 348.0,40.0 362.1,47.5 L 363.0,48.0 Q 378.0,56.0 383.7,73.1 L 390.2,92.6 Q 394.0,104.0 400.9,113.8 L 402.3,115.8 Q 408.0,124.0 406.5,133.9 L 404.6,146.0 Q 404.0,150.0 400.0,150.0 Z',
};

const SIDE_WINDOW: Record<CarBodyType, string> = {
  sedan: '120,90 155,52 272,52 305,80',
  kombi: '120,90 155,53 300,52 378,66',
  suv: '106,68 143,38 298,38 370,58',
};

const SIDE_WHEELS: Record<CarBodyType, Circle[]> = {
  sedan: [{ cx: 92, cy: 148, r: 22 }, { cx: 348, cy: 148, r: 22 }],
  kombi: [{ cx: 92, cy: 148, r: 22 }, { cx: 350, cy: 148, r: 22 }],
  suv: [{ cx: 90, cy: 148, r: 26 }, { cx: 352, cy: 148, r: 26 }],
};

const SIDE_HEADLIGHT: Record<CarBodyType, Ellipse> = {
  sedan: { cx: 32, cy: 106, rx: 7, ry: 5 },
  kombi: { cx: 32, cy: 106, rx: 7, ry: 5 },
  suv: { cx: 30, cy: 93, rx: 7, ry: 5 },
};

const SIDE_TAILLIGHT: Record<CarBodyType, Rect> = {
  sedan: { x: 398, y: 93, w: 14, h: 8 },
  kombi: { x: 390, y: 90, w: 14, h: 8 },
  suv: { x: 386, y: 86, w: 14, h: 8 },
};

const TOP_OUTLINE: Record<CarBodyType, string> = {
  sedan:
    'M 58.4,40.3 L 64.0,27.2 Q 68.0,18.0 78.0,18.0 L 112.0,18.0 Q 122.0,18.0 126.0,27.2 L 131.6,40.3 Q 138.0,55.0 136.3,70.9 L 134.2,90.1 Q 132.0,110.0 131.4,130.0 L 126.4,286.0 Q 126.0,300.0 128.2,313.8 L 131.5,334.2 Q 134.0,350.0 131.1,365.7 L 125.8,395.2 Q 124.0,405.0 120.3,414.3 L 118.2,419.4 Q 116.0,425.0 110.0,425.0 L 80.0,425.0 Q 74.0,425.0 71.8,419.4 L 69.7,414.3 Q 66.0,405.0 64.2,395.2 L 58.9,365.7 Q 56.0,350.0 58.5,334.2 L 61.8,313.8 Q 64.0,300.0 63.6,286.0 L 58.6,130.0 Q 58.0,110.0 55.8,90.1 L 53.7,70.9 Q 52.0,55.0 58.4,40.3 Z',
  kombi:
    'M 58.4,40.3 L 64.0,27.2 Q 68.0,18.0 78.0,18.0 L 112.0,18.0 Q 122.0,18.0 126.0,27.2 L 131.6,40.3 Q 138.0,55.0 136.3,70.9 L 134.2,90.1 Q 132.0,110.0 131.6,130.0 L 128.2,308.0 Q 128.0,320.0 127.1,332.0 L 122.7,390.0 Q 122.0,400.0 118.6,409.4 L 116.1,416.4 Q 114.0,422.0 108.0,422.0 L 82.0,422.0 Q 76.0,422.0 73.9,416.4 L 71.4,409.4 Q 68.0,400.0 67.3,390.0 L 62.9,332.0 Q 62.0,320.0 61.8,308.0 L 58.4,130.0 Q 58.0,110.0 55.8,90.1 L 53.7,70.9 Q 52.0,55.0 58.4,40.3 Z',
  suv:
    'M 52.8,43.5 L 59.7,29.0 Q 64.0,20.0 74.0,20.0 L 116.0,20.0 Q 126.0,20.0 130.3,29.0 L 137.2,43.5 Q 144.0,58.0 142.3,73.9 L 140.1,95.1 Q 138.0,115.0 137.6,135.0 L 134.2,320.0 Q 134.0,330.0 133.2,340.0 L 128.7,394.0 Q 128.0,402.0 124.7,409.3 L 120.5,418.5 Q 118.0,424.0 112.0,424.0 L 78.0,424.0 Q 72.0,424.0 69.5,418.5 L 65.3,409.3 Q 62.0,402.0 61.3,394.0 L 56.8,340.0 Q 56.0,330.0 55.8,320.0 L 52.4,135.0 Q 52.0,115.0 49.9,95.1 L 47.7,73.9 Q 46.0,58.0 52.8,43.5 Z',
};

const TOP_WINDOW: Record<CarBodyType, string> = {
  sedan: '78,115 112,115 118,295 72,295',
  kombi: '78,115 112,115 120,315 70,315',
  suv: '74,118 126,118 128,325 72,325',
};

/** Elöl/hátul nézetnél a fényszóró/lámpa-pozíció (és a rács-/varrat-vonalak) a
 * MAGASSÁG-OSZTÁLYtól (`heightClass`) függenek, a `view`-tól pedig az, hogy fényszóró
 * (elöl) vagy lámpa+varrat (hátul) kerül-e a sziluettre. */
function frontRearSpec(bodyType: CarBodyType, view: 'front' | 'rear'): SilhouetteSpec {
  const cls = heightClass(bodyType);
  const isTall = cls === 'tall';
  const outlineD = isTall ? FR_TALL_D : FR_LOW_D;
  const windowPoints = isTall ? FR_TALL_WINDOW : FR_LOW_WINDOW;
  const wheels = isTall ? FR_TALL_WHEELS : FR_LOW_WHEELS;

  if (view === 'front') {
    const grilleY = isTall ? 104 : 122;
    return {
      viewBoxWidth: 220,
      viewBoxHeight: 170,
      outlineD,
      windowPoints,
      wheels,
      headlights: isTall ? HEADLIGHT_TALL : HEADLIGHT_LOW,
      detailLines: [
        { x1: 80, y1: grilleY, x2: 140, y2: grilleY },
        { x1: 75, y1: grilleY + 8, x2: 145, y2: grilleY + 8 },
      ],
    };
  }
  const seamY = isTall ? 96 : 112;
  return {
    viewBoxWidth: 220,
    viewBoxHeight: 170,
    outlineD,
    windowPoints,
    wheels,
    taillights: isTall ? TAILLIGHT_TALL : TAILLIGHT_LOW,
    detailLines: [{ x1: 70, y1: seamY, x2: 150, y2: seamY }],
  };
}

/** Az egyetlen belépési pont, a `CarSilhouette.tsx` és a jövőbeli felhasználók
 * mindig ezen keresztül kérik le egy adott `(bodyType, view)` pár teljes rajz-receptjét. */
export function getSilhouetteSpec(bodyType: CarBodyType, view: CarView): SilhouetteSpec {
  if (view === 'front' || view === 'rear') return frontRearSpec(bodyType, view);
  if (view === 'side') {
    return {
      viewBoxWidth: 440,
      viewBoxHeight: 190,
      outlineD: SIDE_OUTLINE[bodyType],
      windowPoints: SIDE_WINDOW[bodyType],
      wheels: SIDE_WHEELS[bodyType],
      headlights: [SIDE_HEADLIGHT[bodyType]],
      taillights: [SIDE_TAILLIGHT[bodyType]],
    };
  }
  // top
  return {
    viewBoxWidth: 190,
    viewBoxHeight: 440,
    outlineD: TOP_OUTLINE[bodyType],
    windowPoints: TOP_WINDOW[bodyType],
    detailLines: [{ x1: 60, y1: 115, x2: 130, y2: 115 }],
  };
}

/** A konténer CSS `aspectRatio`-jához, elöl/hátul közel négyzetes, oldalnézet széles
 * "fekvő", felülnézet magas "álló" arányú, ezért a `PaintCanvas.tsx`/`DamageCanvas.tsx`
 * konténerének a nézetváltáskor ÚJRA KELL számolnia ezt (a régi, egyetlen kompozit
 * képnél ez fix érték volt). */
export function getSilhouetteAspectRatio(bodyType: CarBodyType, view: CarView): string {
  const spec = getSilhouetteSpec(bodyType, view);
  return `${spec.viewBoxWidth} / ${spec.viewBoxHeight}`;
}

export const CAR_VIEWS: CarView[] = ['front', 'side', 'rear', 'top'];
export const CAR_VIEW_LABEL: Record<CarView, string> = {
  front: 'Elöl',
  side: 'Oldal',
  rear: 'Hátul',
  top: 'Felül',
};

export const CAR_BODY_TYPES: CarBodyType[] = ['sedan', 'kombi', 'suv'];
export const CAR_BODY_TYPE_LABEL: Record<CarBodyType, string> = {
  sedan: 'Szedán / Ferdehátú',
  kombi: 'Kombi',
  suv: 'SUV / Terepjáró',
};

export const DEFAULT_CAR_BODY_TYPE: CarBodyType = 'sedan';
export const DEFAULT_CAR_VIEW: CarView = 'side';
