'use client';

import type {
  CarInfoState,
  ClientInfoState,
  DamagePointState,
  DefectState,
  DiagnosticsState,
  FeatureFormState,
  FinalAssessmentState,
  GeneralPhotoState,
  PaintPointState,
  ServiceHistoryState,
  TireGeneralInfoState,
  TiresState,
  WizardStep,
} from '@/lib/inspections/types';

/**
 * Kliens-oldali (`localStorage`) piszkozat-mentés a teljes vizsgálati Wizardhoz
 * (`InspectionWizard.tsx`).
 *
 * **MIÉRT KELL EZ (2026-08-09-i éles hibajegy):** a Wizard állapota korábban KIZÁRÓLAG
 * kliens-oldali React `useState`-ben élt, egy oldal-frissítés (akár szándékos, akár egy
 * hibaüzenet utáni reflex, ahogy az AI Felszereltség-diktálás Gemini API hibájánál
 * történt: a `test@buildmysite.hu` fiókban egy hosszú, technikai Gemini-hibaüzenet
 * jelent meg, a user ezután frissítette az oldalt, és a teljes addig begépelt vizsgálat
 * elveszett) A TELJES, addig begépelt/bediktált adatot elvesztette, mert semmi nem élt
 * túl egy React-újramountolást. Ez a modul minden érdemi változásnál (debounce-olva, lásd
 * `InspectionWizard.tsx`) `localStorage`-be írja a wizard SZERIALIZÁLHATÓ állapotát, a
 * Wizard legelső renderelésekor pedig visszaolvassa, ha van érvényes, nem lejárt piszkozat,
 * így egy váratlan (vagy szándékos) oldal-frissítés többé NEM jár adatvesztéssel.
 *
 * **A `File`/fotó-korlát (tudatos, dokumentált kompromisszum):** egy kiválasztott, MÉG FEL
 * NEM TÖLTÖTT fotó (`file !== null`, `previewUrl` `blob:` séma) a böngésző memóriájában
 * él, ez technikailag NEM szerializálható `localStorage`-be (a `File` bináris tartalma
 * elvész egy oldal-frissítéskor, a `blob:` URL pedig ilyenkor automatikusan érvénytelenné
 * válik, függetlenül attól, hogy mi magunk próbáljuk-e megőrizni). Ezért mentéskor az ilyen
 * elemeknél a fotó-hivatkozást eldobjuk, DE minden MÁS, ténylegesen szerializálható mezőt
 * (szöveg, kategória, státusz, megjegyzés, dátum, mérési érték stb.) VÁLTOZATLANUL
 * megtartunk, tehát a jelentés bugjegyben leírt eset (begépelt/bediktált SZÖVEGES adat
 * elvesztése) mostantól nem fordulhat elő. Egy piszkozat szerkesztésekor már korábban
 * feltöltött Storage URL-ek (`previewUrl`, NEM `blob:`) természetesen túlélik a frissítést,
 * mert azok már csak egy string hivatkozás, nem bináris adat.
 */

const STORAGE_PREFIX = 'carpass:wizard-draft:';

/** ÚJ (még soha nem mentett) vizsgálatnál nincs stabil `inspectionId` az URL-ben (az
 * `/inspections/new` route nem dinamikus, lásd `app/inspections/new/page.tsx`), egy
 * oldal-frissítéskor a `InspectionWizard` újramountol, és e nélkül a "slot" nélkül minden
 * alkalommal ÚJ, véletlenszerű `crypto.randomUUID()` inspectionId generálódna, ami nem
 * egyezne a korábban elmentett piszkozat Storage-útvonalaival. Ehelyett egy FIX kulcsú
 * "slot"-ba mentünk, és a VISSZAOLVASOTT piszkozat saját, korábban generált
 * `inspectionId` mezőjét használjuk fel a ténylegesen "élő" azonosítóként (lásd
 * `InspectionWizard.tsx`). */
const NEW_INSPECTION_SLOT = 'new';

/** Egy piszkozatnál ennél régebbi mentést már NEM állítunk vissza (valószínűleg egy rég
 * elfeledett, félbehagyott munkamenet maradványa), helyette a szokásos üres/szerver
 * kezdőállapot érvényesül, ahelyett hogy egy hetekkel korábbi, valószínűleg már irreleváns
 * piszkozat váratlanul visszaköszönne egy vadonatúj munkamenetben. */
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 nap

/** Formátum-verzió, ha a jövőben a mezők alakja (a wizard state shape-je) változna, ez
 * alapján dobható el biztonságosan egy régi, inkompatibilis piszkozat visszaolvasás
 * helyett (ahelyett, hogy egy elavult alakú objektumot próbálnánk React state-be tölteni). */
const DRAFT_FORMAT_VERSION = 1 as const;

export interface WizardDraftSnapshot {
  version: typeof DRAFT_FORMAT_VERSION;
  savedAt: number;
  inspectionId: string;
  step: WizardStep;
  carInfo: CarInfoState;
  generalPhotos: GeneralPhotoState[];
  serviceHistory: ServiceHistoryState;
  diagnostics: DiagnosticsState;
  equipment: FeatureFormState[];
  tires: TiresState;
  tireGeneralInfo: TireGeneralInfoState;
  paintMeasurements: PaintPointState[];
  damages: DamagePointState[];
  defects: DefectState[];
  finalAssessment: FinalAssessmentState;
  clientInfo: ClientInfoState;
}

function storageKeyFor(existingInspectionId: string | undefined): string {
  return STORAGE_PREFIX + (existingInspectionId ?? NEW_INSPECTION_SLOT);
}

