/**
 * Megosztott típusok az /inspections/new wizardhoz.
 * A mezők egy az egyben a Supabase `inspections` / `paint_measurements` / `defects`
 * tábláinak felelnek meg (lásd PROJEKT_INSTRUKCIOK.md 5.B), de itt még string/File
 * formában élnek, amíg a felhasználó szerkeszti őket -- a beküldéskor alakulnak át
 * a végleges DB típusokra (lásd InspectionWizard.tsx `handleSubmit`).
 */

export interface CarInfoState {
  carBrand: string;
  carModel: string;
  year: string;
  vin: string;
  licensePlate: string;
  /** Rendszám felségjelzés betűkódja (pl. "H", "D", "SK") -- lásd
   * `lib/inspections/constants.ts` `LICENSE_PLATE_COUNTRIES`. Új vizsgálatnál a bejelentkezett
   * felhasználó `user_metadata.default_license_country` értékéből töltődik elő (Settings
   * oldalon testre szabható, "H" a fallback), piszkozat szerkesztésekor pedig az ADOTT
   * vizsgálathoz korábban mentett érték (`inspections.license_plate_country`) érvényesül --
   * lásd `InspectionWizard.tsx` és `app/inspections/new/page.tsx` / `app/inspections/[id]/page.tsx`. */
  licensePlateCountry: string;
  odometer: string;
}

export const EMPTY_CAR_INFO: CarInfoState = {
  carBrand: '',
  carModel: '',
  year: '',
  vin: '',
  licensePlate: '',
  licensePlateCountry: 'H',
  odometer: '',
};

export type PaintStatus = 'gyari' | 'ujrafujt' | 'gittelt';

/**
 * Szabadkézi (free-form) rétegvastagság-mérési pont (PROJEKT_INSTRUKCIOK.md,
 * "Rétegvastagság-mérő Szabadkézi (Free-form Canvas) átalakítása" lépés) -- NINCS előre
 * definiált karosszéria-elem, a felhasználó a referenciakép TETSZŐLEGES pontjára
 * kattinthat. `x`/`y` a kattintás relatív pozíciója SZÁZALÉKBAN (0-100) a kép bal
 * széle/teteje szerint, hogy a pont a kép tetszőleges reszponzív méreténél ugyanott
 * maradjon. `id` kliens-oldalon generált (`crypto.randomUUID()`) stabil azonosító --
 * ugyanaz az id kerül a `paint_measurements.id` oszlopba mentéskor is, hogy a UI (React
 * key, szerkesztés/törlés) és a DB sor 1:1 megfeleljen.
 */
export interface PaintPointState {
  id: string;
  x: number;
  y: number;
  value: number;
}

export interface DefectState {
  clientId: string;
  category: string;
  description: string;
  file: File | null;
  previewUrl: string | null;
}

export const EMPTY_DEFECT = (): DefectState => ({
  clientId:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `defect-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  category: '',
  description: '',
  file: null,
  previewUrl: null,
});

/**
 * Egy általános autó fotó (elölről/hátulról/oldalról/beltér/műszerfal stb. -- nem a
 * `defects` hibafotói, hanem az `inspections.general_photos` szöveg-tömb elemei).
 * Ugyanaz a minta, mint a `DefectState.file`/`previewUrl`-nél: `file` egy most kiválasztott,
 * még fel nem töltött kép; `previewUrl` piszkozat szerkesztésekor egy már meglévő Storage
 * publikus URL is lehet `file` nélkül -- a megkülönböztetés itt is a `blob:` séma-ellenőrzéssel
 * történik (lásd InspectionWizard.tsx `handleSubmit`).
 */
export interface GeneralPhotoState {
  clientId: string;
  file: File | null;
  previewUrl: string;
}

export const CREATE_GENERAL_PHOTO = (file: File): GeneralPhotoState => ({
  clientId:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  file,
  previewUrl: URL.createObjectURL(file),
});

/**
 * Diagnosztikai hibakódok modul (PROJEKT_INSTRUKCIOK.md, "Diagnosztikai Hibakódok
 * Modul" lépés). Ha `noDtc` igaz ("Nincs diagnosztikai hibakód (OBD Tiszta)"),
 * a `codes` lista figyelmen kívül marad mentéskor (lásd InspectionWizard.tsx).
 */
export interface DiagnosticCodeState {
  clientId: string;
  code: string;
  description: string;
}

export interface DiagnosticsState {
  noDtc: boolean;
  codes: DiagnosticCodeState[];
}

export const EMPTY_DIAGNOSTIC_CODE = (): DiagnosticCodeState => ({
  clientId:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `dtc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  code: '',
  description: '',
});

export const EMPTY_DIAGNOSTICS: DiagnosticsState = { noDtc: true, codes: [] };

