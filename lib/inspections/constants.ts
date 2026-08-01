import type {
  EquipmentCategory,
  EquipmentStatus,
  PaintMeasurementState,
  PaintStatus,
  RimType,
  TirePosition,
  WizardStep,
} from '@/lib/inspections/types';
import { CAR_IMAGE_PANEL_NAMES } from '@/lib/inspections/carImageMap';

/**
 * Előre definiált karosszéria elemek a festékvastagság-méréshez
 * (PROJEKT_INSTRUKCIOK.md 5.B.2: "Karosszéria elemek listája értékmegadással" + a
 * "Rétegvastagság-mérő modul újratervezése" lépés kibővített listája: A/B/C oszlopok
 * és küszöbök is mérési pontok, oldalanként külön elemként). A "Képalapú interaktív
 * rétegvastagság-mérő hőtérkép" lépés óta ez a lista a `lib/inspections/carImageMap.ts`
 * `CAR_IMAGE_HOTSPOTS` koordináta-térképéből származik -- EGYETLEN forrás mind a
 * névlistának, mind a `cars.webp` referenciaképen elhelyezett hotspot-pozícióknak, hogy a
 * kettő SOSE csússzon szét egymástól. (A korábbi, SVG-alapú generált autó-diagram
 * geometriája -- `carDiagram.ts`/`CarDiagram.tsx` -- ezzel a lépéssel leváltásra került.)
 */
export const PAINT_PANELS: string[] = CAR_IMAGE_PANEL_NAMES;

/** Hiba-kategóriák (PROJEKT_INSTRUKCIOK.md 5.B.3). */
export const DEFECT_CATEGORIES: string[] = ['Motor', 'Váltó', 'Karosszéria', 'Beltér', 'Fék/Futómű', 'Egyéb'];

export const PAINT_STATUS_LABEL: Record<PaintStatus, string> = {
  gyari: 'Gyári',
  ujrafujt: 'Újrafújt / Javított',
  gittelt: 'Gittelt / Sérült',
};

/**
 * Mikron érték -> státusz besorolás (PROJEKT_INSTRUKCIOK.md, "Rétegvastagság-mérő modul
 * újratervezése" lépés, B pont): 80-150 -> Gyári, 151-250 -> Újrafújt/Javított, 250
 * felett -> Gittelt/Sérült. (80 alatti érték -- gyakorlatban ritka mérési hiba -- is
 * Gyáriként van besorolva, mert a specifikáció csak felső küszöböket ad meg.)
 */
export function getPaintStatus(micronValue: number): PaintStatus {
  if (micronValue <= 150) return 'gyari';
  if (micronValue <= 250) return 'ujrafujt';
  return 'gittelt';
}

/** Egy elem 3 mérési pontjából a kitöltött (nem üres, valós szám) értékek, sorrendben. */
function getPaintPanelPoints(panel: PaintMeasurementState): number[] {
  return [panel.p1, panel.p2, panel.p3]
    .map((v) => v.trim())
    .filter((v) => v !== '')
    .map(Number)
    .filter((v) => !Number.isNaN(v));
}

/**
 * Elem Átlag = (P1 + P2 + P3) / 3 (PROJEKT_INSTRUKCIOK.md, A pont) -- KIZÁRÓLAG akkor
 * számolható, ha mindhárom pont ki van töltve; részlegesen kitöltött elemnél `null`-t ad
 * vissza (a UI ilyenkor "–"-t mutat, és mentéskor sem kerül be a riportba). Egy
 * tizedesjegyre kerekítve.
 */
export function getPaintPanelAverage(panel: PaintMeasurementState): number | null {
  const points = getPaintPanelPoints(panel);
  if (points.length !== 3) return null;
  const avg = (points[0] + points[1] + points[2]) / 3;
  return Math.round(avg * 10) / 10;
}

export function isPaintPanelFilled(panel: PaintMeasurementState): boolean {
  return getPaintPanelAverage(panel) !== null;
}

/** A TELJES AUTÓ ÁTLAGA (PROJEKT_INSTRUKCIOK.md, A pont) -- a kitöltött (mindhárom
 * ponttal rendelkező) elemek átlagainak átlaga. `null`, ha egyetlen elem sincs kitöltve. */
export function getOverallPaintAverage(panels: PaintMeasurementState[]): number | null {
  const averages = panels.map(getPaintPanelAverage).filter((v): v is number => v !== null);
  if (averages.length === 0) return null;
  return Math.round((averages.reduce((sum, v) => sum + v, 0) / averages.length) * 10) / 10;
}

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  working: 'Működik',
  not_working: 'Nem működik',
  na: 'Nem releváns',
};

