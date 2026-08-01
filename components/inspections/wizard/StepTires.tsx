'use client';

import { AlertTriangle, ClipboardCopy } from 'lucide-react';
import { SelectField, TextField } from '@/components/inspections/wizard/FormControls';
import { RIM_TYPES, RIM_TYPE_LABEL, TIRE_BRAND_OTHER, TIRE_BRANDS, TIRE_POSITIONS } from '@/lib/inspections/constants';
import { decodeDot, getMaxDotYearSuffix } from '@/lib/inspections/tireDot';
import { sanitizeDotCode, sanitizeMm } from '@/lib/inspections/validation';
import type { RimType, TireGeneralInfoState, TireMeasurementState, TirePosition, TiresState } from '@/lib/inspections/types';

interface StepTiresProps {
  value: TiresState;
  onChange: (value: TiresState) => void;
  generalInfo: TireGeneralInfoState;
  onGeneralInfoChange: (value: TireGeneralInfoState) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
}

/**
 * LÉPÉS -- Gumiabroncsok Állapota & DOT Dekódoló Modul (PROJEKT_INSTRUKCIOK.md,
 * "3 új szakértői modul" lépés, C pont + "DOT szám szigorú validációja" lépés + "Gumiabroncs
 * & Felni modul bővítése" lépés). A lépés tetején két ÁLTALÁNOS mező (Felni típusa,
 * Gumiabroncs márkája -- `TireGeneralInfoState`, nem kerékpozíciónkénti), alatta a 4
 * kerékkártya, mindegyiknél egy "📋 Adatok másolása / Kitöltés az előzőből" gombbal --
 * a `TIRE_POSITIONS` sorrendjében (fl -> fr -> rl -> rr) mindegyik gomb a KÖZVETLENÜL
 * ELŐTTE lévő kerék profilmélységét és DOT kódját másolja át egyetlen kattintással (az
 * első kerék, Bal első, esetén nincs "előző", ott a gomb inaktív). A 4 számjegyű DOT
 * kódból (WWYY formátum) a `lib/inspections/tireDot.ts` `decodeDot()` élőben (minden
 * billentyűleütésnél) kiszámolja a gyártási hetet/évet, és 5+ éves kornál sárga "Koros
 * gumiabroncs" figyelmeztetést jelenít meg -- ez a kliens-oldali visszajelzés, a végleges
 * dekódolt érték a publikus riportban (get_public_report RPC) is újraszámolódik a tárolt
 * DOT kódból, nem a wizardból küldött értékből.
 *
 * Szigorú validáció: a hét (WW) kizárólag 01-53, az év (YY) legfeljebb a JELENLEGI év
 * lehet (`decodeDot()` már ezt a szabályt alkalmazza) -- 4 beírt, de érvénytelen
 * számjegynél piros hibaüzenet jelenik meg, és a "Tovább" gomb letiltódik, amíg a user
 * nem javítja vagy törli a hibás DOT-ot (ugyanaz a blokkolási minta, mint a Diagnosztika/
 * Hibák lépéseknél).
 */
