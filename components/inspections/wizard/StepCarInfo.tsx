'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Camera, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SelectField, TextField } from '@/components/inspections/wizard/FormControls';
import { VinScanToast, type VinScanToastVariant } from '@/components/inspections/wizard/VinScanToast';
import { WizardStepFooter } from '@/components/inspections/wizard/WizardBottomBar';
import { CAR_BRANDS, CAR_CATALOG, OTHER_OPTION } from '@/lib/inspections/carCatalog';
import {
  getCarInfoErrors,
  sanitizeLicensePlate,
  sanitizeOdometer,
  sanitizeVin,
  sanitizeYear,
} from '@/lib/inspections/validation';
import { formatKmInput } from '@/lib/format';
import { LICENSE_PLATE_COUNTRIES } from '@/lib/inspections/constants';
import { useInsufficientCredits } from '@/components/credits/InsufficientCreditsProvider';
import type { CarInfoState } from '@/lib/inspections/types';

const AI_SCAN_FAILURE_MESSAGE = 'Nem sikerült az AI-alapú beolvasás. Próbáld újra, vagy gépeld be manuálisan!';

const AI_SCAN_TOO_LARGE_MESSAGE =
  'A kép túl nagy volt a feltöltéshez a tömörítés után is. Próbálj egy alacsonyabb felbontású fotót, vagy gépeld be manuálisan!';

/** A `/api/ai/scan-vin` route válasz-alakja (lásd `app/api/ai/scan-vin/route.ts`) -- csak a
 * kliens-oldalon ténylegesen felhasznált mezőket modellezi, ugyanaz az elv, mint a
 * `StepEquipment.tsx` `ParseEquipmentApiResponse` típusánál. */
interface ScanVinApiResponse {
  success: boolean;
  data?: {
    vin: string;
    confidence: 'high' | 'medium' | 'low';
    detectedDocumentType: 'vin_plate' | 'registration_certificate' | 'other';
    extractedDetails?: {
      plateNumber?: string;
      make?: string;
      model?: string;
      registrationYear?: string;
    };
  };
  error?: string;
  /** Hibakeresési célú nyers hibaüzenet -- lásd `route.ts` `toErrorDetails()`. */
  details?: string;
}

/** A kép leghosszabb oldala (px) tömörítés UTÁN -- egy Forgalmi Engedély/VIN-matrica
 * szövege bőven olvasható marad ekkora felbontáson is, miközben a fájlméret drasztikusan
 * csökken egy natív telefonfotóhoz (gyakran 3000-4000px+ oldalhosszal) képest. */
const AI_SCAN_MAX_DIMENSION = 1600;
/** JPEG tömörítési minőség (0-1) -- 0.82 jó kompromisszum: a szöveg élesen olvasható marad
 * OCR/AI-elemzéshez, a fájlméret mégis a töredéke egy tömörítetlen fotónak. */
const AI_SCAN_JPEG_QUALITY = 0.82;

/**
 * A kiválasztott fotót Canvas-szal átméretezi (leghosszabb oldal max. `AI_SCAN_MAX_DIMENSION`
 * px-re) és JPEG-ként újratömöríti (`AI_SCAN_JPEG_QUALITY`), mielőtt Base64 data URL-lé
 * alakítaná a `/api/ai/scan-vin` route-nak küldött kéréshez.
 *
 * **Miért kellett ez a lépés:** a Vercel Serverless Function-ök request body mérete
 * (a JSON+Base64 kép EGYÜTT) egy kb. 4,5 MB-os, a platform által kikényszerített, nem
 * konfigurálható felső korláttal rendelkezik. Egy natív telefonfotó (jellemzően 2-8 MB,
 * ráadásul Base64 kódolással +33% méretnövekedéssel) simán túllépi ezt -- ilyenkor a
 * kérés MÉG A ROUTE-UNK MEGHÍVÁSA ELŐTT, Vercel-infrastruktúra szinten elutasításra kerül
 * egy `413`-as (vagy HTML-hibaoldalas, NEM JSON) válasszal, amit a kliens `response.json()`
 * hívása kivétellel jelez -- ez okozta a felhasználó által jelentett generikus
 * `AI_SCAN_FAILURE_MESSAGE` hibaüzenetet minden feltöltésnél. A kliens-oldali tömörítés
 * megelőzi ezt: egy 1600px-es, 0,82 minőségű JPEG szinte mindig jóval 1 MB alatt marad.
 */