/**
 * Bővített, kategorizált felszereltség-katalógus (a "Bővített Felszereltség Lista"
 * lépés alapján) -- 4 kategória, összesen ~200 elem. A `StepEquipment.tsx` ebből épít
 * kategória-fülekkel + gyorskeresővel szűrhető listát, mert egyetlen lapos lista ennyi
 * elemnél már áttekinthetetlen lenne.
 */
export const EQUIPMENT_CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  muszaki: '🛠️ Műszaki & Asszisztensek',
  belter: '🪑 Beltér & Kényelem',
  kulter: '🚗 Kültér & Világítás',
  multimedia: '📻 Multimédia & Navigáció',
};

export const EQUIPMENT_CATEGORY_ORDER: EquipmentCategory[] = ['muszaki', 'belter', 'kulter', 'multimedia'];

const EQUIPMENT_CATALOG: Record<EquipmentCategory, string[]> = {
  muszaki: [
    'bekanyarodási asszisztens',
    'éjjellátó asszisztens',
    'fáradtságérzékelő',
    'hátsó keresztirányú forgalomra figyelmeztetés',
    'holttér-figyelő rendszer',
    'koccanásgátló',
    'lejtmenet asszisztens',
    'parkolóasszisztens',
    'radaros fékasszisztens',
    'sávtartó rendszer',
    'sávváltó asszisztens',
    'távolságtartó tempomat',
    'tempomat',
    'vészfék asszisztens',
    'visszagurulás-gátló',
    'ABS (blokkolásgátló)',
    'ADS (adaptív lengéscsillapító)',
    'ARD (automatikus távolságtartó)',
    'ASR (kipörgésgátló)',
    'automatikus segélyhívó',
    'EBD/EBV (elektronikus fékerő-elosztó)',
    'EDS (elektronikus differenciálzár)',
    'elektronikus rögzítőfék',
    'ESP (menetstabilizátor)',
    'fékasszisztens',
    'GPS nyomkövető',
    'guminyomás-ellenőrző rendszer',
    'indításgátló (immobiliser)',
    'MSR (motorféknyomaték szabályzás)',
    'rablásgátló',
    'tábla-felismerő funkció',
    'ütközés veszélyre felkészítő rendszer',
    '4WS (összkerékkormányzás)',
    'állítható felfüggesztés',
    'automatikus hengerlekapcsolás',
    'centrálzár',
    'chiptuning',
    'EDC (elektronikus lengéscsillapítás vezérlés)',
    'kerámia féktárcsák',
    'pót üzemanyagtartály',
    'részecskeszűrő',
    'riasztó',
    'sebességfüggő szervokormány',
    'sperr differenciálmű',
    'sportfutómű',
    'start-stop/motormegállító rendszer',
    'szervokormány',
    'vonóhorog - elektromosan kihajtható',
    'vonóhorog - levehető fejjel',
    '230 V csatlakozó hátul',
    '360 fokos kamerarendszer',
    'elektronikus futómű hangolás',
    'első-hátsó parkolóradar',
    'kulcs nélküli indítás',
    'kulcsnélküli nyitórendszer',
    'távolsági fényszóró asszisztens',
    'tolatókamera',
    'tolatóradar',
    'otthoni hálózati töltő',
    'Type2 töltőkábel',
  ],
  belter: [
    'Klímaberendezés',
    'Ülésfűtés hátul',
    'függönylégzsák',
    'hátsó oldal légzsák',
    'kikapcsolható légzsák',
    'középső légzsák elöl',
    'oldallégzsák',
    'térdlégzsák',
    'utasoldali légzsák',
    'vezetőoldali légzsák',
    'beépített gyerekülés',
    'bukócső',
    'csomag rögzítő',
    'hátsó fejtámlák',
    'ISOFIX rendszer',
    'sebességváltó zár',
    'full extra',
    'állófűtés',
    'fűthető első és hátsó ülések',
    'fűthető első ülés',
    'fűthető kormány',
    'álló helyzeti klíma',
    'hűthető kartámasz',
    'hűthető kesztyűtartó',
    'üléshűtés/szellőztetés',
    'bőr belső',
    'műbőr-kárpit',
    'velúr kárpit',
    'Alcantara kárpit',
    'állítható combtámasz',
    'állítható hátsó ülések',
    'automatikusan sötétedő belső tükör',
    'bőr-szövet huzat',
    'bőrkormány',
    'deréktámasz',
    'digitális műszeregység',
    'dönthető utasülések',
    'elektromos ülésállítás utasoldal',
    'elektromos ülésállítás vezetőoldal',
    'elektromosan állítható fejtámlák',
    'faberakás',
    'garázsajtó távirányító',
    'gesztusvezérlés',
    'hangvezérlés',
    'középső kartámasz',
    'masszírozós ülés',
    'memóriás utasülés',
    'memóriás vezetőülés',
    'multifunkciós kormánykerék',
    'plüss kárpit',
    'távirányítással ledönthető hátsó üléstámla',
    'ülésmagasság állítás',
    'állítható kormány',
    'fedélzeti komputer',
    'HUD / Head-Up Display',
    'HUD / Head-Up Display kiterjesztett valóság funkcióval',
    'kormányváltó',
    'sportülések',
  ],
  kulter: [
    'gyalogos légzsák',
    'automata fényszórókapcsolás',
    'automata távfény',
    'bekanyarodási segédfény',
    'bi-xenon fényszóró',
    'bukólámpa',
    'fényszóró magasságállítás',
    'fényszórómosó',
    'kanyarkövető fényszóró',
    'kiegészítő fényszóró',
    'ködlámpa',
    'LED fényszóró',
    'LED mátrix fényszóró',
    'menetfény',
    'xenon fényszóró',
    'defekttűrő abroncsok',
    'esőszenzor',
    'fűthető ablakmosó fúvókák',
    'fűtőszálas szélvédő',
    'ajtószervó',
    'automatikusan sötétedő külső tükör',
    'elektromos csomagtérajtó-mozgatás',
    'elektromosan behajtható külső tükrök',
    'defektjavító készlet',
    'pótkerék',
    'tetőcsomagtartó',
    'tetőre szerelhető kerékpártartó',
    'vonóhorgos kerékpártartó',
    'elektromos ablak elöl',
    'elektromos ablak hátul',
    'elektromos tükör',
    'fűthető tükör',
    'kétoldali tolóajtó',
    'könnyűfém felni',
    'króm felni',
    'színezett üveg',
    'tolóajtó',
    'tolótető - elektromos',
    'tolótető (napfénytető)',
    'vonóhorog',
  ],
  multimedia: [
    'Android Auto / Apple CarPlay',
    'autótelefon',
    'CD-s autórádió',
    'DVD',
    'GPS (navigáció)',
    'Hi-Fi',
    'rádió',
    'rádiós magnó',
    'TV',
    '1 DIN',
    '2 DIN',
    '2 hangszóró',
    '4 hangszóró',
    '5 hangszóró',
    '6 hangszóró',
    '7 hangszóró',
    '8 hangszóró',
    '9 hangszóró',
    '10 hangszóró',
    '11 hangszóró',
    '12 hangszóró',
    'mélynyomó',
    'CD tár',
    'MP3 lejátszás',
    'MP4 lejátszás',
    'WMA lejátszás',
    'analóg TV tuner',
    'AUX csatlakozó',
    'bluetooth-os kihangosító',
    'DVB tuner',
    'DVB-T tuner',
    'erősítő kimenet',
    'FM transzmitter',
    'HDMI bemenet',
    'iPhone/iPod csatlakozó',
    'kihangosító',
    'memóriakártya-olvasó',
    'merevlemez',
    'mikrofon bemenet',
    'tolatókamera bemenet',
    'USB csatlakozó',
    'érintőkijelző',
    'erősítő',
    'fejtámlamonitor',
    'gyári erősítő',
    'kormányra szerelhető távirányító',
    'távirányító',
    'tetőmonitor',
    'Android Auto',
    'Apple CarPlay',
    'kormányról vezérelhető hifi',
    'multifunkcionális kijelző',
    'vezeték nélküli telefontöltés',
    'WiFi Hotspot',
  ],
};

