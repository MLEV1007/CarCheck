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
  odometer: string;
}

export const EMPTY_CAR_INFO: CarInfoState = {
  carBrand: '',
  carModel: '',
  year: '',
  vin: '',
  licensePlate: '',
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
 * Felszereltségi elemek állapota modul (PROJEKT_INSTRUKCIOK.md, "Felszereltségi
 * Elemek Állapota Modul" lépés) -- a `lib/inspections/constants.ts` `EQUIPMENT_ITEMS`
 * előre definiált listájának minden eleméhez egy 3-állású státusz tartozik.
 */
export type EquipmentStatus = 'working' | 'not_working' | 'na';

export interface EquipmentItemState {
  name: string;
  status: EquipmentStatus;
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

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
