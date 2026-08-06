'use client';

import { useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { TextField, TextareaField } from '@/components/inspections/wizard/FormControls';
import { WizardStepFooter } from '@/components/inspections/wizard/WizardBottomBar';
import {
  FINAL_ASSESSMENT_RECOMMENDATION_DESCRIPTION,
  FINAL_ASSESSMENT_RECOMMENDATION_LABEL,
} from '@/lib/inspections/constants';
import { sanitizeCostAmount } from '@/lib/inspections/validation';
import { formatHufInput } from '@/lib/format';
import { useInsufficientCredits } from '@/components/credits/InsufficientCreditsProvider';
import { useInspectionId } from '@/components/inspections/wizard/InspectionIdContext';
import type {
  CarInfoState,
  DamagePointState,
  DefectState,
  DiagnosticsState,
  FeatureFormState,
  FinalAssessmentRecommendation,
  FinalAssessmentState,
  PaintPointState,
  TireGeneralInfoState,
  TiresState,
} from '@/lib/inspections/types';

/** A `/api/ai/generate-summary` route bemenetéhez -- a wizard aktuális állapotának
 * KIZÁRÓLAG a szakvélemény szempontjából releváns, JSON-szerializálható részhalmaza
 * (a `File`/`blob:` mezők nélkül, lásd `buildInspectionSnapshot()` lent). */
export interface AiSummaryContext {
  carInfo: CarInfoState;
  diagnostics: DiagnosticsState;
  equipment: FeatureFormState[];
  tires: TiresState;
  tireGeneralInfo: TireGeneralInfoState;
  paintMeasurements: PaintPointState[];
  damages: DamagePointState[];
  defects: DefectState[];
}

interface StepFinalAssessmentProps {
  value: FinalAssessmentState;
  onChange: (value: FinalAssessmentState) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
  /** A "AI Szakértői Összefoglaló" gombhoz szükséges, a wizard szülőjéből (`InspectionWizard.tsx`)
   * összeállított aktuális vizsgálati adat -- lásd `buildInspectionSnapshot()` lent. */
  aiSummaryContext: AiSummaryContext;
}

const RECOMMENDATION_OPTIONS: FinalAssessmentRecommendation[] = ['recommended', 'conditional', 'not_recommended'];

/** A `/api/ai/generate-summary` route válasz-alakja. */
interface GenerateSummaryApiResponse {
  success: boolean;
  summary?: string;
  error?: string;
  details?: string;
}

/** A wizard teljes állapotából KIZÁRÓLAG a szakvélemény-generáláshoz releváns, tisztán
 * JSON-szerializálható adatokat állítja össze -- a `File`/`blob:` mezőket (fotók, videók)
 * szándékosan kihagyja, mert azok a Gemini szöveg-modellnek irrelevánsak, és a `File`
 * objektum egyébként sem szerializálható JSON-ná. */
function buildInspectionSnapshot(context: AiSummaryContext) {
  const { carInfo, diagnostics, equipment, tires, tireGeneralInfo, paintMeasurements, damages, defects } = context;

  return {
    auto: {
      marka: carInfo.carBrand || null,
      tipus: carInfo.carModel || null,
      evjarat: carInfo.year || null,
      kmOraAllas: carInfo.odometer || null,
    },
    diagnosztika: diagnostics.noDtc
      ? { obdTiszta: true, hibakodok: [] }
      : {
          obdTiszta: false,
          hibakodok: diagnostics.codes
            .filter((entry) => entry.code.trim() !== '')
            .map((entry) => ({ kod: entry.code, leiras: entry.description || null })),
        },
    felszereltseg: equipment
      .filter((item) => item.status !== 'not_present')
      .map((item) => ({
        nev: item.id,
        allapot: item.status === 'working' ? 'működik' : 'hibás',
        megjegyzes: item.status === 'defective' && item.notes.trim() !== '' ? item.notes.trim() : null,
      })),
    gumiabroncsok: {
      felniTipusa: tireGeneralInfo.rimType || null,
      marka: tireGeneralInfo.brand || null,
      pozíciók: Object.entries(tires)
        .filter(([, tire]) => tire.mm.trim() !== '' || tire.dot.trim() !== '')
        .map(([position, tire]) => ({ pozicio: position, profilmelysegMm: tire.mm || null, dot: tire.dot || null })),
    },
    festekvastagsagMeres: {
      pontokSzama: paintMeasurements.length,
      atlagMikron:
        paintMeasurements.length > 0
          ? Math.round((paintMeasurements.reduce((sum, p) => sum + p.value, 0) / paintMeasurements.length) * 10) / 10
          : null,
    },
    serulesek: damages.map((damage) => ({
      tipus: damage.type,
      cim: damage.title || null,
      leiras: damage.description || null,
    })),
    hibak: defects.map((defect) => ({
      kategoria: defect.category || null,
      leiras: defect.description || null,
    })),
  };
}

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
export function StepFinalAssessment({
  value,
  onChange,
  onBack,
  onNext,
  nextLabel,
  aiSummaryContext,
}: StepFinalAssessmentProps) {
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const { notifyInsufficientCredits } = useInsufficientCredits();
  const inspectionId = useInspectionId();

  function setRecommendation(recommendation: FinalAssessmentRecommendation) {
    onChange({ ...value, recommendation: value.recommendation === recommendation ? null : recommendation });
  }

  /** "AI Szakértői Összefoglaló" gomb -- a `buildInspectionSnapshot()`-tal összeállított
   * aktuális vizsgálati adatot elküldi a `/api/ai/generate-summary` route-nak, majd a
   * visszakapott 3-4 mondatos szöveget beilleszti a "Szöveges összefoglaló" mezőbe
   * (a korábbi tartalmat felülírva -- a user a mentés/publikálás előtt bármikor
   * kézzel is szerkesztheti/finomíthatja a kapott szöveget). */
  async function handleGenerateSummary() {
    setIsGeneratingSummary(true);
    setSummaryError(null);
    try {
      const response = await fetch('/api/ai/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionData: buildInspectionSnapshot(aiSummaryContext), inspectionId }),
      });

      // 402 (INSUFFICIENT_AI_QUOTA) -- lásd `InsufficientCreditsProvider.tsx`. A globális
      // "Elfogyott az AI kereted" modalt nyitjuk meg a lokális hibaüzenet helyett.
      if (response.status === 402) {
        notifyInsufficientCredits();
        return;
      }

      const data = (await response.json()) as GenerateSummaryApiResponse;

      if (!response.ok || !data.success || !data.summary) {
        if (data.details) console.error('[StepFinalAssessment] Gemini generate-summary hiba részletek:', data.details);
        setSummaryError(data.error ?? 'Hiba történt az összefoglaló generálása közben. Próbáld újra.');
        return;
      }

      onChange({ ...value, summaryText: data.summary.trim() });
    } catch {
      setSummaryError('Hálózati hiba -- az összefoglaló generálása nem sikerült. Próbáld újra.');
    } finally {
      setIsGeneratingSummary(false);
    }
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
            Összefoglaló szakértői vélemény (opcionális)
          </p>
          <button
            type="button"
            onClick={handleGenerateSummary}
            disabled={isGeneratingSummary}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-linear-primary/40 bg-linear-primary/10 px-3 text-[12.5px] font-medium text-linear-primary transition-colors hover:bg-linear-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGeneratingSummary && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isGeneratingSummary ? 'Összefoglaló írása…' : '✨ Automatikus összefoglaló írása (AI)'}
          </button>
        </div>
        {summaryError && (
          <p role="alert" className="text-[12px] text-linear-danger">
            {summaryError}
          </p>
        )}
        <TextareaField
          label="Szöveges összefoglaló"
          name="final-summary-text"
          placeholder="pl. A jármű összességében jó állapotban van, a felsorolt hibák javítása javasolt a vásárlás előtt."
          value={value.summaryText}
          onChange={(e) => onChange({ ...value, summaryText: e.target.value })}
        />
      </div>

      <WizardStepFooter onBack={onBack} onNext={onNext} nextLabel={nextLabel} />
    </div>
  );
}