export interface EquipmentCatalogItem {
  name: string;
  category: EquipmentCategory;
}

/** Teljes, kategóriákkal ellátott, lapított felszereltség-katalógus -- ebből épül fel
 * a `StepEquipment.tsx` kategória-fülekkel + kereséssel szűrhető listája. */
export const EQUIPMENT_CATALOG_ITEMS: EquipmentCatalogItem[] = EQUIPMENT_CATEGORY_ORDER.flatMap((category) =>
  EQUIPMENT_CATALOG[category].map((name) => ({ name, category }))
);

/** Sima név-lista (kategória nélkül) -- visszafelé kompatibilis a korábbi (nem
 * kategorizált) `EQUIPMENT_ITEMS` felhasználásokkal: `InspectionWizard.tsx`
 * `defaultEquipment()` és `app/inspections/[id]/page.tsx` `toInitialEquipment()`. */
export const EQUIPMENT_ITEMS: string[] = EQUIPMENT_CATALOG_ITEMS.map((item) => item.name);

/** Név -> kategória lookup a `StepEquipment.tsx` kereső-szűréséhez (kereséskor az
 * összes kategóriában keresünk, a kategória-fülek csak üres keresésnél szűrnek). */
export const EQUIPMENT_NAME_TO_CATEGORY: Record<string, EquipmentCategory> = Object.fromEntries(
  EQUIPMENT_CATALOG_ITEMS.map((item) => [item.name, item.category])
);

