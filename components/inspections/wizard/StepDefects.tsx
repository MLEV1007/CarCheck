'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { SelectField, TextareaField } from '@/components/inspections/wizard/FormControls';
import { DefectMediaUpload } from '@/components/inspections/wizard/DefectMediaUpload';
import { WizardStepFooter } from '@/components/inspections/wizard/WizardBottomBar';
import { IconButton } from '@/components/ui/IconButton';
import { DEFECT_CATEGORIES } from '@/lib/inspections/constants';
import { EMPTY_DEFECT, type DefectState } from '@/lib/inspections/types';
import { HintCallout } from '@/components/onboarding/HintCallout';
import { compressImageForAiScan } from '@/lib/inspections/aiImageCompression';
import { isVideoUrl } from '@/lib/reports/media';
import { useInsufficientCredits } from '@/components/credits/InsufficientCreditsProvider';
import { useInspectionId } from '@/components/inspections/wizard/InspectionIdContext';

interface StepDefectsProps {
  value: DefectState[];
  onChange: (value: DefectState[]) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
  /** A hívó szervezet videó-csatolási jogosultsága -- lásd `StepGeneralPhotos.tsx`
   * `videoAllowed` propjának JSDoc-ját, ugyanaz a wizard-szintű, egyszer lekérdezett érték. */
  videoAllowed: boolean;
}

/** A `/api/ai/scan-defect` route válasz-alakja -- lásd `app/api/ai/scan-defect/route.ts`
 * (és a hozzá tartozó `PLAN_ai_scan_defect.md` tervet), csak a kliensnek releváns mezők. */
interface ScanDefectApiResponse {
  success: boolean;
  data?: {
    defectDetected: boolean;
    confidence: 'high' | 'medium' | 'low';
    category?: string;
    description?: string;
  };
  error?: string;
  details?: string;
}

/**
 * Egy hiba-kártya AI-elemzésének állapota -- KIZÁRÓLAG kliens-oldali, EFEMER UI-állapot,
 * SOSE kerül a `DefectState`-be/a mentett vizsgálati adatba (lásd `PLAN_ai_scan_defect.md`
 * 3.5 pontját: az AI javaslat sosem írhat közvetlenül a mezőkbe, csak explicit "Elfogadom"
 * kattintásra). `clientId` szerint tárolva, a `StepDefects` komponens saját `useState`-jében.
 */
type DefectAiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'suggested'; confidence: 'high' | 'medium' | 'low'; category: string; description: string }
  | { status: 'not_detected' }
  | { status: 'error'; message: string };

const IDLE_AI_STATE: DefectAiState = { status: 'idle' };

const AI_SCAN_FAILURE_MESSAGE = 'Az AI elemzés nem sikerült. Próbáld újra, vagy töltsd ki kézzel.';

/** Igaz, ha a hiba-kártya médiája videó -- lásd `DefectMediaUpload.tsx` azonos elvű
 * `isVideo` számítását. Az "AI elemzés" gomb videónál NEM jelenik meg -- a `/api/ai/scan-defect`
 * route kizárólag állóképet fogad (lásd a route JSDoc-ját). */
function isDefectVideo(defect: DefectState): boolean {
  if (defect.file) return defect.file.type.startsWith('video/');
  if (defect.previewUrl) return isVideoUrl(defect.previewUrl);
  return false;
}

