/**
 * Autó-referenciakép RENDSZER-CSERE, 2. NEKIFUTÁS (2026-08-17), a `cars.webp` egyetlen,
 * mind az 5 nézetet (elöl/hátul/felül/2 oldal) egy apró kompozit képbe zsúfoló raszterét a
 * Sérülés- és Hibatérkép modulban (`DamageCanvas.tsx`) NÉZETENKÉNT KÜLÖN, a felhasználó
 * saját AI-promptjaiból generált, a Linear sötét témához illő (`#17181c` karosszéria,
 * `#5e6ad2` levendula üveg, átlátszó háttér) illusztráció váltja le, lásd `public/car-
 * front.webp`/`car-rear.webp`/`car-side.webp`/`car-top.webp`.
 *
 * **ELŐZMÉNY, miért NEM az első (2026-08-03-i, elvetett) próbálkozás folytatása ez:**
 * a `lib/inspections/carSilhouette.ts`/`CarSilhouette.tsx`/`CarViewSwitcher.tsx` egy kézzel
 * rajzolt, karosszéria-típusonkénti (szedán/kombi/SUV) SVG-sziluett rendszer volt, a
 * felhasználó ezt (sem a kézi SVG-t, sem egy akkori Figma AI-próbálkozást) nem találta elég
 * prémium minőségűnek, a kódváltozásait visszaállította git HEAD-re (lásd `status.md`). EZ a
 * fájl egy ÚJ, EGYETLEN generikus karosszéria-formára (nincs `bodyType`, lásd lent) épülő
 * rendszer, a `CarViewSwitcher.tsx` UI-komponenst újrahasznosítja, de a `carSilhouette.ts`-t
 * NEM importálja, az (és a hozzá tartozó `CarSilhouette.tsx`) továbbra is használaton
 * kívül marad, a felhasználó korábbi döntése szerint.
 *
 * **NINCS `bodyType`:** a `cars.webp`-nél kritizált "egy konkrét karosszéria-forma minden
 * autóra" probléma itt IS fennáll (a generált képek egyetlen generikus szedánt ábrázolnak),
 * de ez a felhasználó TUDATOS döntése volt ennél az iterációnál (a promptok explicit "generic
 * unbranded sedan car" -t kértek), egy karosszéria-típusonkénti képkészlet egy KÉSŐBBI,
 * külön kérésre bővíthető ide, a `CAR_VIEW_IMAGE` táblát karosszéria-típus szerint indexelve.
 *
 * **Bal/Jobb oldal, EGYETLEN kép, CSS-tükrözés:** mivel egy autó (majdnem) tükörszimmetrikus,
 * a `car-side.webp` csak a BAL (vezető-) oldalt ábrázolja, a Jobb oldal nézet UGYANEZT a
 * fájlt tölti be, `scaleX(-1)` CSS-transzformmal tükrözve (lásd `CarViewImage.tsx`). Ez
 * garantálja, hogy a két oldal pixelre egyezzen, és eggyel kevesebb AI-generálást igényel.
 *
 * **`CarPointView` != a régi `CarView`:** a `carSilhouette.ts` `CarView`-ja 4 nézetet
 * ismert (`front|rear|side|top`, a "side" oldalfüggetlen volt, mert az SVG-sziluett saját
 * CSS-tükrözés NÉLKÜL, két külön kézzel rajzolt változatban létezett volna). Itt a Bal/Jobb
 * KÜLÖN nevesített nézet (`left`/`right`), mert egy `DamagePointState`-nek/`PaintPointState`-
 * nek tudnia kell, a jármű MELYIK oldalára mutat a pont (ez érdemi, mentett adat, nem csak UI-
 * állapot), ezért ÚJ típusnév (`CarPointView`), szándékosan NEM importálva a régi fájlból.
 */

export type CarPointView = 'front' | 'rear' | 'left' | 'right' | 'top';

export const CAR_VIEWS: CarPointView[] = ['front', 'rear', 'left', 'right', 'top'];

export const CAR_VIEW_LABEL: Record<CarPointView, string> = {
  front: 'Elöl',
  rear: 'Hátul',
  left: 'Bal oldal',
  right: 'Jobb oldal',
  top: 'Felül',
};

/** Egy nézethez tartozó kép, `width`/`height` a `next/image` `fill`-hez szükséges
 * konténer-arányt (`aspectRatio` CSS) adja meg, NEM a tényleges renderelt méretet.
 * `mirror: true` esetén a `CarViewImage.tsx` `scaleX(-1)`-gyel tükrözi a `src`-t, lásd a
 * fájl-JSDoc "Bal/Jobb oldal" szakaszát. */
export interface CarViewImageSpec {
  src: string;
  width: number;
  height: number;
  mirror?: boolean;
}

export const CAR_VIEW_IMAGE: Record<CarPointView, CarViewImageSpec> = {
  front: { src: '/car-front.webp', width: 457, height: 324 },
  rear: { src: '/car-rear.webp', width: 1400, height: 1090 },
  left: { src: '/car-side.webp', width: 675, height: 261 },
  right: { src: '/car-side.webp', width: 675, height: 261, mirror: true },
  top: { src: '/car-top.webp', width: 638, height: 337 },
};

/** Alapértelmezett/fallback nézet, KÉT helyen kap szerepet: 1) ÚJ `DamageCanvas` megnyitásakor
 * ez az aktív fül; 2) egy RÉGI, e rendszer BEVEZETÉSE ELŐTT mentett `DamagePointState`-nek nincs
 * `view` mezője (a `cars.webp` kompozit képhez képesti koordinátája MÁR ÚGYSEM értelmezhető az
 * új, nézetenkénti képeken), az ilyen pont e fallback alatt jelenik meg, hogy az adatai
 * (kategória/cím/leírás/fotó) NE vesszenek el, még ha a pontos pozíciója már csak hozzávetőleges
 * is. Lásd `DamageCanvas.tsx` JSDoc-ját a teljes migrációs indoklásért. */
export const DEFAULT_CAR_VIEW: CarPointView = 'front';
