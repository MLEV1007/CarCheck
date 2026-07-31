'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { SelectField, TextField } from '@/components/inspections/wizard/FormControls';
import { VinScanToast, type VinScanToastVariant } from '@/components/inspections/wizard/VinScanToast';
import { CAR_BRANDS, CAR_CATALOG, OTHER_OPTION, getModelsForBrand } from '@/lib/inspections/carCatalog';
import {
  getCarInfoErrors,
  sanitizeLicensePlate,
  sanitizeOdometer,
  sanitizeVin,
  sanitizeYear,
} from '@/lib/inspections/validation';
import { recognizeVinFromImage } from '@/lib/inspections/vinOcr';
import type { CarInfoState } from '@/lib/inspections/types';

const VIN_SCAN_FAILURE_MESSAGE =
  'Nem sikerült felismerni az alvázszámot. Kérlek fotózd közelebbről, vagy gépeld be manuálisan!';

interface StepCarInfoProps {
  value: CarInfoState;
  onChange: (value: CarInfoState) => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe (`WIZARD_STEP_META` a constants.ts-ben) -- a "Tovább"
   * gomb felirata ebből épül fel dinamikusan, hogy egy jövőbeli lépés-sorrend módosítás
   * ne hagyhasson elavult, kézzel beégetett szöveget (lásd "Dinamikus Tovább gomb" lépés). */
  nextLabel: string;
}

/** A megadott márka/típus szerepel-e a katalógusban -- ha nem (vagy üres), az a "Egyéb / Más"
 * szabad szöveges módot jelenti a dropdown helyett. */
function isKnownBrand(brand: string): boolean {
  return brand !== '' && brand in CAR_CATALOG;
}
function isKnownModel(brand: string, model: string): boolean {
  return model !== '' && (CAR_CATALOG[brand]?.includes(model) ?? false);
}

/**
 * LÉPÉS 1 -- Autó alapadatok (PROJEKT_INSTRUKCIOK.md 5.B.1).
 *
 * Márka/típus: gördülőmenüs kiválasztás a `lib/inspections/carCatalog.ts` katalógusból,
 * "Egyéb / Más" opcióval, ami szabad szöveges mezőre vált -- így ritkább márkák/modellek is
 * rögzíthetők. A típus-lista a kiválasztott márkától függően dinamikusan frissül; márkaváltáskor
 * a korábban választott típus törlődik (más márkánál valószínűleg más típuslista érvényes).
 *
 * Validáció (`lib/inspections/validation.ts`): a mezők `sanitize*` függvényekkel minden
 * billentyűleütésnél tisztulnak (nagybetűsítés, csak megengedett karakterek), a hibaüzenetek
 * pedig "touched" mezőnél vagy a "Tovább" gombra kattintás után jelennek meg piros szöveggel --
 * érvénytelen adatnál a `onNext` nem hívódik meg.
 */