/**
 * Felszereltségi elemek állapota modul -- "Szupergyors tömeges kijelölés" UX-újratervezés
 * (2026-08-02) -- a `lib/inspections/constants.ts` `EQUIPMENT_ITEMS` előre definiált
 * listájának minden eleméhez egy 3-állású státusz tartozik: `working` (működik),
 * `defective` (hibás -- ekkor kerül csak értelmezésre a `notes`/fotó), `not_present`
 * (nincs az autóban / nem releváns).
 */
export type FeatureStatus = 'working' | 'defective' | 'not_present';

/**
 * A `inspections.equipment` JSONB oszlopban ténylegesen TÁROLT (és a `get_public_report`
 * RPC-n keresztül a publikus riportnak is átadott) alak egy elemre -- `notes`/`photo_url`
 * SZÁNDÉKOSAN csak akkor kerül be, ha `status === 'defective'` (lásd
 * `InspectionWizard.tsx` `handleSubmit`), minden más esetben `undefined`/hiányzik a
 * mentett objektumból, hogy a JSONB ne cipeljen felesleges `null` kulcsokat.
 */
export interface FeatureState {
  id: string;
  status: FeatureStatus;
  notes?: string;
  photo_url?: string;
}

/**
 * Wizard-oldali (szerkesztés közbeni) state egy felszereltségi elemhez -- a `notes` itt
 * mindig string (nem opcionális, hogy a beviteli mező kontrollált maradjon), a
 * `file`/`previewUrl` pár UGYANAZT a "blob vs. már feltöltött Storage URL" mintát követi,
 * mint a `DefectState`/`DamagePointState`-nél: `file` egy most kiválasztott, még fel nem
 * töltött hibafotó; `previewUrl` piszkozat szerkesztésekor egy már feltöltött Storage
 * publikus URL is lehet `file` nélkül. Mindkettő csak `defective` állapotnál releváns --
 * mentéskor alakul át a fenti `FeatureState` payload-dá (lásd `InspectionWizard.tsx`).
 */
export interface FeatureFormState {
  id: string;
  status: FeatureStatus;
  notes: string;
  file: File | null;
  previewUrl: string | null;
}

/** Felszereltség-katalógus kategóriái (bővített lista, kategória-fülekkel + kereséssel
 * a `StepEquipment.tsx`-ben) -- CSAK UI-szűréshez használt, NEM tárolt mező a DB-ben
 * (a `equipment` JSONB oszlop továbbra is csak `{ name, status }` párokat tartalmaz,
 * a kategória a névből a `EQUIPMENT_NAME_TO_CATEGORY` lookuppal derül ki igény szerint). */
export type EquipmentCategory = 'muszaki' | 'belter' | 'kulter' | 'multimedia';

/**
 * Gumiabroncsok állapota & DOT dekódoló modul (PROJEKT_INSTRUKCIOK.md, "Gumiabroncsok
 * Állapota & DOT Dekódoló Modul" lépés) -- 4 kerékpozíció, mindegyiknél profilmélység
 * (mm) és a 4 számjegyű DOT (WWYY) kód. A gyártási dátum/kor a `lib/inspections/tireDot.ts`
 * `decodeDot()` segédfüggvényével számolódik ki a `dot` szövegértékből, NEM tárolt mező.
 */
export type TirePosition = 'fl' | 'fr' | 'rl' | 'rr';

export interface TireMeasurementState {
  mm: string;
  dot: string;
}

export type TiresState = Record<TirePosition, TireMeasurementState>;

export const EMPTY_TIRE_MEASUREMENT: TireMeasurementState = { mm: '', dot: '' };

export const EMPTY_TIRES: TiresState = {
  fl: { ...EMPTY_TIRE_MEASUREMENT },
  fr: { ...EMPTY_TIRE_MEASUREMENT },
  rl: { ...EMPTY_TIRE_MEASUREMENT },
  rr: { ...EMPTY_TIRE_MEASUREMENT },
};

/**
 * Felni típusa & Gumiabroncs márkája -- ÁLTALÁNOS mezők (nem kerékpozíciónkénti), a
 * Gumiabroncsok lépés elején (PROJEKT_INSTRUKCIOK.md, "Gumiabroncs & Felni modul
 * bővítése" lépés, A pont). Szándékosan KÜLÖN state a `TiresState`-től (nem annak
 * mezője) -- így minden meglévő `TIRE_POSITIONS`/`tires[position]` hivatkozás
 * változatlan marad, nincs szükség egyetlen kerék-pozíciós ciklus átírására sem.
 * Mentéskor a `tires` JSONB oszlop `fl`/`fr`/`rl`/`rr` kulcsai MELLÉ, testvér
 * kulcsokként kerül be (`rim_type`, `brand`) -- lásd InspectionWizard.tsx `handleSubmit`.
 */