export interface FeaturedEquipmentItem {
  /** A "Kiemelt / Gyakori extrák" szekcióban megjelenő, rövid köznyelvi felirat. */
  displayLabel: string;
  /** A TÉNYLEGES katalógus-elem neve (`EQUIPMENT_CATALOG_ITEMS`-ben szereplő kulcs) --
   * ugyanarra a state-bejegyzésre mutat, mint amit a user a teljes listában (kategória
   * fül alatt) is megtalálna, tehát a kiemelt gomb és a lenti lista sosem "esik szét"
   * két külön adatra. */
  name: string;
}

/**
 * "Kiemelt / Gyakori extrák" -- a 15-16 leggyakrabban vizsgált felszereltségi elem,
 * mindig a `StepEquipment.tsx` lépés TETEJÉN, kategória-fültől és kereséstől függetlenül
 * (Hibrid Okos-Lista, PROJEKT_INSTRUKCIOK.md "Felszereltség modul" lépés, A pont).
 * A `name` mező a `EQUIPMENT_CATALOG_ITEMS`-ben már létező, pontos katalógus-nevekre
 * mutat -- ahol a köznyelvi elnevezés (`displayLabel`) eltér a katalógus hivatalos
 * szövegétől (pl. "Navigáció" -> "GPS (navigáció)"), ott a `displayLabel` csak a kiemelt
 * kártyán jelenik meg, de a mögötte lévő állapot (`working`/`not_working`/`na`) UGYANAZ
 * a bejegyzés, mint amit a lenti, kategorizált listában is látna a user. Két elem
 * (`Klímaberendezés`, `Ülésfűtés hátul`, `Android Auto / Apple CarPlay`) korábban
 * hiányzott a katalógusból -- ezeket felvettük a megfelelő kategóriába (lásd fent),
 * hogy a kiemelt gomb ne "lógjon a levegőben" saját state-bejegyzés nélkül.
 */
export const FEATURED_EQUIPMENT: FeaturedEquipmentItem[] = [
  { displayLabel: 'Klímaberendezés', name: 'Klímaberendezés' },
  { displayLabel: 'Tempomat', name: 'tempomat' },
  { displayLabel: 'Távolságtartó tempomat', name: 'távolságtartó tempomat' },
  { displayLabel: 'Tolatóradar', name: 'tolatóradar' },
  { displayLabel: 'Tolatókamera', name: 'tolatókamera' },
  { displayLabel: 'Ülésfűtés elöl', name: 'fűthető első ülés' },
  { displayLabel: 'Ülésfűtés hátul', name: 'Ülésfűtés hátul' },
  { displayLabel: 'Bőrkormány', name: 'bőrkormány' },
  { displayLabel: 'Navigáció', name: 'GPS (navigáció)' },
  { displayLabel: 'Elektromos ablak elöl', name: 'elektromos ablak elöl' },
  { displayLabel: 'Elektromos ablak hátul', name: 'elektromos ablak hátul' },
  { displayLabel: 'LED fényszóró', name: 'LED fényszóró' },
  { displayLabel: 'Bluetooth kihangosító', name: 'bluetooth-os kihangosító' },
  { displayLabel: 'Android Auto / Apple CarPlay', name: 'Android Auto / Apple CarPlay' },
  { displayLabel: 'Holttér-figyelő', name: 'holttér-figyelő rendszer' },
  { displayLabel: 'Sávtartó rendszer', name: 'sávtartó rendszer' },
];

/** A kiemelt elemek katalógus-neveinek gyors halmaza -- a fő (kategorizált/kereshető)
 * lista ezekkel a nevekkel NEM jelenik meg még egyszer lent, hogy ne legyen duplikált
 * sor (a kiemelt kártya és a lenti lista UGYANAZT az állapotot módosítja). */