export function StepCarInfo({ value, onChange, onNext, nextLabel }: StepCarInfoProps) {
  const [isCustomBrand, setIsCustomBrand] = useState(() => value.carBrand !== '' && !isKnownBrand(value.carBrand));
  const [isCustomModel, setIsCustomModel] = useState(
    () => value.carModel !== '' && !isKnownModel(value.carBrand, value.carModel)
  );
  const [touched, setTouched] = useState<Partial<Record<keyof CarInfoState, boolean>>>({});
  const [attemptedNext, setAttemptedNext] = useState(false);

  // VIN OCR (Tesseract.js, kliens-oldali, 100%-ig ingyenes -- lásd lib/inspections/vinOcr.ts).
  const vinFileInputRef = useRef<HTMLInputElement>(null);
  const [isScanningVin, setIsScanningVin] = useState(false);
  const [vinScanToast, setVinScanToast] = useState<{ variant: VinScanToastVariant; message: string } | null>(null);

  const errors = getCarInfoErrors(value);
  const showError = (field: keyof CarInfoState) => (touched[field] || attemptedNext ? errors[field] : undefined);

  function set<K extends keyof CarInfoState>(key: K, fieldValue: CarInfoState[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  function markTouched(field: keyof CarInfoState) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function handleBrandSelect(selected: string) {
    markTouched('carBrand');
    if (selected === OTHER_OPTION) {
      setIsCustomBrand(true);
      setIsCustomModel(true);
      onChange({ ...value, carBrand: '', carModel: '' });
      return;
    }
    setIsCustomBrand(false);
    setIsCustomModel(false);
    // Márkaváltáskor a korábbi típus törlődik -- más márkánál más típuslista érvényes.
    onChange({ ...value, carBrand: selected, carModel: '' });
  }

  function handleModelSelect(selected: string) {
    markTouched('carModel');
    if (selected === OTHER_OPTION) {
      setIsCustomModel(true);
      set('carModel', '');
      return;
    }
    setIsCustomModel(false);
    set('carModel', selected);
  }

  function handleVinScanClick() {
    vinFileInputRef.current?.click();
  }

  /** Fotó kiválasztása/lefotózása után lefuttatja a Tesseract.js OCR-t (lib/inspections/vinOcr.ts),
   * és sikeres 17 karakteres VIN találat esetén automatikusan kitölti a mezőt. A gomb a
   * felismerés alatt le van tiltva (`isScanningVin`), hogy a user ne indíthasson el több
   * párhuzamos worker-t véletlen dupla kattintással. */
  async function handleVinPhotoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    // Az input értékét azonnal töröljük, hogy ugyanaz a fájl újra kiválasztható legyen
    // (böngésző különben nem tüzeli az onChange-et változatlan fájlnál).
    event.target.value = '';
    if (!file) return;

    setIsScanningVin(true);
    setVinScanToast(null);
    try {
      const result = await recognizeVinFromImage(file);
      if (result.success && result.vin) {
        const vin = sanitizeVin(result.vin);
        set('vin', vin);
        markTouched('vin');
        setVinScanToast({ variant: 'success', message: `Alvázszám sikeresen beolvasva: ${vin}` });
      } else {
        setVinScanToast({ variant: 'warning', message: VIN_SCAN_FAILURE_MESSAGE });
      }
    } catch {
      setVinScanToast({ variant: 'warning', message: VIN_SCAN_FAILURE_MESSAGE });
    } finally {
      setIsScanningVin(false);
    }
  }

  function handleNext() {
    if (Object.keys(errors).length === 0) {
      onNext();
    } else {
      setAttemptedNext(true);
    }
  }

  const modelOptions = isCustomBrand ? [] : getModelsForBrand(value.carBrand);

  return (
    <div className="flex flex-col gap-6">
      {vinScanToast && (
        <VinScanToast
          variant={vinScanToast.variant}
          message={vinScanToast.message}
          onDismiss={() => setVinScanToast(null)}
        />
      )}

      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Autó alapadatok</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Add meg a vizsgált jármű azonosító adatait.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isCustomBrand ? (
          <div className="flex flex-col gap-1">
            <TextField
              label="Márka"
              name="carBrand"
              placeholder="pl. Lada, Jeep, SsangYong…"
              error={showError('carBrand')}
              value={value.carBrand}
              onChange={(e) => set('carBrand', e.target.value)}
              onBlur={() => markTouched('carBrand')}
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                setIsCustomBrand(false);
                setIsCustomModel(false);
                onChange({ ...value, carBrand: '', carModel: '' });
              }}
              className="self-start text-[12px] font-medium text-linear-primary-hover hover:underline"
            >
              ← Vissza a márkalistához
            </button>
          </div>
        ) : (
          <SelectField
            label="Márka"
            name="carBrand"
            options={CAR_BRANDS}
            placeholder="Válassz márkát…"
            error={showError('carBrand')}
            value={value.carBrand}
            onChange={(e) => handleBrandSelect(e.target.value)}
            onBlur={() => markTouched('carBrand')}
          />
        )}

        {isCustomModel ? (
          <div className="flex flex-col gap-1">
            <TextField
              label="Típus"
              name="carModel"
              placeholder="pl. Niva, Wrangler…"
              error={showError('carModel')}
              value={value.carModel}
              onChange={(e) => set('carModel', e.target.value)}
              onBlur={() => markTouched('carModel')}
            />
            {!isCustomBrand && (
              <button
                type="button"
                onClick={() => {
                  setIsCustomModel(false);
                  set('carModel', '');
                }}
                className="self-start text-[12px] font-medium text-linear-primary-hover hover:underline"
              >
                ← Vissza a típuslistához
              </button>
            )}
          </div>
        ) : (
          <SelectField
            label="Típus"
            name="carModel"
            options={modelOptions}
            placeholder="Válassz típust…"
            error={showError('carModel')}
            value={value.carModel}
            onChange={(e) => handleModelSelect(e.target.value)}
            onBlur={() => markTouched('carModel')}
          />
        )}

        <TextField
          label="Évjárat"
          name="year"
          inputMode="numeric"
          placeholder="pl. 2019"
          hint="4 számjegy"
          error={showError('year')}
          value={value.year}
          onChange={(e) => set('year', sanitizeYear(e.target.value))}
          onBlur={() => markTouched('year')}
        />

        <TextField
          label="Km óra állás"
          name="odometer"
          inputMode="numeric"
          placeholder="pl. 84000"
          error={showError('odometer')}
          value={value.odometer}
          onChange={(e) => set('odometer', sanitizeOdometer(e.target.value))}
          onBlur={() => markTouched('odometer')}
        />

        <div className="flex flex-col gap-1.5">
          <TextField
            label="Alvázszám (VIN)"
            name="vin"
            placeholder="17 karakteres azonosító"
            maxLength={17}
            className="font-mono uppercase tracking-wider"
            error={showError('vin')}
            value={value.vin}
            onChange={(e) => set('vin', sanitizeVin(e.target.value))}
            onBlur={() => markTouched('vin')}
          />
          <input
            ref={vinFileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleVinPhotoSelected}
          />
          <button
            type="button"
            onClick={handleVinScanClick}
            disabled={isScanningVin}
            className="inline-flex h-8 w-fit items-center gap-1.5 self-start rounded-md border border-linear-hairline bg-linear-surface-2 px-2.5 text-[12px] font-medium text-linear-ink-muted transition-colors hover:border-linear-primary/50 hover:text-linear-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isScanningVin ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                📷 Alvázszám felismerése…
              </>
            ) : (
              '📷 VIN beolvasása fotóról'
            )}
          </button>
        </div>

        <TextField
          label="Rendszám"
          name="licensePlate"
          placeholder="pl. AABB123"
          required
          className="font-mono uppercase tracking-wider"
          error={showError('licensePlate')}
          value={value.licensePlate}
          onChange={(e) => set('licensePlate', sanitizeLicensePlate(e.target.value))}
          onBlur={() => markTouched('licensePlate')}
        />
      </div>

      {attemptedNext && Object.keys(errors).length > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-linear-danger/30 bg-linear-danger-soft px-3 py-2.5 text-[13px] text-linear-danger"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Javítsd a pirossal jelölt mezőket a továbblépéshez.
        </p>
      )}

      <div className="flex justify-end border-t border-linear-hairline pt-5">
        <button
          type="button"
          onClick={handleNext}
          className="inline-flex h-10 items-center rounded-md bg-linear-primary px-5 text-[14px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
        >
          Tovább – {nextLabel}
        </button>
      </div>
    </div>
  );
}