export type RimType = 'alloy' | 'steel';

export interface TireGeneralInfoState {
  rimType: RimType | '';
  /** A kiválasztott márka -- vagy egy `TIRE_BRANDS` preset, vagy `'Egyéb'`, ha a user
   * szabad szöveges mezőt választott (lásd `customBrand`). */
  brand: string;
  /** Szabad szöveges márkanév, KIZÁRÓLAG ha `brand === 'Egyéb'`. */
  customBrand: string;
}

export const EMPTY_TIRE_GENERAL_INFO: TireGeneralInfoState = { rimType: '', brand: '', customBrand: '' };

/**
 * Szervizmúlt & Dokumentumok modul (PROJEKT_INSTRUKCIOK.md, "Szervizmúlt & Dokumentumok
 * modul" lépés) -- 3 alappillér: A) Általános státusz, B) Fotófeltöltés (a szervizkönyv/
 * számlák lefotózva), C) Manuális Idővonal (kézzel rögzített szerviz-bejegyzések).
 * A `status` `null`, amíg a user nem választ -- a wizard nem kényszerít ki alapértelmezett
 * választ, mert egy "véletlenül otthagyott" alapérték téves benyomást keltene a riportban.
 */
export type ServiceHistoryStatus = 'full' | 'partial' | 'digital' | 'none';

/**
 * Egy manuálisan rögzített szerviz-bejegyzés. `id` kliens-oldalon generált
 * (`crypto.randomUUID()`) stabil azonosító -- mivel a `service_history` NEM gyerek-tábla,
 * hanem egyetlen JSONB oszlop (ugyanaz a minta, mint a `diagnostics.codes`/`equipment`/
 * `tires`-nél), az `id` csak a UI (React key, szerkesztés/törlés) stabilitásához kell,
 * DB-szintű idegen kulcs/egyediség-kényszer nincs rajta.
 */
export interface ServiceHistoryEntryState {
  id: string;
  /** "YYYY-MM-DD" -- natív HTML5 `<input type="date">`-ből (`StepServiceHistory.tsx`,
   * "Naptár választó" lépés). Régebbi, a naptár-választó bevezetése ELŐTT rögzített
   * bejegyzéseknél kivételesen "YYYY" (csak év) formában is előfordulhat -- ezeket a
   * `lib/format.ts` `formatServiceDate()` változatlanul jeleníti meg, a natív dátum-mező
   * pedig üresen nyílik meg rájuk (nem érvényes "YYYY-MM-DD"), így szerkesztéskor a user
   * kényszerül teljes dátumot választani. */
  date: string;
  mileage: string;
  /** pl. "Olajcsere" -- szabad szöveges, `SERVICE_ENTRY_TYPE_SUGGESTIONS`-szal datalist-javaslattal. */
  type: string;
  notes: string;
}