export const FEATURED_EQUIPMENT_NAMES = new Set(FEATURED_EQUIPMENT.map((item) => item.name));

/** Gumiabroncs kerékpozíciók magyar megnevezése -- KIZÁRÓLAG magyar szöveg, rövidítés
 * (FL/FR/RL/RR) nélkül, sem a Wizardban, sem a publikus riportban. */
export const TIRE_POSITION_LABEL: Record<TirePosition, string> = {
  fl: 'Bal első',
  fr: 'Jobb első',
  rl: 'Bal hátsó',
  rr: 'Jobb hátsó',
};

/** Gumiabroncsok Állapota modul (PROJEKT_INSTRUKCIOK.md, "3 új szakértői modul" lépés,
 * C pont) -- a 4 kerékpozíció megjelenítési sorrendje és felirata. */
export const TIRE_POSITIONS: { position: TirePosition; label: string }[] = [
  { position: 'fl', label: TIRE_POSITION_LABEL.fl },
  { position: 'fr', label: TIRE_POSITION_LABEL.fr },
  { position: 'rl', label: TIRE_POSITION_LABEL.rl },
  { position: 'rr', label: TIRE_POSITION_LABEL.rr },
];

/** A gumiabroncs "koros" figyelmeztetés küszöbe (PROJEKT_INSTRUKCIOK.md: "Ha a gumik
 * életkora meghaladja az 5 évet"), lásd `lib/inspections/tireDot.ts` `decodeDot()`. */
export const TIRE_AGE_WARNING_YEARS = 5;

/** Felni típusa (PROJEKT_INSTRUKCIOK.md, "Gumiabroncs & Felni modul bővítése" lépés, A
 * pont) -- Segmented Control / Toggle a Gumiabroncsok lépés tetején. */
export const RIM_TYPE_LABEL: Record<RimType, string> = {
  alloy: 'Alufelni (Könnyűfém)',
  steel: 'Acélfelni',
};

export const RIM_TYPES: RimType[] = ['alloy', 'steel'];

/** Gumiabroncs márkák gördülőmenüje -- a leggyakoribb márkák + "Egyéb" (szabad szöveges
 * mező jelenik meg, ha ezt választja a user, lásd StepTires.tsx). */
export const TIRE_BRANDS: string[] = [
  'Michelin',
  'Continental',
  'Bridgestone',
  'Pirelli',
  'Goodyear',
  'Hankook',
  'Dunlop',
  'Nokian',
  'Kumho',
  'Yokohama',
  'Falken',
  'Kleber',
  'Matador',
  'Egyéb',
];

export const TIRE_BRAND_OTHER = 'Egyéb';

/**
 * Wizard lépés-metaadatok EGY helyen (szám, rövid cím a lépés-jelzőhöz/gombokhoz,
 * hosszú cím a mobil "X / 8 lépés" feliratokhoz) -- ez a wizard "Wizard Stepper UI fix"
 * és "Dinamikus Tovább gomb" lépés egyetlen forrása (`StepIndicator.tsx` és
 * `InspectionWizard.tsx` is ebből olvas), hogy egy jövőbeli lépés-sorrend módosítás
 * NE tudjon elavult, kézzel beégetett gombfeliratokat hagyni maga után (pontosan ez
 * történt korábban: a 3 új szakértői modul lépés beszúrásakor a `StepGeneralPhotos.tsx`
 * "Tovább" gombja elfelejtett frissülni, és rossz lépésre hivatkozott).
 */
export const WIZARD_STEP_META: { step: WizardStep; shortLabel: string; longLabel: string }[] = [
  { step: 1, shortLabel: 'Autó adatok', longLabel: 'Autó adatok' },
  { step: 2, shortLabel: 'Fotók', longLabel: 'Általános fotók' },
  { step: 3, shortLabel: 'Diagnosztika', longLabel: 'Diagnosztikai hibakódok' },
  { step: 4, shortLabel: 'Felszereltség', longLabel: 'Felszereltség állapota' },
  { step: 5, shortLabel: 'Gumiabroncsok', longLabel: 'Gumiabroncsok állapota' },
  { step: 6, shortLabel: 'Festékvastagság', longLabel: 'Festékvastagság-mérés' },
  { step: 7, shortLabel: 'Hibák & Média', longLabel: 'Hibák & Média' },
  { step: 8, shortLabel: 'Összegzés', longLabel: 'Összegzés & Publikálás' },
];

export const TOTAL_WIZARD_STEPS = WIZARD_STEP_META.length;
