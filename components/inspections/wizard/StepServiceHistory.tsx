'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, ImagePlus, Loader2, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import { TextField, TextareaField } from '@/components/inspections/wizard/FormControls';
import { VinScanToast, type VinScanToastVariant } from '@/components/inspections/wizard/VinScanToast';
import { WizardStepFooter } from '@/components/inspections/wizard/WizardBottomBar';
import { compressImageForAiScan } from '@/lib/inspections/aiImageCompression';
import { SERVICE_ENTRY_TYPE_SUGGESTIONS, SERVICE_HISTORY_STATUS_DESCRIPTION, SERVICE_HISTORY_STATUS_LABEL } from '@/lib/inspections/constants';
import { sanitizeServiceMileage } from '@/lib/inspections/validation';
import { formatKmInput } from '@/lib/format';
import {
  CREATE_GENERAL_PHOTO,
  EMPTY_SERVICE_DOCUMENT,
  EMPTY_SERVICE_HISTORY_ENTRY,
  type ServiceHistoryEntryState,
  type ServiceHistoryState,
  type ServiceHistoryStatus,
} from '@/lib/inspections/types';

const AI_SCAN_FAILURE_MESSAGE = 'Nem sikerült az AI-alapú beolvasás. A fotó feltöltve, de a bejegyzést vidd fel kézzel!';

const AI_SCAN_TOO_LARGE_MESSAGE =
  'Egy kép túl nagy volt a feldolgozáshoz a tömörítés után is. A fotó feltöltve, de a bejegyzést vidd fel kézzel!';

const AI_SCAN_NO_ENTRIES_MESSAGE =
  'Az AI nem talált felismerhető szerviz-bejegyzést a feltöltött képen/képeken. A fotó(k) feltöltve, a bejegyzést kézzel is felviheted.';

const AI_SCAN_NO_CREDITS_MESSAGE =
  'A fotó(k) feltöltve, de elfogyott az AI kereted -- az automatikus felismerés kimaradt, a bejegyzést kézzel vidd fel. (A kereted a fejléc jelvényén/az Előfizetés oldalon tölthető fel.)';

/** A `/api/ai/scan-service-doc` route válasz-alakja (lásd `app/api/ai/scan-service-doc/route.ts`)
 * -- csak a kliens-oldalon ténylegesen felhasznált mezőket modellezi, ugyanaz az elv, mint a
 * `StepCarInfo.tsx` `ScanVinApiResponse` típusánál. */
interface ScanServiceDocApiResponse {
  success: boolean;
  data?: {
    entries: { date?: string; mileage?: string; type?: string; notes?: string }[];
    confidence: 'high' | 'medium' | 'low';
    detectedDocumentType: 'service_book' | 'invoice' | 'other';
  };
  error?: string;
  details?: string;
}

interface StepServiceHistoryProps {
  value: ServiceHistoryState;
  onChange: (value: ServiceHistoryState) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
}

const STATUS_OPTIONS: ServiceHistoryStatus[] = ['full', 'partial', 'digital', 'none'];

/**
 * LÉPÉS -- Szervizmúlt & Dokumentumok modul (PROJEKT_INSTRUKCIOK.md, "Szervizmúlt &
 * Dokumentumok modul" lépés). 3 alappillér:
 *  A) Általános státusz -- 4 választható rádiógomb-kártya (`SERVICE_HISTORY_STATUS_LABEL`).
 *  B) Fotófeltöltés -- a szervizkönyv/számlák lefotózása, ugyanaz a minta, mint a
 *     `StepGeneralPhotos.tsx`-nél (több kép egyszerre, kliens-oldali előnézet, a tényleges
 *     Storage-feltöltés csak a végleges mentéskor történik). **2026-08-06 óta MINDEN ide
 *     feltöltött fotó AUTOMATIKUSAN, gomb nélkül átmegy a Gemini Vision AI-elemzésen
 *     (`runAiScanOnPhotos`) -- nincs külön "AI beolvasás" gomb/kártya, lásd a lenti kommentet.
 *  C) Idővonal -- dinamikus, dátum/km óra állás/típus/megjegyzés bejegyzés-kártyák, ugyanaz a
 *     minta, mint a `StepDiagnostics.tsx` hibakód-listájánál. A sorok KÉZZEL ("+ Új
 *     szerviz-bejegyzés rögzítése" gombbal) VAGY a B) pont AI-elemzéséből is bekerülhetnek --
 *     a listában nincs megkülönböztetés köztük, mindegyik egyformán szerkeszthető/törölhető.
 */
