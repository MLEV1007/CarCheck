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
 * Elemenkénti 3 Mérési Pont & Átlag (PROJEKT_INSTRUKCIOK.md, "Rétegvastagság-mérő modul
 * újratervezése" lépés, A pont) -- minden karosszéria elemhez 3 külön beviteli mező
 * tartozik (µm), az elem átlaga ebből számolódik (lásd `constants.ts`
 * `getPaintPanelAverage`). Az átlag KIZÁRÓLAG akkor számolható, ha mindhárom pont ki
 * van töltve -- részlegesen kitöltött elem nem kerül be a riportba/mentésbe (ugyanaz az
 * elv, mint a korábbi, egy-mezős verziónál: az üresen hagyott elemek nem mentődnek).
 */
export interface PaintMeasurementState {
  elementName: string;
  p1: string;
  p2: string;
  p3: string;
}

export const EMPTY_PAINT_MEASUREMENT = (elementName: string): PaintMeasurementState => ({
  elementName,
  p1: '',
  p2: '',
  p3: '',
});

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
