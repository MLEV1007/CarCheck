'use client';

import { TextField } from '@/components/inspections/wizard/FormControls';
import type { CarInfoState } from '@/lib/inspections/types';

interface StepCarInfoProps {
  value: CarInfoState;
  onChange: (value: CarInfoState) => void;
  onNext: () => void;
}

const CAR_BRANDS = [
  'Audi',
  'BMW',
  'Citroën',
  'Dacia',
  'Fiat',
  'Ford',
  'Honda',
  'Hyundai',
  'Kia',
  'Mazda',
  'Mercedes-Benz',
  'Nissan',
  'Opel',
  'Peugeot',
  'Renault',
  'Škoda',
  'Suzuki',
  'Toyota',
  'Volkswagen',
  'Volvo',
];

/** LÉPÉS 1 -- Autó alapadatok (PROJEKT_INSTRUKCIOK.md 5.B.1). */
export function StepCarInfo({ value, onChange, onNext }: StepCarInfoProps) {
  const isValid = value.carBrand.trim().length > 0 && value.licensePlate.trim().length > 0;

  function set<K extends keyof CarInfoState>(key: K, fieldValue: CarInfoState[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Autó alapadatok</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Add meg a vizsgált jármű azonosító adatait.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Márka"
          name="carBrand"
          list="car-brand-options"
          placeholder="pl. Volkswagen"
          required
          value={value.carBrand}
          onChange={(e) => set('carBrand', e.target.value)}
        />
        <datalist id="car-brand-options">
          {CAR_BRANDS.map((brand) => (
            <option key={brand} value={brand} />
          ))}
        </datalist>

        <TextField
          label="Modell"
          name="carModel"
          placeholder="pl. Golf"
          value={value.carModel}
          onChange={(e) => set('carModel', e.target.value)}
        />

        <TextField
          label="Évjárat"
          name="year"
          type="number"
          inputMode="numeric"
          placeholder="pl. 2019"
          min={1950}
          max={new Date().getFullYear() + 1}
          value={value.year}
          onChange={(e) => set('year', e.target.value)}
        />

        <TextField
          label="Km óra állás"
          name="odometer"
          type="number"
          inputMode="numeric"
          placeholder="pl. 84000"
          min={0}
          value={value.odometer}
          onChange={(e) => set('odometer', e.target.value)}
        />

        <TextField
          label="Alvázszám (VIN)"
          name="vin"
          placeholder="17 karakteres azonosító"
          maxLength={17}
          className="font-mono uppercase tracking-wider"
          value={value.vin}
          onChange={(e) => set('vin', e.target.value.toUpperCase())}
        />

        <TextField
          label="Rendszám"
          name="licensePlate"
          placeholder="pl. AA-BB-123"
          required
          className="font-mono uppercase tracking-wider"
          value={value.licensePlate}
          onChange={(e) => set('licensePlate', e.target.value.toUpperCase())}
        />
      </div>

      <div className="flex justify-end border-t border-linear-hairline pt-5">
        <button
          type="button"
          disabled={!isValid}
          onClick={onNext}
          className="inline-flex h-10 items-center rounded-md bg-linear-primary px-5 text-[14px] font-medium text-white transition-colors hover:bg-linear-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Tovább a festékvastagsághoz
        </button>
      </div>
    </div>
  );
}