/** LÉPÉS -- Hibák és Média rögzítése (PROJEKT_INSTRUKCIOK.md 5.B.3). */
export function StepDefects({ value, onChange, onBack, onNext, nextLabel, videoAllowed }: StepDefectsProps) {
  // AI hiba-felismerés fotóból (`PLAN_ai_scan_defect.md`) -- hiba-kártyánkénti, KLIENS-OLDALI
  // állapot, sosem íródik közvetlenül a `value`-ba (a `DefectState`-be), lásd a `DefectAiState`
  // JSDoc-ját. A `notifyInsufficientCredits`/`inspectionId` ugyanaz a minta, mint a projekt
  // többi AI-hívásánál (pl. `StepCarInfo.tsx` VIN-szkennelése).
  const [aiStates, setAiStates] = useState<Record<string, DefectAiState>>({});
  const { notifyInsufficientCredits } = useInsufficientCredits();
  const inspectionId = useInspectionId();

  function getAiState(clientId: string): DefectAiState {
    return aiStates[clientId] ?? IDLE_AI_STATE;
  }

  function setAiState(clientId: string, next: DefectAiState) {
    setAiStates((prev) => ({ ...prev, [clientId]: next }));
  }

  function clearAiState(clientId: string) {
    setAiStates((prev) => {
      if (!(clientId in prev)) return prev;
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
  }

  function updateDefect(clientId: string, patch: Partial<DefectState>) {
    onChange(value.map((defect) => (defect.clientId === clientId ? { ...defect, ...patch } : defect)));
  }

  function addDefect() {
    onChange([...value, EMPTY_DEFECT()]);
  }

  function removeDefect(clientId: string) {
    const target = value.find((defect) => defect.clientId === clientId);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    onChange(value.filter((defect) => defect.clientId !== clientId));
    clearAiState(clientId);
  }

  function handleSelectFile(clientId: string, file: File) {
    const previewUrl = URL.createObjectURL(file);
    updateDefect(clientId, { file, previewUrl });
    // Új fotó kiválasztásakor egy korábbi (más fotóhoz tartozó) AI javaslat/hiba-állapot
    // ELÉVÜL -- ne maradjon a képernyőn egy már nem releváns kártyához tartozó javaslat.
    clearAiState(clientId);
  }

  function handleRemoveMedia(clientId: string) {
    const target = value.find((defect) => defect.clientId === clientId);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    updateDefect(clientId, { file: null, previewUrl: null });
    clearAiState(clientId);
  }

  /** A QR-kódos telefonos feltöltésből érkező, MÁR feltöltött média befogadása -- lásd
   * `DefectMediaUpload.tsx` `onReceiveFromQr` propjának JSDoc-ját. Ugyanaz a
   * "file: null, previewUrl: <url>" alak, mint egy piszkozat szerkesztésekor visszaolvasott,
   * korábban már feltöltött médiánál (`draftPersistence.ts`). */
  function handleReceiveFromQr(clientId: string, item: { url: string; type: 'photo' | 'video' }) {
    updateDefect(clientId, { file: null, previewUrl: item.url });
    clearAiState(clientId);
  }

  /**
   * "✨ AI elemzés" gomb -- lásd `PLAN_ai_scan_defect.md` 3.6 pontját: KIZÁRÓLAG explicit
   * felhasználói kérésre fut le, sosem automatikus a fotó kiválasztásakor. A válasz SOSE
   * írja felül közvetlenül a `category`/`description` mezőt -- csak egy "AI javaslat"
   * `DefectAiState`-et állít be, amit a szakértőnek külön "Elfogadom" gombbal kell
   * jóváhagynia (`handleAcceptSuggestion`), lásd a 3.5 pontot.
   */
  async function handleAnalyze(clientId: string) {
    const defect = value.find((d) => d.clientId === clientId);
    if (!defect?.file) return;

    setAiState(clientId, { status: 'loading' });
    try {
      const imageDataUrl = await compressImageForAiScan(defect.file);

      const response = await fetch('/api/ai/scan-defect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageDataUrl, inspectionId }),
      });

      // 402 (INSUFFICIENT_AI_QUOTA) -- lásd `InsufficientCreditsProvider.tsx`. A globális
      // "Elfogyott az AI kereted" modalt nyitjuk meg, a kártya visszaáll "idle"-re, hogy a
      // gomb újra elérhető legyen (a kézi kitöltés lehetősége mindig megmarad).
      if (response.status === 402) {
        notifyInsufficientCredits();
        setAiState(clientId, { status: 'idle' });
        return;
      }

      let result: ScanDefectApiResponse | null = null;
      try {
        result = (await response.json()) as ScanDefectApiResponse;
      } catch (parseError) {
        console.error('[StepDefects] A /api/ai/scan-defect válasza nem érvényes JSON (státusz:', response.status, '):', parseError);
      }

      if (!response.ok || !result?.success || !result?.data) {
        if (result?.details) console.error('[StepDefects] Gemini scan-defect hiba részletek:', result.details);
        setAiState(clientId, { status: 'error', message: result?.error ?? AI_SCAN_FAILURE_MESSAGE });
        return;
      }

      const { data } = result;
      if (!data.defectDetected || !data.category || !data.description) {
        // A szerver `sanitizeScanDefectResponse()`-ja `category`/`description`-t KIZÁRÓLAG
        // `defectDetected: true` esetén ad vissza -- lásd a route JSDoc-ját. Ha bármelyik
        // hiányzik, a BIZTONSÁGOS "nem talált hibát" ágra esünk, semmit nem töltünk ki.
        setAiState(clientId, { status: 'not_detected' });
        return;
      }

      setAiState(clientId, {
        status: 'suggested',
        confidence: data.confidence,
        category: data.category,
        description: data.description,
      });
    } catch {
      setAiState(clientId, { status: 'error', message: AI_SCAN_FAILURE_MESSAGE });
    }
  }

  /** "Elfogadom" -- KIZÁRÓLAG ez a függvény írhat a hiba-kártya `category`/`description`
   * mezőjébe AI-javaslatból, lásd `PLAN_ai_scan_defect.md` 3.5 pontját. Elfogadás után a
   * mezők ugyanúgy szabadon szerkeszthetők, mint egy kézzel beírt érték. */
  function handleAcceptSuggestion(clientId: string) {
    const aiState = getAiState(clientId);
    if (aiState.status !== 'suggested') return;
    updateDefect(clientId, { category: aiState.category, description: aiState.description });
    clearAiState(clientId);
  }

  /** "Elvetem" -- a hiba-kártya mezői garantáltan VÁLTOZATLANOK maradnak. */
  function handleRejectSuggestion(clientId: string) {
    clearAiState(clientId);
  }

  const hasIncompleteRow = value.some((defect) => defect.category.trim() === '' || defect.description.trim() === '');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Hibák és Média rögzítése</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Rögzítsd a mechanikai és elektronikai hibákat leírással, képpel vagy videóval. (A felületi
          sérüléseket az előző, Hibatérkép lépésben jelöld). Ha nincs hiba, lépj tovább.
        </p>
      </div>

      <HintCallout id="defects" title="Tipp: diktálhatod is a hibaleírást, vagy kérj AI javaslatot fotóból">
        A leírás mezőnél a mikrofon ikonnal bediktálhatod a hibát, az AI automatikusan nyelvtanilag is
        kisimítja a szöveget. Fotó feltöltése után az "AI elemzés" gombbal a modell javaslatot ad
        kategóriára és leírásra is -- ezt mindig ellenőrizd, mielőtt elfogadod.
      </HintCallout>

      <div className="flex flex-col gap-4">
        {value.map((defect, index) => {
          const aiState = getAiState(defect.clientId);
          const canAnalyze = !!defect.file && !isDefectVideo(defect);

          return (
            <div key={defect.clientId} className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
                  #{index + 1}. hiba
                </span>
                <IconButton type="button" onClick={() => removeDefect(defect.clientId)} aria-label="Hiba törlése" variant="ghost-danger">
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex flex-1 flex-col gap-4">
                  <SelectField
                    label="Hiba kategória"
                    name={`category-${defect.clientId}`}
                    options={DEFECT_CATEGORIES}
                    placeholder="Válassz kategóriát…"
                    value={defect.category}
                    onChange={(e) => updateDefect(defect.clientId, { category: e.target.value })}
                  />
                  <TextareaField
                    label="Hiba leírása"
                    name={`description-${defect.clientId}`}
                    placeholder="pl. Karcolás a jobb hátsó ajtón, kb. 8 cm."
                    value={defect.description}
                    onChange={(e) => updateDefect(defect.clientId, { description: e.target.value })}
                  />
                </div>

                <div className="sm:w-[220px] sm:shrink-0">
                  <span className="mb-1.5 block text-[13px] font-medium text-linear-ink-muted">
                    {videoAllowed ? 'Fotó / videó' : 'Fotó'}
                  </span>
                  <DefectMediaUpload
                    file={defect.file}
                    previewUrl={defect.previewUrl}
                    onSelect={(file) => handleSelectFile(defect.clientId, file)}
                    onRemove={() => handleRemoveMedia(defect.clientId)}
                    videoAllowed={videoAllowed}
                    qrTarget={`defect:${defect.clientId}`}
                    onReceiveFromQr={(item) => handleReceiveFromQr(defect.clientId, item)}
                  />

                  {canAnalyze && aiState.status === 'idle' && (
                    <button
                      type="button"
                      onClick={() => handleAnalyze(defect.clientId)}
                      className="mt-2 inline-flex h-8 w-full max-w-[220px] items-center justify-center gap-1.5 rounded-md border border-linear-primary/40 bg-linear-primary/10 px-3 text-[12.5px] font-medium text-linear-primary transition-colors hover:bg-linear-primary/15"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      AI elemzés
                    </button>
                  )}

                  {/* Videónál az "AI elemzés" gomb SZÁNDÉKOSAN nem jelenik meg (lásd
                      `isDefectVideo` JSDoc-ját), de ezt EXPLICIT szöveggel is jelezzük -- ne
                      csak a gomb csendes hiánya kommunikálja, hogy a funkció nem elérhető
                      videónál (2026-08-21-i felhasználói visszajelzés). */}
                  {isDefectVideo(defect) && (
                    <p className="mt-2 max-w-[220px] text-[12px] text-linear-ink-subtle">
                      Az AI hibafelismerés csak fotó alapján működik, videónál nem elérhető.
                    </p>
                  )}

                  {aiState.status === 'loading' && (
                    <div className="mt-2 flex max-w-[220px] items-center gap-1.5 text-[12px] text-linear-ink-subtle">
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      AI elemzi a fotót…
                    </div>
                  )}

                  {aiState.status === 'not_detected' && (
                    <p className="mt-2 max-w-[220px] text-[12px] text-linear-ink-subtle">
                      Az AI nem ismert fel egyértelmű hibát ezen a képen -- töltsd ki kézzel.
                    </p>
                  )}

                  {aiState.status === 'error' && (
                    <div className="mt-2 max-w-[220px]">
                      <p className="text-[12px] text-linear-danger">{aiState.message}</p>
                      <button
                        type="button"
                        onClick={() => handleAnalyze(defect.clientId)}
                        className="mt-1 text-[12px] font-medium text-linear-primary hover:underline"
                      >
                        Újra próbálom
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* "AI javaslat" panel -- SZÁNDÉKOSAN elkülönítve a kész mezőktől, KÜLÖN
                  "Elfogadom"/"Elvetem" gombbal, lásd `PLAN_ai_scan_defect.md` 3.5/3.7 pontját.
                  A `category`/`description` mező a hiba-kártyán KIZÁRÓLAG az "Elfogadom"
                  kattintásra töltődik ki -- eddig a pillanatig a javaslat csak itt látszik. */}
              {aiState.status === 'suggested' && (
                <div className="mt-4 rounded-md border border-dashed border-linear-primary/50 bg-linear-primary/5 p-3.5">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.4px] text-linear-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI javaslat
                  </div>
                  <p className="mt-2 text-[13.5px] text-linear-ink">
                    <span className="font-semibold">{aiState.category}</span> -- {aiState.description}
                  </p>
                  {aiState.confidence === 'low' && (
                    <p className="mt-2 flex items-start gap-1.5 text-[12px] text-linear-warning">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Az AI bizonytalan ebben a javaslatban -- ellenőrizd különösen alaposan.
                    </p>
                  )}
                  <p className="mt-2 text-[11.5px] text-linear-ink-subtle">
                    Az AI-javaslat tájékoztató jellegű, a képen látottak alapján -- mindig ellenőrizd, mielőtt
                    elfogadod.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleAcceptSuggestion(defect.clientId)}
                      className="inline-flex h-8 items-center rounded-md bg-linear-primary px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-linear-primary-hover"
                    >
                      Elfogadom
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectSuggestion(defect.clientId)}
                      className="inline-flex h-8 items-center rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-3 text-[12.5px] font-medium text-linear-ink-muted transition-colors hover:bg-linear-surface-3"
                    >
                      Elvetem
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={addDefect}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-linear-hairline-strong bg-linear-surface-1 px-4 py-3 text-[14px] font-medium text-linear-ink-subtle transition-colors hover:border-linear-primary hover:text-linear-ink"
        >
          <Plus className="h-4 w-4" />
          Új hiba rögzítése
        </button>
      </div>

      <WizardStepFooter
        onBack={onBack}
        onNext={onNext}
        nextLabel={nextLabel}
        nextDisabled={hasIncompleteRow}
        nextTitle={hasIncompleteRow ? 'Tölts ki minden hiba-kártyát, vagy töröld az üreseket.' : undefined}
      />
    </div>
  );
}