/** `File`-t (vagy hozzá tartozó, `blob:` séma) tartalmazó, MÉG FEL NEM TÖLTÖTT fotó-mezőket
 * dob el mentés előtt, lásd a modul-JSDoc "A `File`/fotó-korlát" szakaszát. Piszkozat
 * szerkesztésekor már feltöltött, `blob:`-nak NEM minősülő Storage URL-eket változatlanul
 * megtartja. */
function stripUnsavedFile<T extends { file: File | null; previewUrl: string | null }>(item: T): T {
  if (!item.file && !item.previewUrl?.startsWith('blob:')) return item;
  return { ...item, file: null, previewUrl: null };
}

/** Ugyanaz, mint `stripUnsavedFile`, de a `GeneralPhotoState`/`ServiceHistoryState.photos`
 * elemekhez, ott `previewUrl` NEM opcionális `string` (nem `string | null`), és a fotó
 * maga az elem EGYETLEN érdemi adata (nincs mellette megjegyzés/leírás, amit érdemes lenne
 * megtartani), ezért egy még fel nem töltött elemet mentéskor egyszerűen KIHAGYUNK a
 * tömbből, ahelyett hogy egy üres/törött előnézetű "csonk" bejegyzést tartanánk meg. */
function keepOnlyUploadedPhotos(photos: GeneralPhotoState[]): GeneralPhotoState[] {
  return photos.filter((photo) => !photo.file && !photo.previewUrl.startsWith('blob:'));
}

/** A jelenlegi wizard state-ből egy `localStorage`-ba írható, kizárólag szerializálható
 * mezőket tartalmazó pillanatképet épít, lásd a paraméterlista 1:1 megfelelését az
 * `InspectionWizard.tsx` state-jeivel. */
export function buildDraftSnapshot(params: {
  inspectionId: string;
  step: WizardStep;
  carInfo: CarInfoState;
  generalPhotos: GeneralPhotoState[];
  serviceHistory: ServiceHistoryState;
  diagnostics: DiagnosticsState;
  equipment: FeatureFormState[];
  tires: TiresState;
  tireGeneralInfo: TireGeneralInfoState;
  paintMeasurements: PaintPointState[];
  damages: DamagePointState[];
  defects: DefectState[];
  finalAssessment: FinalAssessmentState;
  clientInfo: ClientInfoState;
}): WizardDraftSnapshot {
  return {
    version: DRAFT_FORMAT_VERSION,
    savedAt: Date.now(),
    inspectionId: params.inspectionId,
    step: params.step,
    carInfo: params.carInfo,
    generalPhotos: keepOnlyUploadedPhotos(params.generalPhotos),
    serviceHistory: {
      ...params.serviceHistory,
      photos: keepOnlyUploadedPhotos(params.serviceHistory.photos),
      carVerticalPdf: params.serviceHistory.carVerticalPdf.file
        ? { file: null, url: null, fileName: null }
        : params.serviceHistory.carVerticalPdf,
    },
    diagnostics: params.diagnostics,
    equipment: params.equipment.map(stripUnsavedFile),
    tires: params.tires,
    tireGeneralInfo: params.tireGeneralInfo,
    paintMeasurements: params.paintMeasurements,
    damages: params.damages.map(stripUnsavedFile),
    defects: params.defects.map(stripUnsavedFile),
    finalAssessment: params.finalAssessment,
    clientInfo: params.clientInfo,
  };
}

/** Piszkozat mentése, KIZÁRÓLAG `catch`-elt, csendes hibakezeléssel: a `localStorage`
 * elérhetetlen lehet (pl. Safari privát böngészés, letiltott cookie-k/site-adatok, vagy
 * betelt kvóta), egy ilyen hiba SOSE törhet meg egy egyébként sikeres mentést/gépelést,
 * csak a kényelmi automentés marad ki, amit a konzolba logolunk hibakereséshez. */
export function saveWizardDraft(existingInspectionId: string | undefined, snapshot: WizardDraftSnapshot): void {
  try {
    window.localStorage.setItem(storageKeyFor(existingInspectionId), JSON.stringify(snapshot));
  } catch (error) {
    console.error('[draftPersistence] Piszkozat mentése localStorage-ba sikertelen:', error);
  }
}

/** Piszkozat visszaolvasása, `null`, ha nincs mentett piszkozat, lejárt (lásd
 * `MAX_DRAFT_AGE_MS`), vagy a formátum-verziója nem egyezik (lásd `DRAFT_FORMAT_VERSION`).
 * A `JSON.parse`/mezőellenőrzés bármilyen hibáját csendben `null`-ként kezeljük, egy
 * sérült/inkompatibilis piszkozat SOSE akadályozhatja meg a Wizard normál (üres/szerver
 * kezdőállapotú) megnyitását. */
export function loadWizardDraft(existingInspectionId: string | undefined): WizardDraftSnapshot | null {
  try {
    const raw = window.localStorage.getItem(storageKeyFor(existingInspectionId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<WizardDraftSnapshot> | null;
    if (!parsed || parsed.version !== DRAFT_FORMAT_VERSION || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > MAX_DRAFT_AGE_MS) return null;

    return parsed as WizardDraftSnapshot;
  } catch (error) {
    console.error('[draftPersistence] Piszkozat visszaolvasása localStorage-ból sikertelen:', error);
    return null;
  }
}

/** Piszkozat törlése, sikeres mentés (Piszkozat mentése/Publikálás gomb) UTÁN hívjuk,
 * hogy a `localStorage`-ban ne maradjon egy már a szerverre is felkerült, innentől
 * felesleges (és egy jövőbeli munkamenetben félrevezető) másolat. */
export function clearWizardDraft(existingInspectionId: string | undefined): void {
  try {
    window.localStorage.removeItem(storageKeyFor(existingInspectionId));
  } catch (error) {
    console.error('[draftPersistence] Piszkozat törlése localStorage-ból sikertelen:', error);
  }
}
