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

export interface PaintMeasurementState {
  elementName: string;
  micronValue: string;
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

export type WizardStep = 1 | 2 | 3 | 4;