function compressImageForAiScan(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const scale = Math.min(1, AI_SCAN_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('A böngésző nem támogatja a Canvas 2D kontextust.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', AI_SCAN_JPEG_QUALITY));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Ismeretlen hiba a kép tömörítése közben.'));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('A kép betöltése sikertelen.'));
    };

    img.src = objectUrl;
  });
}

/** Az AI által felismert gyártmány szöveget megpróbálja a `CAR_CATALOG`-ban szereplő PONTOS
 * névre illeszteni (ékezet-/kis-nagybetű-független összehasonlítással, `localeCompare`
 * `sensitivity: 'base'`-zel -- pl. "skoda"/"Škoda" is egyezzen). `null`, ha nincs egyértelmű
 * találat -- ekkor a hívó a nyers AI-szöveget szabad szöveges ("Egyéb / Más") mezőként tölti
 * be, ugyanúgy, mint amikor a user maga választ ismeretlen márkát. A Típus mező NEM katalógus-
 * alapú (lásd lent), ezért ahhoz nincs hasonló illesztő függvény -- a nyers AI-szöveg
 * közvetlenül a szabad szöveges mezőbe kerül. */
function matchCatalogBrand(rawMake: string | undefined): string | null {
  const trimmed = rawMake?.trim();
  if (!trimmed) return null;
  return Object.keys(CAR_CATALOG).find((brand) => brand.localeCompare(trimmed, 'hu', { sensitivity: 'base' }) === 0) ?? null;
}

interface StepCarInfoProps {
  value: CarInfoState;
  onChange: (value: CarInfoState) => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe (`WIZARD_STEP_META` a constants.ts-ben) -- a "Tovább"
   * gomb felirata ebből épül fel dinamikusan, hogy egy jövőbeli lépés-sorrend módosítás
   * ne hagyhasson elavult, kézzel beégetett szöveget (lásd "Dinamikus Tovább gomb" lépés). */
  nextLabel: string;
}

/** A megadott márka szerepel-e a katalógusban -- ha nem (vagy üres), az a "Egyéb / Más"
 * szabad szöveges módot jelenti a dropdown helyett. */
function isKnownBrand(brand: string): boolean {
  return brand !== '' && brand in CAR_CATALOG;
}

/**
 * LÉPÉS 1 -- Autó alapadatok (PROJEKT_INSTRUKCIOK.md 5.B.1).
 *
 * Márka: gördülőmenüs kiválasztás a `lib/inspections/carCatalog.ts` katalógusból, "Egyéb / Más"
 * opcióval, ami szabad szöveges mezőre vált -- így ritkább márkák is rögzíthetők. Márkaváltáskor
 * a korábban beírt típus törlődik.
 *
 * **Típus: MINDIG sima szabad szöveges mező** (felhasználói kérésre, 2026-08-02 -- korábban
 * a Márkához hasonlóan katalógus-alapú dropdown volt "Egyéb / Más" opcióval, de a katalógus
 * márkánkénti típuslistája túl szűknek/karbantartás-igényesnek bizonyult a gyakorlatban) --
 * nincs `isKnownModel`/`isCustomModel` állapot, nincs katalógus-illesztés, a user (vagy az AI
 * szkenner) által beírt/felismert szöveg közvetlenül a mezőbe kerül.
 *
 * Validáció (`lib/inspections/validation.ts`): a mezők `sanitize*` függvényekkel minden
 * billentyűleütésnél tisztulnak (nagybetűsítés, csak megengedett karakterek), a hibaüzenetek
 * pedig "touched" mezőnél vagy a "Tovább" gombra kattintás után jelennek meg piros szöveggel --
 * érvénytelen adatnál a `onNext` nem hívódik meg.
 */
