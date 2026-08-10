'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, ExternalLink, FileText, ImagePlus, Loader2, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import { TextField, TextareaField } from '@/components/inspections/wizard/FormControls';
import { VinScanToast, type VinScanToastVariant } from '@/components/inspections/wizard/VinScanToast';
import { WizardStepFooter } from '@/components/inspections/wizard/WizardBottomBar';
import { compressImageForAiScan } from '@/lib/inspections/aiImageCompression';
import { SERVICE_ENTRY_TYPE_SUGGESTIONS, SERVICE_HISTORY_STATUS_DESCRIPTION, SERVICE_HISTORY_STATUS_LABEL } from '@/lib/inspections/constants';
import { sanitizeServiceMileage } from '@/lib/inspections/validation';
import { formatKmInput } from '@/lib/format';
import { useInspectionId } from '@/components/inspections/wizard/InspectionIdContext';
import { HintCallout } from '@/components/onboarding/HintCallout';
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
  'Az AI nem talált felismerhető szerviz-bejegyzést a kijelölt képen/képeken. A bejegyzést kézzel is felviheted.';

const AI_SCAN_NO_CREDITS_MESSAGE =
  'Elfogyott az AI kereted -- a felismerés nem futott le, a bejegyzést kézzel vidd fel. (A kereted a fejléc jelvényén/az Előfizetés oldalon tölthető fel.)';