export function StepServiceHistory({ value, onChange, onBack, onNext, nextLabel }: StepServiceHistoryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Gemini Vision AI szkenner (`/api/ai/scan-service-doc`, lásd a route JSDoc-ját) --
  // szervizkönyv-oldal VAGY számla/munkalap fotójából szerviz-bejegyzések (dátum/km óra
  // állás/típus/megjegyzés) kinyerése. **2026-08-06, "Automatikus, gomb nélküli AI-beolvasás"
  // finomítás:** korábban ez egy KÜLÖN, saját fájlválasztóval rendelkező kártya/gomb volt --
  // a felhasználó jelezte, hogy ez zavaró/felesleges plusz lépés, ő egyszerűen a "Dokumentumok
  // fotói" feltöltőbe (lásd `handleFilesSelected`) várta a fotót, és nem talált külön gombot a
  // felismertetéshez. Mostantól NINCS külön gomb/fájlválasztó: a "Dokumentumok fotói" blokkba
  // feltöltött MINDEN kép AUTOMATIKUSAN átmegy az AI-elemzésen, feltöltés UTÁN azonnal,
  // felhasználói interakció nélkül -- lásd `runAiScanOnPhotos()`.
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [aiScanProgress, setAiScanProgress] = useState<{ current: number; total: number } | null>(null);
  const [aiScanToast, setAiScanToast] = useState<{ variant: VinScanToastVariant; message: string } | null>(null);

  // A `value` prop MINDIG a legfrissebb wizard state -- egy `ref`-ben tartjuk szinkronban
  // (`useEffect`), hogy a `runAiScanOnPhotos()` több `await`-en átívelő, hosszabb ideig futó
  // ciklusa MINDIG a ténylegesen legfrissebb `entries`/`photos` tetejére merge-eljen, ne egy a
  // ciklus INDULÁSAKOR (esetleg már elavult) `value`-t írjon vissza -- enélkül egy második,
  // gyorsan egymás után feltöltött fotó AI-eredménye elveszíthetné az első fotó közben
  // hozzáadott sorait (vagy fordítva).
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  function setStatus(status: ServiceHistoryStatus) {
    onChange({ ...value, status });
  }

  function handleFilesSelected(files: FileList) {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const newPhotos = imageFiles.map((file) => CREATE_GENERAL_PHOTO(file));
    onChange({ ...value, photos: [...value.photos, ...newPhotos] });

    // A fotó(k) hozzáadása UTÁN, automatikusan, gomb nélkül indul az AI-elemzés -- lásd a
    // fenti kommentet és `runAiScanOnPhotos()` JSDoc-ját. `void`: a `handleFilesSelected`
    // maga NEM async (az `<input onChange>` szinkron), a feldolgozás a háttérben fut tovább.
    void runAiScanOnPhotos(imageFiles);
  }

  /**
   * Sorban (nem párhuzamosan -- lásd lent, miért) végigmegy az ÚJONNAN feltöltött
   * dokumentum-fotókon, mindegyiket tömöríti (`compressImageForAiScan`) és elküldi a
   * `/api/ai/scan-service-doc` route-nak, majd a felismert bejegyzéseket a `valueRef.current`
   * TETEJÉRE (nem a `handleFilesSelected` hívásakor rögzített, esetleg elavult `value`-ra)
   * fűzi hozzá.
   *
   * **Miért SOROS, nem `Promise.all`-lal párhuzamos:** (1) minden hívás kreditet/AI-keretet
   * fogyaszt -- ha a keret a 2. fotónál kifogyna, a sorosság garantálja, hogy a hátralévő
   * fotók feldolgozása azonnal leáll, nem indul el felesleges (biztosan `402`-t kapó) hívás
   * mindegyikre; (2) a `onChange`-eket egymás UTÁN,
   * nem egyszerre hívjuk, ami elkerüli, hogy két egyidejűleg lezáruló hívás egymás
   * eredményét felülírja (a `valueRef` MINDEN `onChange` után frissül, de csak a KÖVETKEZŐ
   * render/effect körben -- soros feldolgozásnál ez sosem okoz versenyhelyzetet, mert a
   * következő hálózati hívás időtartama bőven elég a re-render lefutásához).
   *
   * A sikeres/hibás eredményt EGYETLEN összegző toast-tal jelzi a batch végén (nem
   * fotónként), hogy több kép egyszerre feltöltésekor ne "villogjon" több egymást followuppoló
   * üzenet.
   *
   * **Kredit/AI-keret kifogyás (`402`) -- SZÁNDÉKOSAN NEM a globális "🔒 Elfogyott a kereted"
   * blokkoló modal (`useInsufficientCredits`), ellentétben a `StepCarInfo.tsx`/`StepEquipment.tsx`
   * gombbal INDÍTOTT AI-hívásaival (2026-08-06, felhasználói kérésre javítva -- lásd status.md
   * 65. szakasz):** mivel ez a felismerés a fotó FELTÖLTÉSÉNEK automatikus, háttérben futó
   * mellékhatása (nem egy explicit AI-gomb kattintás), egy teljes képernyős, kattintást igénylő
   * modal félbeszakítaná a felhasználót a dokumentum-fotózás közepén, holott a fotó feltöltése
   * MAGA teljesen sikeres marad, csak az automatikus kitöltés marad el. Ehelyett csendben
   * leáll a batch (a hátralévő fotókra sem indul újabb, garantáltan `402`-t kapó hívás), és a
   * batch végén egy NEM blokkoló, magától eltűnő lokális toast (`AI_SCAN_NO_CREDITS_MESSAGE`)
   * jelzi, hogy a fotó(k) feltöltve, de a bejegyzést kézzel kell felvinni.
   */
  async function runAiScanOnPhotos(files: File[]) {
    if (files.length === 0) return;

    setIsAiScanning(true);
    setAiScanToast(null);

    let totalNewEntries = 0;
    let anyLowConfidence = false;
    let lastErrorMessage: string | null = null;
    let insufficientCreditsHit = false;

    for (let i = 0; i < files.length; i++) {
      setAiScanProgress({ current: i + 1, total: files.length });
      const file = files[i];

      try {
        const imageDataUrl = await compressImageForAiScan(file);

        const response = await fetch('/api/ai/scan-service-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: imageDataUrl }),
        });

        // 402 -- lásd a fenti JSDoc "Kredit/AI-keret kifogyás" szakaszát: NINCS blokkoló
        // modal, csak csendes leállás -- a fotó már feltöltve marad, a batch hátralévő
        // részét leállítjuk (a további fotók úgyis `402`-t kapnának).
        if (response.status === 402) {
          insufficientCreditsHit = true;
          break;
        }

        let result: ScanServiceDocApiResponse | null = null;
        try {
          result = (await response.json()) as ScanServiceDocApiResponse;
        } catch (parseError) {
          console.error(
            '[StepServiceHistory] A /api/ai/scan-service-doc válasza nem érvényes JSON (státusz:',
            response.status,
            '):',
            parseError
          );
        }

        if (!response.ok || !result?.success || !result?.data) {
          if (result?.details) console.error('[StepServiceHistory] Gemini scan-service-doc hiba részletek:', result.details);
          lastErrorMessage = result?.error ?? (response.status === 413 ? AI_SCAN_TOO_LARGE_MESSAGE : AI_SCAN_FAILURE_MESSAGE);
          continue;
        }

        const { entries: extractedEntries, confidence } = result.data;
        if (extractedEntries.length === 0) continue;
        if (confidence === 'low') anyLowConfidence = true;

        const newEntries: ServiceHistoryEntryState[] = extractedEntries.map((extracted) => ({
          ...EMPTY_SERVICE_HISTORY_ENTRY(),
          date: extracted.date ?? '',
          mileage: extracted.mileage ?? '',
          type: extracted.type ?? '',
          notes: extracted.notes ?? '',
        }));

        totalNewEntries += newEntries.length;
        onChange({ ...valueRef.current, entries: [...valueRef.current.entries, ...newEntries] });
      } catch {
        lastErrorMessage = AI_SCAN_FAILURE_MESSAGE;
      }
    }

    setIsAiScanning(false);
    setAiScanProgress(null);

    // A kredit/AI-keret kifogyás CSENDES (nem blokkoló) jelzése -- lásd a fenti JSDoc-ot.
    // Ha közben MÁR sikerült néhány fotóból bejegyzést kinyerni (pl. az 1. fotó sikeres volt,
    // a 2.-nál fogyott el a keret), a sikeres eredményt priorizáljuk -- a usernek fontosabb
    // tudnia, hogy X bejegyzés bekerült, mint a keret-üzenetet olvasnia.
    if (insufficientCreditsHit && totalNewEntries === 0) {
      setAiScanToast({ variant: 'warning', message: AI_SCAN_NO_CREDITS_MESSAGE });
      return;
    }

    // Magyarban a számnév utáni főnév nem kap többes számot ("2 bejegyzés", nem "2 bejegyzések").
    if (totalNewEntries > 0) {
      setAiScanToast({
        variant: anyLowConfidence ? 'warning' : 'success',
        message: anyLowConfidence
          ? `Beolvasva (${totalNewEntries} bejegyzés), de kérlek ellenőrizd az adatokat -- egy vagy több kép elmosódott lehetett!`
          : `Szervizbejegyzés(ek) automatikusan beolvasva AI-val: ${totalNewEntries} bejegyzés hozzáadva.`,
      });
    } else if (lastErrorMessage) {
      setAiScanToast({ variant: 'warning', message: lastErrorMessage });
    } else {
      setAiScanToast({ variant: 'warning', message: AI_SCAN_NO_ENTRIES_MESSAGE });
    }
  }

  function handleRemovePhoto(clientId: string) {
    const target = value.photos.find((photo) => photo.clientId === clientId);
    if (target?.file && target.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
    onChange({ ...value, photos: value.photos.filter((photo) => photo.clientId !== clientId) });
  }

  function handlePdfSelected(file: File) {
    if (file.type !== 'application/pdf') return;
    onChange({ ...value, carVerticalPdf: { file, url: null, fileName: file.name } });
  }

  function handleRemovePdf() {
    onChange({ ...value, carVerticalPdf: EMPTY_SERVICE_DOCUMENT });
  }

  function addEntry() {
    onChange({ ...value, entries: [...value.entries, EMPTY_SERVICE_HISTORY_ENTRY()] });
  }

  function updateEntry(id: string, patch: Partial<{ date: string; mileage: string; type: string; notes: string }>) {
    onChange({
      ...value,
      entries: value.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  }

  function removeEntry(id: string) {
    onChange({ ...value, entries: value.entries.filter((entry) => entry.id !== id) });
  }

  return (
    <div className="flex flex-col gap-6">
      {aiScanToast && (
        <VinScanToast
          variant={aiScanToast.variant}
          message={aiScanToast.message}
          onDismiss={() => setAiScanToast(null)}
        />
      )}

      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Szervizmúlt & Dokumentumok</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Rögzítsd a jármű szervizmúltjának állapotát, a dokumentumok fotóit, és -- ha rendelkezésre áll --
          a korábbi szerviz-események idővonalát.
        </p>
      </div>

      {/* A) Általános státusz */}
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">Általános státusz</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {STATUS_OPTIONS.map((status) => {
            const isSelected = value.status === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatus(status)}
                aria-pressed={isSelected}
                className={
                  'flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors ' +
                  (isSelected
                    ? 'border-linear-primary bg-linear-primary/10'
                    : 'border-linear-hairline bg-linear-surface-1 hover:bg-linear-surface-2')
                }
              >
                <span className={'text-[14px] font-medium ' + (isSelected ? 'text-linear-ink' : 'text-linear-ink')}>
                  {SERVICE_HISTORY_STATUS_LABEL[status]}
                </span>
                <span className="text-[12px] text-linear-ink-subtle">{SERVICE_HISTORY_STATUS_DESCRIPTION[status]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* B) Fotófeltöltés -- 2026-08-06, "Automatikus, gomb nélküli AI-beolvasás" finomítás:
          KÜLÖN AI-gomb/fájlválasztó helyett MINDEN ide feltöltött fotó automatikusan átmegy a
          `/api/ai/scan-service-doc` Gemini Vision elemzésen (lásd `handleFilesSelected` /
          `runAiScanOnPhotos` JSDoc-ját) -- a folyamat állapotát ez a szekció jelzi inline. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
            Dokumentumok fotói (szervizkönyv, számlák)
          </p>
          {isAiScanning && (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-linear-primary-hover">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              AI elemzi a feltöltött dokumentumot
              {aiScanProgress && aiScanProgress.total > 1 ? ` (${aiScanProgress.current}/${aiScanProgress.total})` : ''}…
            </span>
          )}
        </div>
        <p className="text-[12px] text-linear-ink-subtle">
          A feltöltött fotókból az AI automatikusan megpróbálja kiolvasni a szerviz-bejegyzéseket
          (dátum, km óra állás, típus) az alábbi idővonalba -- nincs szükség külön gombra.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {value.photos.map((photo) => (
            <div
              key={photo.clientId}
              className="relative aspect-square overflow-hidden rounded-md border border-linear-hairline bg-linear-surface-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- kliens-oldali object URL / meglévő Storage URL előnézet */}
              <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemovePhoto(photo.clientId)}
                aria-label="Fotó eltávolítása"
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-linear-hairline-strong bg-linear-surface-1 px-2 text-center transition-colors hover:border-linear-primary hover:bg-linear-surface-3"
          >
            <ImagePlus className="h-5 w-5 text-linear-ink-subtle" />
            <span className="text-[12px] font-medium text-linear-ink-subtle">Fotók hozzáadása</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
            />
          </button>
        </div>
      </div>

      {/* CarVertical (vagy hasonló autó-előéleti szolgáltatás) PDF riport -- a Dokumentumok
          fotói után, a Manuális Idővonal előtt, mert szintén "dokumentum-jellegű" adat, de
          egyetlen PDF fájl, nem képgaléria. */}
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          CarVertical riport (PDF)
        </p>
        {value.carVerticalPdf.fileName ? (
          <div className="flex items-center gap-3 rounded-lg border border-linear-hairline bg-linear-surface-1 p-4">
            <FileText className="h-5 w-5 shrink-0 text-linear-primary" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-linear-ink">{value.carVerticalPdf.fileName}</span>
            {value.carVerticalPdf.url && (
              <a
                href={value.carVerticalPdf.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="PDF megnyitása"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-linear-ink-subtle transition-colors hover:bg-linear-surface-2 hover:text-linear-ink"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              type="button"
              onClick={handleRemovePdf}
              aria-label="PDF eltávolítása"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-linear-ink-subtle transition-colors hover:bg-linear-surface-2 hover:text-linear-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-linear-hairline-strong bg-linear-surface-1 px-4 py-4 text-[13px] font-medium text-linear-ink-subtle transition-colors hover:border-linear-primary hover:text-linear-ink"
          >
            <UploadCloud className="h-4 w-4" />
            CarVertical PDF feltöltése
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handlePdfSelected(e.target.files[0]);
                e.target.value = '';
              }}
            />
          </button>
        )}
      </div>

      {/* C) Manuális Idővonal -- a fenti B) blokkba feltöltött fotókból az AI automatikusan
          idekerülő bejegyzéseket ugyanúgy listázza, mint a kézzel felvitteket (nincs "AI által
          generált" megkülönböztető jelölés, mert bármelyik szabadon szerkeszthető/törölhető). */}
      <div className="flex flex-col gap-4">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Idővonal ({value.entries.length} bejegyzés)
        </p>

        {value.entries.map((entry, index) => (
          <div key={entry.id} className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
                <FileText className="h-3.5 w-3.5" />#{index + 1}. bejegyzés
              </span>
              <button
                type="button"
                onClick={() => removeEntry(entry.id)}
                aria-label="Bejegyzés törlése"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-linear-ink-subtle transition-colors hover:bg-linear-surface-2 hover:text-linear-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Dátum"
                name={`svc-date-${entry.id}`}
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                className="[color-scheme:dark]"
                value={entry.date}
                onChange={(e) => updateEntry(entry.id, { date: e.target.value })}
              />
              <TextField
                label="Km óra állás"
                name={`svc-mileage-${entry.id}`}
                inputMode="numeric"
                placeholder="pl. 84 000"
                value={formatKmInput(entry.mileage)}
                onChange={(e) => updateEntry(entry.id, { mileage: sanitizeServiceMileage(e.target.value) })}
              />
              <div className="sm:col-span-2">
                <TextField
                  label="Típus"
                  name={`svc-type-${entry.id}`}
                  list={`svc-type-suggestions-${entry.id}`}
                  placeholder="pl. Olajcsere"
                  value={entry.type}
                  onChange={(e) => updateEntry(entry.id, { type: e.target.value })}
                />
                <datalist id={`svc-type-suggestions-${entry.id}`}>
                  {SERVICE_ENTRY_TYPE_SUGGESTIONS.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </div>
              <div className="sm:col-span-2">
                <TextareaField
                  label="Megjegyzés (opcionális)"
                  name={`svc-notes-${entry.id}`}
                  placeholder="pl. Márkaszervizben végezve, garanciális munka"
                  value={entry.notes}
                  onChange={(e) => updateEntry(entry.id, { notes: e.target.value })}
                />
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addEntry}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-linear-hairline-strong bg-linear-surface-1 px-4 py-3 text-[14px] font-medium text-linear-ink-subtle transition-colors hover:border-linear-primary hover:text-linear-ink"
        >
          <Plus className="h-4 w-4" />
          Új szerviz-bejegyzés rögzítése
        </button>
      </div>

      <WizardStepFooter onBack={onBack} onNext={onNext} nextLabel={nextLabel} />
    </div>
  );
}