export function StepCarInfo({ value, onChange, onNext, nextLabel }: StepCarInfoProps) {
  const [isCustomBrand, setIsCustomBrand] = useState(() => value.carBrand !== '' && !isKnownBrand(value.carBrand));
  const [touched, setTouched] = useState<Partial<Record<keyof CarInfoState, boolean>>>({});
  const [attemptedNext, setAttemptedNext] = useState(false);

  const [vinScanToast, setVinScanToast] = useState<{ variant: VinScanToastVariant; message: string } | null>(null);

  // Gemini Vision AI szkenner (`/api/ai/scan-vin`, lásd a route JSDoc-ját) -- Forgalmi
  // Engedély VAGY alvázszám-matrica fotóból VIN + (Forgalmi esetén) rendszám/gyártmány/
  // típus/évjárat kinyerése egyetlen AI-hívással.
  const aiScanFileInputRef = useRef<HTMLInputElement>(null);
  const [isAiScanning, setIsAiScanning] = useState(false);
  const { notifyInsufficientCredits } = useInsufficientCredits();

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
      onChange({ ...value, carBrand: '', carModel: '' });
      return;
    }
    setIsCustomBrand(false);
    // Márkaváltáskor a korábbi típus törlődik -- más márkánál valószínűleg más típus érvényes.
    onChange({ ...value, carBrand: selected, carModel: '' });
  }

  function handleAiScanClick() {
    aiScanFileInputRef.current?.click();
  }

  /**
   * Fotó kiválasztása/lefotózása után Canvas-szal tömöríti a képet (`compressImageForAiScan`
   * -- lásd a JSDoc-ját arról, miért kritikus ez a Vercel request body korlátja miatt),
   * elküldi a `/api/ai/scan-vin` route-nak, majd a válasz alapján -- KIZÁRÓLAG az AI által
   * ténylegesen visszaadott mezőket felülírva -- előtölti a formot:
   *  - `vin` -> Alvázszám (a helyi `sanitizeVin` szigorú ISO 3779-tisztítást is elvégzi
   *    "MÉG EGYSZER", ugyanazzal az elvvel, mint a szerver-oldali `sanitizeVin` a route-ban --
   *    dupla védelmi vonal, nem bízzuk kizárólag a szerverre).
   *  - `extractedDetails.plateNumber` -> Rendszám (`sanitizeLicensePlate`).
   *  - `extractedDetails.make` -> Márka -- ha a `CAR_CATALOG`-ban PONTOSAN azonosítható a
   *    név (`matchCatalogBrand`), dropdown-módra váltunk a felismert értékkel; ha nem, a
   *    nyers AI-szöveggel szabad szöveges ("Egyéb / Más") módra váltunk -- UGYANAZ a
   *    viselkedés, mint amikor a user saját kezűleg választja az "Egyéb / Más" opciót egy
   *    nem katalogizált márkánál.
   *  - `extractedDetails.model` -> Típus -- a Típus mező MINDIG sima szabad szöveges mező
   *    (nincs katalógus-illesztés), a nyers AI-szöveg közvetlenül ide kerül.
   *  - `extractedDetails.registrationYear` -> Évjárat (`sanitizeYear`).
   *  - A Km óra állás mezőt az AI SOSEM tölti ki -- a Forgalmi Engedély nem tartalmaz
   *    kilométeróra-állást, ez a `/api/ai/scan-vin` válasz-sémájának SOSEM volt és nem is
   *    lesz része, a mezőt a szakinak mindig manuálisan kell kitöltenie.
   * A gomb a feldolgozás alatt le van tiltva (`isAiScanning`), hogy ne induljon el
   * párhuzamosan több hívás egy véletlen dupla kattintással.
   */
  async function handleAiScanPhotoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    // Az input értékét azonnal töröljük, hogy ugyanaz a fájl újra kiválasztható legyen.
    event.target.value = '';
    if (!file) return;

    setIsAiScanning(true);
    setVinScanToast(null);
    try {
      const imageDataUrl = await compressImageForAiScan(file);

      const response = await fetch('/api/ai/scan-vin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageDataUrl }),
      });

      // 402 INSUFFICIENT_CREDITS -- lásd `InsufficientCreditsProvider.tsx`. A globális
      // "Elfogytak az AI krediteid" modalt nyitjuk meg a lokális toast helyett.
      if (response.status === 402) {
        notifyInsufficientCredits();
        return;
      }

      // A válasz JSON-parszolását KÜLÖN try/catch-ben végezzük -- ha a kérés a Vercel
      // infrastruktúra szintjén (pl. a kb. 4,5 MB-os request body limit átlépése miatt)
      // MÉG A ROUTE-UNK MEGHÍVÁSA ELŐTT elutasításra kerül, a válasz `413`/HTML-hibaoldal
      // lehet, NEM a route JSON válasza -- ezt korábban a `response.json()` kivétele a
      // `catch`-ig görgette, ahol csak a generikus `AI_SCAN_FAILURE_MESSAGE` jelent meg,
      // a tényleges ok (túl nagy kép) nélkül. Itt explicit különválasztjuk a két esetet.
      let result: ScanVinApiResponse | null = null;
      try {
        result = (await response.json()) as ScanVinApiResponse;
      } catch (parseError) {
        console.error(
          '[StepCarInfo] A /api/ai/scan-vin válasza nem érvényes JSON (státusz:',
          response.status,
          '):',
          parseError
        );
      }

      if (!response.ok || !result?.success || !result?.data) {
        // A `details` mezőt (ha érkezett) a konzolba is kilogoljuk hibakereséshez, hogy
        // Vercel-en a szerver-logok megnyitása nélkül is látszódjon a tényleges ok.
        if (result?.details) console.error('[StepCarInfo] Gemini scan-vin hiba részletek:', result.details);
        const message =
          result?.error ?? (response.status === 413 ? AI_SCAN_TOO_LARGE_MESSAGE : AI_SCAN_FAILURE_MESSAGE);
        setVinScanToast({ variant: 'warning', message });
        return;
      }

      const { data } = result;
      const details = data.extractedDetails;
      const next: CarInfoState = { ...value };
      let filledCount = 0;
      const newlyTouched: Partial<Record<keyof CarInfoState, boolean>> = {};

      const cleanedVin = sanitizeVin(data.vin);
      if (cleanedVin) {
        next.vin = cleanedVin;
        newlyTouched.vin = true;
        filledCount += 1;
      }

      if (details?.plateNumber) {
        const cleanedPlate = sanitizeLicensePlate(details.plateNumber);
        if (cleanedPlate) {
          next.licensePlate = cleanedPlate;
          newlyTouched.licensePlate = true;
          filledCount += 1;
        }
      }

      if (details?.make) {
        const matchedBrand = matchCatalogBrand(details.make);
        next.carBrand = matchedBrand ?? details.make.trim();
        setIsCustomBrand(matchedBrand === null);
        newlyTouched.carBrand = true;
        filledCount += 1;
      }

      // A Típus mező MINDIG sima szabad szöveges mező (nincs katalógus-illesztés) -- a nyers
      // AI-szöveg közvetlenül ide kerül, ugyanúgy, mint ahogy a user is szabadon gépelhetné be.
      if (details?.model) {
        next.carModel = details.model.trim();
        newlyTouched.carModel = true;
        filledCount += 1;
      }

      if (details?.registrationYear) {
        const cleanedYear = sanitizeYear(details.registrationYear);
        if (cleanedYear) {
          next.year = cleanedYear;
          newlyTouched.year = true;
          filledCount += 1;
        }
      }

      onChange(next);
      setTouched((prev) => ({ ...prev, ...newlyTouched }));

      if (filledCount === 0) {
        setVinScanToast({
          variant: 'warning',
          message: 'Az AI nem talált felismerhető adatot a képen. Próbáld közelebbről, jobb megvilágításban lefotózni!',
        });
      } else if (data.confidence === 'low') {
        setVinScanToast({
          variant: 'warning',
          message: `Beolvasva (${filledCount} mező kitöltve), de kérlek ellenőrizd az alvázszámot -- a kép elmosódott lehet!`,
        });
      } else {
        setVinScanToast({
          variant: 'success',
          message: `Forgalmi/alvázszám sikeresen beolvasva AI-val: ${filledCount} mező kitöltve.`,
        });
      }
    } catch {
      setVinScanToast({ variant: 'warning', message: AI_SCAN_FAILURE_MESSAGE });
    } finally {
      setIsAiScanning(false);
    }
  }

  function handleNext() {
    if (Object.keys(errors).length === 0) {
      onNext();
    } else {
      setAttemptedNext(true);
    }
  }

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

      {/* Adatok beolvasása -- kiemelt kártya a lépés tetején, a mezők kitöltése ELŐTT,
          hogy a szaki egyetlen fotóval elindíthassa az auto-fill-t. A korábbi lila
          Sparkles ikon és "AI-alapú felismerés" felirat "generatív AI tech-demó" hatást
          keltett -- a "UI/UX finomhangolás, Copywriting tisztítás" lépés kérésére egy
          letisztult, ikon nélküli, profi SaaS-copy váltotta fel (a funkció maga --
          Gemini Vision -- változatlan, csak a megjelenés/szöveg egyszerűsödött). */}
      <div className="rounded-lg border border-linear-primary/30 bg-linear-surface-1 p-4">
        <div className="mb-3">
          <p className="text-[14px] font-semibold text-linear-ink">Adatok beolvasása</p>
          <p className="text-[12px] text-linear-ink-subtle">
            Készíts fotót a forgalmi engedélyről vagy az alvázszám-matricáról az adatok automatikus kitöltéséhez.
          </p>
        </div>

        <input
          ref={aiScanFileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleAiScanPhotoSelected}
        />
        <button
          type="button"
          onClick={handleAiScanClick}
          disabled={isAiScanning}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-linear-primary px-4 text-[13px] font-semibold text-white transition-colors hover:bg-linear-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isAiScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {isAiScanning ? 'AI elemzi a képet és az ISO 3779 szabványt…' : '📷 Forgalmi vagy Alvázszám beszkennelése (AI)'}
        </button>
        {isAiScanning && (
          <span className="mt-2 block text-[12px] text-linear-ink-subtle">Ez néhány másodpercig tarthat…</span>
        )}
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

        <TextField
          label="Típus"
          name="carModel"
          placeholder="pl. Octavia, Golf, Focus…"
          error={showError('carModel')}
          value={value.carModel}
          onChange={(e) => set('carModel', e.target.value)}
          onBlur={() => markTouched('carModel')}
        />

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
          value={formatKmInput(value.odometer)}
          onChange={(e) => set('odometer', sanitizeOdometer(e.target.value))}
          onBlur={() => markTouched('odometer')}
        />

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

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="licensePlate" className="text-[13px] font-medium text-linear-ink-muted">
              Rendszám
            </label>
          </div>
          {/* Rendszám felségjelzés dropdown (PROJEKT_INSTRUKCIOK.md, "Rendszám felségjelzés
              dropdown és profilhoz kötött alapértelmezés" lépés) -- egyetlen vizuális "Input
              Group"-ba csatolva a rendszám mező elé, közös kerettel. Az alapértelmezett érték
              a bejelentkezett user Settings oldalon beállított `default_license_country`
              metaadatából töltődik elő (`InspectionWizard.tsx` `defaultLicensePlateCountry`
              propja), piszkozat szerkesztésekor pedig az ADOTT vizsgálathoz korábban mentett
              kód érvényesül. */}
          <div
            className={cn(
              'flex h-11 w-full overflow-hidden rounded-md border bg-linear-surface-1 transition-colors',
              'focus-within:border-linear-primary focus-within:ring-2 focus-within:ring-linear-primary/30',
              showError('licensePlate') ? 'border-linear-danger' : 'border-linear-hairline'
            )}
          >
            <select
              aria-label="Rendszám felségjelzés"
              value={value.licensePlateCountry}
              onChange={(e) => set('licensePlateCountry', e.target.value)}
              className="shrink-0 border-r border-linear-hairline bg-linear-surface-2 px-2 font-mono text-[13px] font-semibold text-linear-ink focus:outline-none"
            >
              {LICENSE_PLATE_COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.code}
                </option>
              ))}
            </select>
            <input
              id="licensePlate"
              name="licensePlate"
              placeholder="pl. AABB123"
              required
              aria-invalid={!!showError('licensePlate')}
              className="min-w-0 flex-1 bg-transparent px-3 font-mono text-[14px] uppercase tracking-wider text-linear-ink placeholder:text-linear-ink-subtle focus:outline-none"
              value={value.licensePlate}
              onChange={(e) => set('licensePlate', sanitizeLicensePlate(e.target.value))}
              onBlur={() => markTouched('licensePlate')}
            />
          </div>
          {showError('licensePlate') && (
            <span role="alert" className="text-[12px] text-linear-danger">
              {showError('licensePlate')}
            </span>
          )}
        </div>
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

      <WizardStepFooter onNext={handleNext} nextLabel={nextLabel} />
    </div>
  );
}