const AI_SCAN_NO_PHOTOS_MESSAGE = 'Előbb tölts fel legalább egy fotót a szervizkönyvről/számláról, utána indítható a felismerés.';

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
 *     Storage-feltöltés csak a végleges mentéskor történik). A rács MELLETT egy "Felismerés
 *     indítása (AI)" gomb GOMBRA KATTINTVA (nem automatikusan feltöltéskor, lásd a lenti
 *     kommentet) elindítja a Gemini Vision AI-elemzést (`runAiScanOnPhotos`) a MÉG felismeretlen
 *     fotókon.
 *  C) Idővonal -- dinamikus, dátum/km óra állás/típus/megjegyzés bejegyzés-kártyák, ugyanaz a
 *     minta, mint a `StepDiagnostics.tsx` hibakód-listájánál. A sorok KÉZZEL ("+ Új
 *     szerviz-bejegyzés rögzítése" gombbal) VAGY a B) pont AI-elemzéséből is bekerülhetnek --
 *     a listában nincs megkülönböztetés köztük, mindegyik egyformán szerkeszthető/törölhető.
 */
export function StepServiceHistory({ value, onChange, onBack, onNext, nextLabel }: StepServiceHistoryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const inspectionId = useInspectionId();

  // Gemini Vision AI szkenner (`/api/ai/scan-service-doc`, lásd a route JSDoc-ját) --
  // szervizkönyv-oldal VAGY számla/munkalap fotójából szerviz-bejegyzések (dátum/km óra
  // állás/típus/megjegyzés) kinyerése. **2026-08-06, GOMBBAL indítható, NEM automatikus
  // finomítás:** korábban (63. szakasz) egy KÜLÖN, saját fájlválasztóval rendelkező kártya/gomb
  // volt, majd (64. szakasz) a felhasználó kérésére automatikusra állítottuk (minden feltöltött
  // fotó azonnal átment az elemzésen) -- ez viszont a felhasználó szerint "valamiért nem
  // működött" (feltehetően a kamera/galéria `<input onChange>` egyes böngészőkben/eszközökön
  // nem a várt módon triggerelte a láncot, vagy egyszerűen nem volt egyértelmű, hogy történik
  // valami a háttérben), ezért EXPLICIT gombra váltottunk vissza: a fotók feltöltése
  // (`handleFilesSelected`) TOVÁBBRA IS önmagában, AI-hívás NÉLKÜL történik, a felismerést a
  // usernek a "Felismerés indítása (AI)" gombbal KELL elindítania -- ez egyértelműbb (látható,
  // kattintható, visszajelzést ad) és megbízhatóbb (egyetlen, explicit user-akció indítja a
  // hálózati hívást, nem egy fájlválasztó `onChange` eseményéhez láncolt mellékhatás).
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [aiScanProgress, setAiScanProgress] = useState<{ current: number; total: number } | null>(null);
  const [aiScanToast, setAiScanToast] = useState<{ variant: VinScanToastVariant; message: string } | null>(null);

  // A már elemzett fotók `clientId`-jai -- a gomb csak az EZEKBEN NEM szereplő (még nem
  // felismertetett) fotókat küldi el az AI-nak, hogy ismételt gombnyomásra ne dolgozza fel
  // (és ne számlázza le kredit szempontjából) újra ugyanazt a képet.
  const [scannedPhotoIds, setScannedPhotoIds] = useState<Set<string>>(new Set());

  // A `value` prop MINDIG a legfrissebb wizard state -- egy `ref`-ben tartjuk szinkronban
  // (`useEffect`), hogy a `runAiScanOnPhotos()` több `await`-en átívelő, hosszabb ideig futó
  // ciklusa MINDIG a ténylegesen legfrissebb `entries`/`photos` tetejére merge-eljen, ne egy a
  // ciklus INDULÁSAKOR (esetleg már elavult) `value`-t írjon vissza.
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
    // Szándékosan NINCS automatikus AI-hívás itt -- lásd a fenti kommentet. A felismerést a
    // "Felismerés indítása (AI)" gomb (`handleRunAiScanClick`) indítja el, kézzel.
  }

  /**
   * A "Felismerés indítása (AI)" gomb kattintás-kezelője -- összegyűjti a jelenlegi
   * `value.photos` közül azokat, amiknek van kliens-oldali `file`-juk (csak az EBBEN A
   * session-ben, most feltöltött fotókat lehet elküldeni Base64-ként, egy korábban mentett,
   * már Storage-ban lévő fotóhoz csak URL tartozik, `file` nélkül) ÉS még nincsenek a
   * `scannedPhotoIds`-ban, majd elindítja rájuk a `runAiScanOnPhotos()`-t. Ha nincs ilyen fotó
   * (mert még semmi nincs feltöltve, VAGY minden feltöltött fotó már fel lett dolgozva), egy
   * rövid toast jelzi ezt, hálózati hívás nélkül.
   */
  function handleRunAiScanClick() {
    const pending = value.photos.filter((photo) => photo.file && !scannedPhotoIds.has(photo.clientId));

    if (pending.length === 0) {
      setAiScanToast({
        variant: 'warning',
        message: value.photos.length === 0 ? AI_SCAN_NO_PHOTOS_MESSAGE : 'Minden feltöltött fotó már fel lett dolgozva -- tölts fel egy újabbat a további felismeréshez.',
      });
      return;
    }

    // Azonnal megjelöljük "elemzettnek" a most induló fotókat -- ismételt gombnyomás közben
    // (amíg az első kérés még fut) ne induljon el rájuk egy második, párhuzamos hívás.
    setScannedPhotoIds((prev) => {
      const next = new Set(prev);
      for (const photo of pending) next.add(photo.clientId);
      return next;
    });

    void runAiScanOnPhotos(pending.map((photo) => photo.file as File));
  }

  /**
   * A "Felismerés indítása (AI)" gomb (`handleRunAiScanClick`) által meghívott, tényleges
   * batch-feldolgozó -- SORBAN (nem párhuzamosan -- lásd lent, miért) végigmegy a kapott
   * fájlokon, mindegyiket tömöríti (`compressImageForAiScan`) és elküldi a
   * `/api/ai/scan-service-doc` route-nak, majd a felismert bejegyzéseket a `valueRef.current`
   * TETEJÉRE (nem a hívás INDULÁSAKOR rögzített, esetleg időközben elavult `value`-ra) fűzi
   * hozzá.
   *
   * **Miért SOROS, nem `Promise.all`-lal párhuzamos:** (1) minden hívás kreditet/AI-keretet
   * fogyaszt -- ha a keret a 2. fotónál kifogyna, a sorosság garantálja, hogy a hátralévő
   * fotók feldolgozása azonnal leáll, nem indul el felesleges (biztosan `402`-t kapó) hívás
   * mindegyikre; (2) a `onChange`-eket egymás UTÁN, nem egyszerre hívjuk, ami elkerüli, hogy
   * két egyidejűleg lezáruló hívás egymás eredményét felülírja.
   *
   * A sikeres/hibás eredményt EGYETLEN összegző toast-tal jelzi a batch végén (nem
   * fotónként), hogy több kép egyszerre feldolgozásakor ne "villogjon" több egymást
   * követő üzenet.
   *
   * **Kredit/AI-keret kifogyás (`402`) -- SZÁNDÉKOSAN NEM a globális "🔒 Elfogyott a kereted"
   * blokkoló modal (`useInsufficientCredits`), ellentétben a `StepCarInfo.tsx`/`StepEquipment.tsx`
   * AI-gombjaival:** a fotó ekkorra MÁR feltöltve/elmentve van a galériába, függetlenül az
   * AI-hívás sikerétől -- egy teljes képernyős modal itt feleslegesen félbeszakítaná a usert
   * a wizard kitöltése közben egy olyan mellékfunkció miatt, ami csak kényelmi gyorsítás.
   * Ehelyett csendben leáll a batch, és egy NEM blokkoló, magától eltűnő lokális toast
   * (`AI_SCAN_NO_CREDITS_MESSAGE`) jelzi, hogy a felismerés kimaradt, a bejegyzést kézzel
   * kell felvinni.
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
          body: JSON.stringify({ image: imageDataUrl, inspectionId }),
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
          : `Szervizbejegyzés(ek) sikeresen beolvasva AI-val: ${totalNewEntries} bejegyzés hozzáadva.`,
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
          Fotózd be a meglévő iratokat, és rögzítsd a korábbi szervizeseményeket.
        </p>
      </div>

      <HintCallout id="service-history" title="Tipp: fotózd le a szervizkönyvet">
        Töltsd fel a szervizkönyv vagy a számlák fotóit, majd egy gombnyomással felismertetheted velük az
        AI-t -- ezzel kihagyhatod az idővonal kézi begépelését.
      </HintCallout>

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

      {/* B) Fotófeltöltés -- a fotó feltöltése ÖNMAGÁBAN nem indít AI-hívást (lásd
          `handleFilesSelected` kommentjét); a felismerést a rács ALATTI "Felismerés indítása
          (AI)" gomb (`handleRunAiScanClick`) indítja el, kézzel. */}
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Dokumentumok fotói (szervizkönyv, számlák)
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

        {/* "Felismerés indítása (AI)" gomb -- lásd `handleRunAiScanClick` JSDoc-ját. Mindig
            látható (nem csak feltöltött fotónál), hogy a szaki tudja, hogy ez a funkció létezik
            -- üres galériánál/már feldolgozott fotóknál kattintásra egy toast jelzi, mit kell
            tenni, nincs `disabled` állapot, hogy a gomb sose tűnjön "hibásnak/inaktívnak". */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleRunAiScanClick}
            disabled={isAiScanning}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-linear-primary px-4 text-[13px] font-semibold text-white transition-colors hover:bg-linear-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAiScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {isAiScanning
              ? `AI elemzi a dokumentumot${aiScanProgress && aiScanProgress.total > 1 ? ` (${aiScanProgress.current}/${aiScanProgress.total})` : ''}…`
              : '📷 Felismerés indítása (AI)'}
          </button>
          <span className="text-[12px] text-linear-ink-subtle">
            A fenti fotókból kiolvassa a szerviz-bejegyzéseket (dátum, km óra állás, típus) az idővonalba.
          </span>
        </div>
        <HintCallout id="service-history-ai-scan">
          Csak a MÉG fel nem dolgozott fotókat elemzi -- ha később újabb képet töltesz fel, ugyanezzel a
          gombbal indíthatod el rá is a felismerést.
        </HintCallout>
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

      {/* C) Idővonal -- a fenti B) blokk "Felismerés indítása (AI)" gombjával kinyert
          bejegyzéseket ugyanúgy listázza, mint a kézzel felvitteket (nincs "AI által generált"
          megkülönböztető jelölés, mert bármelyik szabadon szerkeszthető/törölhető). */}
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
