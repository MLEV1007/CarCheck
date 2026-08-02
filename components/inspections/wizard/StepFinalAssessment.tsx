'use client';

import { Info } from 'lucide-react';
import { TextField, TextareaField } from '@/components/inspections/wizard/FormControls';
import {
  FINAL_ASSESSMENT_RECOMMENDATION_DESCRIPTION,
  FINAL_ASSESSMENT_RECOMMENDATION_LABEL,
} from '@/lib/inspections/constants';
import { sanitizeCostAmount } from '@/lib/inspections/validation';
import { formatHufInput } from '@/lib/format';
import type { FinalAssessmentRecommendation, FinalAssessmentState } from '@/lib/inspections/types';

interface StepFinalAssessmentProps {
  value: FinalAssessmentState;
  onChange: (value: FinalAssessmentState) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
}

const RECOMMENDATION_OPTIONS: FinalAssessmentRecommendation[] = ['recommended', 'conditional', 'not_recommended'];

/**
 * LÉPÉS -- Végső Szakvélemény & Várható Költségek modul (a wizard utolsó, szakértői-adat
 * lépése, közvetlenül az Összegzés & Publikálás előtt). TELJESEN OPCIONÁLIS -- egyetlen
 * mező sem kötelező, a "Tovább" gomb soha nincs letiltva ezen a lépésen. Ha a vizsgáló
 * semmit nem tölt ki, a `final_assessment` JSONB az üres alapértelmezett struktúrával
 * kerül mentésre, és a publikus riporton a `FinalAssessmentCard.tsx` a teljes szekciót
 * elrejti (`return null`) -- ugyanaz a "csak akkor jelenik meg, ha van tartalom" minta,
 * mint a `ServiceHistoryCard`/`EquipmentMatrix`-nél.
 *
 * A) Javaslat -- 3 választható rádiógomb-kártya, ugyanaz a minta, mint a
 *    `StepServiceHistory.tsx` Általános státusz pillérénél, azzal a különbséggel, hogy
 *    itt a már kiválasztott kártyára kattintva a választás visszavonható (`null`-ra áll) --
 *    ez a modul teljes opcionalitása miatt fontos, hogy egy véletlen kattintás se
 *    kényszerítsen ki egy nem szándékolt végleges véleményt.
 * B) Várható költségek -- min/max becsült szervizköltség (HUF, ezres-elválasztós élő
 *    formázással, ugyanaz a minta, mint a Szervizmúlt km óra állás mezőjénél) + szabad
 *    szöveges megjegyzés (pl. "Vezérlés csere, fékek és új téli gumi szett").
 * C) Összefoglaló szakértői vélemény -- szabad szöveges összefoglaló (hangalapú
 *    jegyzeteléssel, mert `TextareaField`-et használ).
 */
export function StepFinalAssessment({ value, onChange, onBack, onNext, nextLabel }: StepFinalAssessmentProps) {
  function setRecommendation(recommendation: FinalAssessmentRecommendation) {
    onChange({ ...value, recommendation: value.recommendation === recommendation ? null : recommendation });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">
          Végső Szakvélemény & Várható Költségek
        </h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Ez a lépés teljesen opcionális -- ha üresen hagyod, a publikus riportban egyáltalán nem jelenik meg ez a
          szekció.
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-md border border-linear-hairline bg-linear-surface-2 px-3 py-2.5 text-[12px] text-linear-ink-subtle">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        A megadott költségbecslés tájékoztató jellegű, nem minősül kötelező érvényű árajánlatnak.
      </p>

      {/* A) Javaslat */}
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Javaslat (opcionális)
        </p>
        <div className="grid grid-cols-1 gap-3">
          {RECOMMENDATION_OPTIONS.map((option) => {
            const isSelected = value.recommendation === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setRecommendation(option)}
                aria-pressed={isSelected}
                className={
                  'flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors ' +
                  (isSelected
                    ? 'border-linear-primary bg-linear-primary/10'
                    : 'border-linear-hairline bg-linear-surface-1 hover:bg-linear-surface-2')
                }
              >
                <span className="text-[14px] font-medium text-linear-ink">
                  {FINAL_ASSESSMENT_RECOMMENDATION_LABEL[option]}
                </span>
                <span className="text-[12px] text-linear-ink-subtle">
                  {FINAL_ASSESSMENT_RECOMMENDATION_DESCRIPTION[option]}
                </span>
              </button>
            );
          })}
        </div>
        {value.recommendation && (
          <p className="text-[12px] text-linear-ink-subtle">Kattints újra a kiválasztott kártyára a törléshez.</p>
        )}
      </div>

      {/* B) Várható költségek */}
      <div className="flex flex-col gap-4">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Várható szervizköltségek (opcionális)
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Minimum becsült költség"
            name="final-cost-min"
            inputMode="numeric"
            placeholder="pl. 150 000"
            hint="Ft"
            value={formatHufInput(value.estimatedCostMin)}
            onChange={(e) => onChange({ ...value, estimatedCostMin: sanitizeCostAmount(e.target.value) })}
          />
          <TextField
            label="Maximum becsült költség"
            name="final-cost-max"
            inputMode="numeric"
            placeholder="pl. 350 000"
            hint="Ft"
            value={formatHufInput(value.estimatedCostMax)}
            onChange={(e) => onChange({ ...value, estimatedCostMax: sanitizeCostAmount(e.target.value) })}
          />
        </div>
        <TextareaField
          label="Megjegyzés a költségbecsléshez (opcionális)"
          name="final-cost-notes"
          placeholder="pl. Vezérlés csere, fékek és új téli gumi szett"
          value={value.costNotes}
          onChange={(e) => onChange({ ...value, costNotes: e.target.value })}
        />
      </div>

      {/* C) Összefoglaló szakértői vélemény */}
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Összefoglaló szakértői vélemény (opcionális)
        </p>
        <TextareaField
          label="Szöveges összefoglaló"
          name="final-summary-text"
          placeholder="pl. A jármű összességében jó állapotban van, a felsorolt hibák javítása javasolt a vásárlás előtt."
          value={value.summaryText}
          onChange={(e) => onChange({ ...value, summaryText: e.target.value })}
        />
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
          onClick={onNext}
          className="inline-flex h-10 items-center rounded-md bg-linear-primary px-5 text-[14px] font-medium text-white transition-colors hover:bg-linear-primary-hover"
        >
          Tovább – {nextLabel}
        </button>
      </div>
    </div>
  );
}