export function StepTires({
  value,
  onChange,
  generalInfo,
  onGeneralInfoChange,
  onBack,
  onNext,
  nextLabel,
}: StepTiresProps) {
  const maxYearSuffix = getMaxDotYearSuffix();
  const hasInvalidDot = TIRE_POSITIONS.some(
    ({ position }) => value[position].dot.length === 4 && !decodeDot(value[position].dot)
  );

  function setField(position: TirePosition, field: 'mm' | 'dot', fieldValue: string) {
    onChange({ ...value, [position]: { ...value[position], [field]: fieldValue } });
  }

  function copyFromPrevious(position: TirePosition) {
    const index = TIRE_POSITIONS.findIndex((p) => p.position === position);
    if (index <= 0) return;
    const previousPosition = TIRE_POSITIONS[index - 1].position;
    const previous: TireMeasurementState = value[previousPosition];
    onChange({ ...value, [position]: { ...previous } });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Gumiabroncsok állapota</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Add meg a felni típusát, a gumi márkáját, majd kerékpozíciónként a profilmélységet (mm) és a
          DOT kódot (4 számjegy, pl. 1122). A "📋 Adatok másolása" gombbal egy kattintással átveheted az
          előző kerék mért értékeit.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-linear-hairline bg-linear-surface-1 p-4 sm:grid-cols-2">
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-linear-ink-muted">Felni típusa</span>
          <div className="flex gap-2">
            {RIM_TYPES.map((rimType: RimType) => (
              <button
                key={rimType}
                type="button"
                onClick={() => onGeneralInfoChange({ ...generalInfo, rimType })}
                className={
                  'h-10 flex-1 rounded-md border px-3 text-[13px] font-medium transition-colors ' +
                  (generalInfo.rimType === rimType
                    ? 'border-linear-primary bg-linear-primary/10 text-linear-primary'
                    : 'border-linear-hairline bg-linear-surface-2 text-linear-ink-muted hover:bg-linear-surface-3')
                }
              >
                🔘 {RIM_TYPE_LABEL[rimType]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <SelectField
            label="Gumiabroncs márkája"
            name="tire-brand"
            options={TIRE_BRANDS}
            placeholder="Válassz márkát..."
            value={generalInfo.brand}
            onChange={(e) => onGeneralInfoChange({ ...generalInfo, brand: e.target.value })}
          />
          {generalInfo.brand === TIRE_BRAND_OTHER && (
            <TextField
              label="Egyéb márka megnevezése"
              name="tire-brand-custom"
              placeholder="pl. Sava"
              value={generalInfo.customBrand}
              onChange={(e) => onGeneralInfoChange({ ...generalInfo, customBrand: e.target.value })}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TIRE_POSITIONS.map(({ position, label }, index) => {
          const tire = value[position];
          const decoded = tire.dot.length === 4 ? decodeDot(tire.dot) : null;
          const showInvalidError = tire.dot.length === 4 && !decoded;
          const canCopy = index > 0;

          return (
            <div key={position} className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">{label}</p>
                <button
                  type="button"
                  onClick={() => copyFromPrevious(position)}
                  disabled={!canCopy}
                  title={
                    canCopy
                      ? `Adatok másolása a(z) "${TIRE_POSITIONS[index - 1].label}" kerékről`
                      : 'Nincs előző kerék, amiről másolhatnál.'
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-2.5 text-[12px] font-medium text-linear-ink-muted transition-colors hover:bg-linear-surface-3 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  Másolás / Kitöltés az előzőből
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <TextField
                  label="Profilmélység"
                  name={`tire-mm-${position}`}
                  inputMode="decimal"
                  placeholder="pl. 6.5"
                  hint="mm"
                  value={tire.mm}
                  onChange={(e) => setField(position, 'mm', sanitizeMm(e.target.value))}
                />
                <TextField
                  label="DOT kód"
                  name={`tire-dot-${position}`}
                  inputMode="numeric"
                  placeholder="pl. 1122"
                  maxLength={4}
                  className="font-mono tracking-wider"
                  error={
                    showInvalidError
                      ? `Érvénytelen DOT szám! A hét 01-53, az év max ${maxYearSuffix} lehet.`
                      : undefined
                  }
                  value={tire.dot}
                  onChange={(e) => setField(position, 'dot', sanitizeDotCode(e.target.value))}
                />
              </div>

              {decoded && (
                <div
                  className={
                    'mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-[12px] font-medium ' +
                    (decoded.isOld
                      ? 'bg-linear-warning-soft text-linear-warning'
                      : 'bg-linear-surface-2 text-linear-ink-muted')
                  }
                >
                  {decoded.isOld && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                  <span>
                    Gyártás: {decoded.label}
                    {decoded.isOld ? ' -- Koros gumiabroncs' : ''}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-between gap-3 border-t border-linear-hairline pt-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 items-center rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-5 text-[14px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-2"
        >
          Vissza
        </button>
        <button
          type="button"
          disabled={hasInvalidDot}
          onClick={onNext}
          title={hasInvalidDot ? 'Javítsd vagy töröld az érvénytelen DOT kódot a továbblépéshez.' : undefined}
          className="inline-flex h-10 items-center rounded-md bg-linear-primary px-5 text-[14px] font-medium text-white transition-colors hover:bg-linear-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Tovább – {nextLabel}
        </button>
      </div>
    </div>
  );
}