export const EMPTY_SERVICE_HISTORY_ENTRY = (): ServiceHistoryEntryState => ({
  id:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `svc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  date: '',
  mileage: '',
  type: '',
  notes: '',
});

/**
 * CarVertical (vagy hasonló autó-előéleti szolgáltatás) PDF riport -- a Szervizmúlt &
 * Dokumentumok modul negyedik, önálló eleme. EGYETLEN PDF fájl (nem tömb, mint a
 * `photos`), ezért külön típus, NEM a `GeneralPhotoState` mintája: `file` egy most
 * kiválasztott, még fel nem töltött PDF; `url`/`fileName` piszkozat szerkesztésekor egy
 * már feltöltött Storage fájlra mutat `file` nélkül -- ugyanaz a "blob vs. Storage URL"
 * elv, mint a többi médiatípusnál (lásd InspectionWizard.tsx `handleSubmit`).
 */
export interface ServiceDocumentState {
  file: File | null;
  url: string | null;
  fileName: string | null;
}

export const EMPTY_SERVICE_DOCUMENT: ServiceDocumentState = { file: null, url: null, fileName: null };

/**
 * `photos` ugyanazt a `GeneralPhotoState` mintát követi, mint az "Általános autó fotók"
 * modul (`file`/`previewUrl`, piszkozat szerkesztésekor `file` nélkül is lehet egy már
 * feltöltött Storage URL) -- mentéskor a `service_history.photos` egy egyszerű string-tömb
 * lesz, ugyanúgy, mint az `inspections.general_photos` (lásd InspectionWizard.tsx `handleSubmit`).
 */
export interface ServiceHistoryState {
  status: ServiceHistoryStatus | null;
  photos: GeneralPhotoState[];
  entries: ServiceHistoryEntryState[];
  /** CarVertical (vagy hasonló) autó-előéleti PDF riport -- lásd `ServiceDocumentState`. */
  carVerticalPdf: ServiceDocumentState;
}

export const EMPTY_SERVICE_HISTORY: ServiceHistoryState = {
  status: null,
  photos: [],
  entries: [],
  carVerticalPdf: EMPTY_SERVICE_DOCUMENT,
};

/**
 * Sérülés-/hibatípus a "Sérülés- és Hibatérkép" modulhoz (PROJEKT_INSTRUKCIOK.md, "Új
 * Sérülés- és Hibatérkép modul" lépés).
 */
export type DamageType = 'scratch' | 'dent' | 'rust' | 'chip' | 'crack' | 'other';

/**
 * Egy szabadkézi (free-form) sérülés-/esztétikai hiba pont a `public/cars.webp`
 * referenciaképen -- UGYANAZ az elv, mint a `PaintPointState`-nél (`x`/`y` a kép bal
 * széle/teteje szerinti SZÁZALÉKOS relatív pozíció, hogy a pont a kép tetszőleges
 * reszponzív méreténél ugyanott maradjon), de itt minden ponthoz kategória (`type`),
 * kötelező rövid cím (`title`), opcionális leírás és opcionális fotó is tartozik --
 * ezért NEM a `PaintPointState`-et bővítettük, hanem önálló típus, mert a popover/modal
 * UI és a mentési logika (fotó-feltöltés pontonként) érdemben eltér az egyetlen szám
 * mezőt tartalmazó festékvastagság-ponttól.
 */
export interface DamagePointState {
  id: string;
  x: number;
  y: number;
  type: DamageType;
  title: string;
  description: string;
  file: File | null;
  /** `blob:` object URL egy most kiválasztott, még fel nem töltött fotónál, VAGY egy
   * már feltöltött Supabase Storage publikus URL piszkozat szerkesztésekor -- ugyanaz
   * a "blob vs. már feltöltött Storage URL" minta, mint a `DefectState`/
   * `GeneralPhotoState`-nél (lásd InspectionWizard.tsx `handleSubmit`). `null`, ha a
   * ponthoz nincs fotó csatolva. */
  previewUrl: string | null;
}

/** Új pont létrehozása a kattintás relatív pozíciójából (`x`/`y` százalék) --
 * `crypto.randomUUID()` generálja a stabil kliens-oldali (és mentéskor DB-) azonosítót,
 * ugyanúgy, mint a többi `EMPTY_*`/`CREATE_*` helyernél ebben a fájlban. */
export const EMPTY_DAMAGE_POINT = (x: number, y: number): DamagePointState => ({
  id:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `damage-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  x,
  y,
  type: 'scratch',
  title: '',
  description: '',
  file: null,
  previewUrl: null,
});

/**
 * Végső Szakvélemény & Várható Költségek modul -- OPCIONÁLIS wizard-lépés a Hibák & Média
 * UTÁN, az Összegzés & Publikálás ELŐTT (a vizsgálatot lezáró szakértői vélemény + egy
 * durva, tájékoztató jellegű szervizköltség-becslés). MINDEN mező opcionális -- ha a
 * vizsgáló egyiket sem tölti ki, a `final_assessment` JSONB oszlop az üres alapértelmezett
 * struktúrával kerül mentésre, és a publikus riporton a teljes szekció rejtve marad
 * (lásd `FinalAssessmentCard.tsx` a `components/report/`-ban -- `return null`, ha minden
 * mező üres, ugyanaz a minta, mint a `GeneralPhotosGallery`/`EquipmentMatrix`/
 * `ServiceHistoryCard`-nál).
 */
export type FinalAssessmentRecommendation = 'recommended' | 'conditional' | 'not_recommended';

/**
 * Wizard-oldali state -- a `recommendation` `null`, amíg a vizsgáló nem választ (nincs
 * kikényszerített alapérték, ugyanaz az elv, mint a `ServiceHistoryState.status`-nál). A
 * két költség-mező és a `costNotes`/`summaryText` szabad szöveges/string mezők a
 * beviteli mezők élő szerkesztéséhez -- mentéskor alakulnak számmá/`null`-lá (lásd
 * `InspectionWizard.tsx` `handleSubmit`).
 */
export interface FinalAssessmentState {
  recommendation: FinalAssessmentRecommendation | null;
  estimatedCostMin: string;
  estimatedCostMax: string;
  costNotes: string;
  summaryText: string;
}

export const EMPTY_FINAL_ASSESSMENT: FinalAssessmentState = {
  recommendation: null,
  estimatedCostMin: '',
  estimatedCostMax: '',
  costNotes: '',
  summaryText: '',
};

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
