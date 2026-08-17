'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Sparkles, Trash2, X, ZoomIn } from 'lucide-react';
import { CAR_VIEW_IMAGE, DEFAULT_CAR_VIEW } from '@/lib/inspections/carViews';
import type { CarPointView } from '@/lib/inspections/carViews';
import { CarViewSwitcher } from '@/components/inspections/CarViewSwitcher';
import { CarViewImage } from '@/components/inspections/CarViewImage';
import { DAMAGE_TYPE_COLOR, DAMAGE_TYPE_LABEL, DAMAGE_TYPES } from '@/lib/inspections/constants';
import {
  DAMAGE_LOCATION_ZONE_LABEL,
  DAMAGE_LOCATION_ZONE_POINT,
  type DamageLocationZoneOrUnclear,
} from '@/lib/inspections/damageLocationZones';
import { DefectMediaUpload } from '@/components/inspections/wizard/DefectMediaUpload';
import { VoiceInputButton } from '@/components/ui/VoiceInputButton';
import { CarPointPin } from '@/components/inspections/CarPointPin';
import { iconHitSlopClass } from '@/components/ui/IconButton';
import { compressImageForAiScan } from '@/lib/inspections/aiImageCompression';
import { useInsufficientCredits } from '@/components/credits/InsufficientCreditsProvider';
import type { DamagePointState, DamageType } from '@/lib/inspections/types';

interface DamageCanvasProps {
  points: DamagePointState[];
  /** `edit`: kattintásra a képen BÁRHOL új sérülés-pontot vehet fel (Wizard), egy meglévő
   * markerre kattintva pedig szerkesztheti/törölheti azt -- UGYANAZ az interakciós minta,
   * mint a `PaintCanvas.tsx`-nél.
   * `view`: kizárólag olvasásra -- kattintásra a meglévő pont adatai (kategória, cím,
   * leírás, fotó) megtekinthetők, de nem hozható létre új pont és nem módosítható/törölhető
   * a meglévő (Publikus riport). */
  mode: 'edit' | 'view';
  /** KÖTELEZŐ `edit` módban -- minden pont-hozzáadás/-módosítás/-törlés után hívódik a
   * TELJES, frissített tömbbel. */
  onChange?: (points: DamagePointState[]) => void;
  /** `dark` = Linear design tokenek (Wizard), `light` = BMW design tokenek (Publikus riport). */
  theme: 'dark' | 'light';
  className?: string;
  /** `view` módban, ha a felhasználó a modalban a fotóra kattint -- a szülő ilyenkor tudja
   * megnyitni a `MediaLightbox`-ot (ugyanaz a minta, mint a `DefectsGallery.tsx`-nél).
   * `edit` módban nincs szükség rá, mert ott a `DefectMediaUpload` maga kezeli az előnézetet. */
  onOpenPhoto?: (url: string) => void;
  /** KIZÁRÓLAG `edit` módban releváns -- az "AI sérülés-felismerés fotóból" panel
   * (`/api/ai/scan-damage`) "1 AI kredit = 1 vizsgálat" hívásaihoz kell, lásd
   * `lib/inspectionAiCredit.ts`. Prop-ként kapja (NEM `useInspectionId()`-vel olvassa ki
   * közvetlenül), mert ez a komponens `view` módban a Wizardon KÍVÜL is renderelődik
   * (`InspectionDetailView.tsx`/`DamageMapCard.tsx` publikus riport) -- ott NINCS
   * `InspectionIdProvider`, egy feltétel nélküli `useInspectionId()` hívás ott hibát dobna. */
  inspectionId?: string;
}

/** A popoverben/modalban szerkesztés alatt álló pont -- `id: null` egy MÉG NEM mentett,
 * most kattintott új pontot jelöl (a `x`/`y` a kattintás helye, a többi mező üres/alapérték),
 * `id: string` egy MEGLÉVŐ, a `points` tömbben már szereplő pont szerkesztését/törlését
 * (VAGY `view` módban a puszta megtekintését). */
interface PendingDamage {
  id: string | null;
  x: number;
  y: number;
  /** Melyik autó-nézeten (elöl/bal oldal/hátul/jobb oldal/felül) ül a pont -- lásd
   * `lib/inspections/carViews.ts` fájl-JSDoc-ja. */
  view: CarPointView;
  type: DamageType;
  title: string;
  description: string;
  file: File | null;
  previewUrl: string | null;
  /** Igaz, ha ez a MÉG NEM mentett (`id: null`) pont egy elfogadott AI-javaslatból nyílt meg
   * -- kizárólag arra szolgál, hogy a szerkesztő-popover egy rövid "AI javaslata alapján"
   * emlékeztetőt mutasson MENTÉS ELŐTT (lásd lent a JSX-ben), a `DamagePointState`-be SOSE
   * kerül át (a `handleSave()` explicit felsorolja a mentendő mezőket, ez nincs köztük). */
  aiOrigin: boolean;
}

const ACCENT = { dark: '#5e6ad2', light: '#1c69d4' };

const AI_SCAN_FAILURE_MESSAGE = 'Az AI elemzés nem sikerült. Próbáld újra, vagy jelöld be kézzel.';

/** A `/api/ai/scan-damage` route válasz-alakja -- lásd `app/api/ai/scan-damage/route.ts`
 * (és `StepDefects.tsx` `ScanDefectApiResponse`-ját, ugyanaz a minta), csak a kliensnek
 * releváns mezők. */
interface ScanDamageApiResponse {
  success: boolean;
  data?: {
    damageDetected: boolean;
    confidence: 'high' | 'medium' | 'low';
    type?: DamageType;
    title?: string;
    description?: string;
    locationZone?: DamageLocationZoneOrUnclear;
  };
  error?: string;
  details?: string;
}

/**
 * Az "AI sérülés-felismerés fotóból" panel állapota -- KIZÁRÓLAG kliens-oldali, EFEMER
 * UI-állapot, SOSE kerül a `DamagePointState`-be/a mentett vizsgálati adatba, ugyanaz az elv,
 * mint a `StepDefects.tsx` `DefectAiState`-jénél: az AI javaslat sosem írhat közvetlenül
 * pontot, csak explicit "Elfogadom" kattintásra nyitja meg a MÁR MEGLÉVŐ szerkesztő-popovert
 * (`pending`), amit a felhasználónak MÉG "Mentés"-sel is jóvá kell hagynia -- lásd a
 * `handleAcceptAiSuggestion()` JSDoc-ját.
 */
type DamageAiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'suggested';
      confidence: 'high' | 'medium' | 'low';
      type: DamageType;
      title: string;
      description: string;
      locationZone: DamageLocationZoneOrUnclear;
    }
  | { status: 'not_detected' }
  | { status: 'error'; message: string };

const IDLE_AI_STATE: DamageAiState = { status: 'idle' };

/** Egy elfogadott AI-javaslat adatai, amikor a `locationZone` `'unclear'` volt -- ilyenkor
 * NINCS koordináta, amit a szerkesztő-popover megnyitásához fel lehetne használni, ezért a
 * felhasználónak MÉG rá kell kattintania a képre; a KÖVETKEZŐ kattintás ebből a piszkozatból
 * tölti ki az új pontot (lásd `handleContainerClick()`), a hardkódolt "karcolás" alapérték
 * helyett. */
interface PendingAiDraft {
  type: DamageType;
  title: string;
  description: string;
  file: File | null;
  previewUrl: string | null;
}

/**
 * Sérülés- és Hibatérkép "Szabadkézi" (Free-form Canvas) komponens -- NINCS előre
 * definiált elem/hotspot az autó-referenciaképeken, a felhasználó a kép TETSZŐLEGES
 * pontjára kattinthat, de itt minden ponthoz egy kategória (karcolás/horpadás/rozsda/
 * kavicsfelverődés/repedés/egyéb) tartozik, plusz egy opcionális leírás és egy opcionális
 * fotó.
 *
 * **Nézetenkénti referenciaképek (2026-08-17, "RENDSZER-CSERE, 2. NEKIFUTÁS"):** a korábbi,
 * mind az 5 nézetet egy apró kompozit képbe zsúfoló `cars.webp` helyett MOSTANTÓL egy
 * `CarViewSwitcher` fülváltóval öt KÜLÖN, nagyban megjelenő kép közül lehet választani
 * (elöl/bal oldal/hátul/jobb oldal/felül -- lásd `lib/inspections/carViews.ts` fájl-JSDoc-ja
 * a teljes indoklásért/előzményért). A `points` tömb MINDEN eleme egy `view` mezővel jelzi,
 * MELYIK fülhöz tartozik -- a komponens csak az AKTÍV fülhöz tartozó pontokat jeleníti meg
 * (`visiblePoints`), az ÚJ pont pedig mindig az ÉPPEN AKTÍV fül `view` értékét kapja. Egy
 * RÉGI, e rendszer előtti pont (nincs `view` mezője) a `DEFAULT_CAR_VIEW` ("Elöl") fül alatt
 * jelenik meg -- az adatai nem vesznek el, csak a pontos pozíciója már csak hozzávetőleges.
 *
 * **Cím mező (2026-08-04, "vegyük ki a cím megadását" UX-egyszerűsítés):** a `title` mező
 * MOSTANTÓL NEM önálló, mindig kitöltendő szövegmező -- az 5 fix kategóriánál (karcolás/
 * horpadás/rozsda/kavicsfelverődés/repedés) a kategória-választás automatikusan kitölti
 * `title`-t a kategória feliratával (`DAMAGE_TYPE_LABEL[type]`), a mező NEM jelenik meg a
 * formban. KIZÁRÓLAG "Egyéb" kategóriánál jelenik meg egy szabad szöveges input, mert ott
 * a kategória önmagában nem elég leíró -- ilyenkor a "Mentés" is csak akkor engedélyezett,
 * ha ezt kitöltötte a felhasználó. A `DamagePointState.title` mező TÍPUSA/DB-oszlopa
 * változatlan (mindig van érvényes, nem üres szöveg benne), csak a KITÖLTÉS módja változott.
 *
 * SZÁNDÉKOS ELTÉRÉS a `PaintCanvas`-tól: ott egy apró, a kattintott ponthoz horgonyzott
 * (`position: absolute`, % koordinátás) popover elég volt egyetlen szám mezőhöz -- itt a
 * jóval gazdagabb tartalom (select + 2 szövegmező + fotó-feltöltő + gombok) miatt egy
 * KÖZÉPRE IGAZÍTOTT, `fixed` pozíciójú modal (a `MediaLightbox.tsx`-hez hasonló minta)
 * a robusztusabb megoldás -- egy kis, a kattintás helyéhez horgonyzott popover a kép
 * SZÉLÉN/ALJÁN, KIFEJEZETTEN mobilon (a projekt mobil-first célközönsége, garázsban,
 * telefonon dolgozó szakemberek) könnyen kilógna/levágódna ennyi tartalommal.
 *
 * **"AI sérülés-felismerés fotóból" panel (2026-08-16, `mode="edit"`-ben, a felhasználó
 * explicit kérésére -- "ugyanaz a rendszer, mint a Hibák és Média AI-elemzése, DE jelölje is
 * be, hogy nagyjából hol lehet a sérülés"):** a kép FÖLÖTT megjelenő, önálló panel, ami
 * FÜGGETLEN a kattintásos pont-felvételtől -- a felhasználó fotót tölt fel (`aiPhoto`), az
 * "AI elemzés" gomb meghívja a `/api/ai/scan-damage` route-ot (`handleAiAnalyze()`), ami a
 * `scan-defect`-hez hasonlóan kategóriát (`type`)+leírást ad, PLUSZ egy zárt zóna-katalógusból
 * (`lib/inspections/damageLocationZones.ts`) egy hely-becslést (`locationZone`). Az eredmény
 * SOSE ír közvetlenül a `points` tömbbe -- egy elkülönült "AI javaslat" kártyaként jelenik
 * meg (`aiState.status === 'suggested'`), KÜLÖN "Elfogadom"/"Elvetem" gombbal, UGYANAZ az elv,
 * mint a `StepDefects.tsx`-nél (lásd `PLAN_ai_scan_defect.md` 3.5 pontját).
 *
 * "Elfogadom" (`handleAcceptAiSuggestion()`) NEM hoz létre azonnal pontot -- a MÁR MEGLÉVŐ
 * `pending` szerkesztő-popovert nyitja meg, előre kitöltve (`aiOrigin: true`), a
 * `DAMAGE_LOCATION_ZONE_POINT` táblából determinisztikusan számolt koordinátán -- a
 * felhasználónak MÉG "Mentés"-t kell kattintania, hogy a pont ténylegesen létrejöjjön (KÉT
 * FÜGGETLEN emberi jóváhagyás egy AI-eredetű pontnál: "Elfogadom" az AI-tartalomra, "Mentés" a
 * konkrét pontra -- ugyanaz a popover/Mentés-kényszer, mint egy kézzel felvett pontnál, csak
 * előre kitöltve). Ha a `locationZone` `'unclear'` (a modell nem tudta megállapítani a helyet
 * a fotóból), NINCS koordináta, amit fel lehetne használni -- ilyenkor a javaslat egy
 * `pendingAiDraft`-ba kerül, és a felhasználót egy felirat kéri, hogy kattintson a képre; a
 * KÖVETKEZŐ `handleContainerClick()` ebből tölti ki az új pontot a hardkódolt "karcolás"
 * alapérték helyett.
 */
export function DamageCanvas({ points, mode, onChange, theme, className, onOpenPhoto, inspectionId }: DamageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingDamage | null>(null);
  const [view, setView] = useState<CarPointView>(DEFAULT_CAR_VIEW);
  const accent = ACCENT[theme];

  // Nézetenkénti pontszám a `CarViewSwitcher` jelvényeihez -- egy RÉGI, `view` mező nélküli
  // pont a `DEFAULT_CAR_VIEW` alá számolódik, lásd a komponens-JSDoc "Nézetenkénti
  // referenciaképek" szakaszát.
  const viewCounts = useMemo(() => {
    const counts: Partial<Record<CarPointView, number>> = {};
    for (const point of points) {
      const pointView = point.view ?? DEFAULT_CAR_VIEW;
      counts[pointView] = (counts[pointView] ?? 0) + 1;
    }
    return counts;
  }, [points]);

  // Csak az AKTÍV fülhöz tartozó pontok jelennek meg a képen -- lásd ugyanott.
  const visiblePoints = useMemo(() => points.filter((point) => (point.view ?? DEFAULT_CAR_VIEW) === view), [points, view]);

  // AI sérülés-felismerés fotóból (`/api/ai/scan-damage`) -- lásd a fenti komponens-JSDoc
  // "AI sérülés-felismerés fotóból panel" szakaszát. KIZÁRÓLAG `mode === 'edit'`-ben
  // rendereljük/használjuk, de a hook-ok feltétel nélküli hívása biztonságos: az
  // `useInsufficientCredits()` Providere a gyökér layoutban MINDEN oldalt körbevesz.
  const [aiPhoto, setAiPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [aiState, setAiState] = useState<DamageAiState>(IDLE_AI_STATE);
  const [pendingAiDraft, setPendingAiDraft] = useState<PendingAiDraft | null>(null);
  const { notifyInsufficientCredits } = useInsufficientCredits();
  const isAiPhotoVideo = aiPhoto ? aiPhoto.file.type.startsWith('video/') : false;

  function closePending() {
    setPending(null);
  }

  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== 'edit') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const rawX = ((e.clientX - rect.left) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;
    const x = Math.min(100, Math.max(0, rawX));
    const y = Math.min(100, Math.max(0, rawY));

    // Ha van egy "helyre váró" AI-piszkozat (lásd `handleAcceptAiSuggestion()` `'unclear'`
    // ága), EZ a kattintás tölti ki az új pontot -- a hardkódolt "karcolás" alapérték helyett.
    // Az AKTÍV fület használjuk `view`-nek, mert az "unclear" ágnál nincs AI-becsült nézet --
    // a felhasználó pont azért kattint, mert MAGA választotta ki a megfelelő fület előtte.
    if (pendingAiDraft) {
      setPending({ id: null, x, y, view, ...pendingAiDraft, aiOrigin: true });
      setPendingAiDraft(null);
      return;
    }

    setPending({
      id: null,
      x,
      y,
      view,
      type: 'scratch',
      title: DAMAGE_TYPE_LABEL.scratch,
      description: '',
      file: null,
      previewUrl: null,
      aiOrigin: false,
    });
  }

  /** Kategória-váltáskor: a fix kategóriáknál a `title` automatikusan a kategória
   * feliratára áll (a mező ekkor nem is jelenik meg a formban), "Egyéb"-re váltva pedig
   * kiürül, hogy a felhasználó a megjelenő input mezőbe beírhassa, mi is a hiba pontosan. */
  function handleTypeChange(newType: DamageType) {
    if (!pending) return;
    setPending({ ...pending, type: newType, title: newType === 'other' ? '' : DAMAGE_TYPE_LABEL[newType] });
  }

  function handleMarkerClick(e: React.MouseEvent, point: DamagePointState) {
    e.stopPropagation();
    setPending({
      id: point.id,
      x: point.x,
      y: point.y,
      view: point.view ?? DEFAULT_CAR_VIEW,
      type: point.type,
      title: point.title,
      description: point.description,
      file: point.file,
      previewUrl: point.previewUrl,
      aiOrigin: false,
    });
  }

  function handleAiPhotoSelect(file: File) {
    if (aiPhoto?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(aiPhoto.previewUrl);
    setAiPhoto({ file, previewUrl: URL.createObjectURL(file) });
    // Új fotó kiválasztásakor egy korábbi javaslat ELÉVÜL -- ne maradjon a képernyőn egy már
    // nem releváns javaslat, ugyanaz az elv, mint a `StepDefects.tsx` `handleSelectFile()`-jénél.
    setAiState(IDLE_AI_STATE);
  }

  function handleAiPhotoRemove() {
    if (aiPhoto?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(aiPhoto.previewUrl);
    setAiPhoto(null);
    setAiState(IDLE_AI_STATE);
  }

  /** "AI elemzés" gomb -- lásd `PLAN_ai_scan_defect.md` 3.6 pontját: KIZÁRÓLAG explicit
   * felhasználói kérésre fut le, sosem automatikus a fotó kiválasztásakor. */
  async function handleAiAnalyze() {
    if (!aiPhoto || !inspectionId) return;

    setAiState({ status: 'loading' });
    try {
      const imageDataUrl = await compressImageForAiScan(aiPhoto.file);

      const response = await fetch('/api/ai/scan-damage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageDataUrl, inspectionId }),
      });

      // 402 (INSUFFICIENT_AI_QUOTA) -- lásd `InsufficientCreditsProvider.tsx`/`StepDefects.tsx`
      // azonos elvű kezelését.
      if (response.status === 402) {
        notifyInsufficientCredits();
        setAiState(IDLE_AI_STATE);
        return;
      }

      let result: ScanDamageApiResponse | null = null;
      try {
        result = (await response.json()) as ScanDamageApiResponse;
      } catch (parseError) {
        console.error('[DamageCanvas] A /api/ai/scan-damage válasza nem érvényes JSON (státusz:', response.status, '):', parseError);
      }

      if (!response.ok || !result?.success || !result?.data) {
        if (result?.details) console.error('[DamageCanvas] Gemini scan-damage hiba részletek:', result.details);
        setAiState({ status: 'error', message: result?.error ?? AI_SCAN_FAILURE_MESSAGE });
        return;
      }

      const { data } = result;
      if (!data.damageDetected || !data.type || !data.title || !data.description) {
        // A szerver `sanitizeScanDamageResponse()`-ja `type`/`title`/`description`-t
        // KIZÁRÓLAG `damageDetected: true` esetén ad vissza -- ha bármelyik hiányzik, a
        // BIZTONSÁGOS "nem talált sérülést" ágra esünk, semmit nem javaslunk.
        setAiState({ status: 'not_detected' });
        return;
      }

      setAiState({
        status: 'suggested',
        confidence: data.confidence,
        type: data.type,
        title: data.title,
        description: data.description,
        locationZone: data.locationZone ?? 'unclear',
      });
    } catch {
      setAiState({ status: 'error', message: AI_SCAN_FAILURE_MESSAGE });
    }
  }

  /** "Elfogadom" -- lásd a komponens-JSDoc "AI sérülés-felismerés fotóból panel" szakaszát:
   * SOSE hoz létre közvetlenül pontot, csak a MÁR MEGLÉVŐ szerkesztő-popovert nyitja meg
   * előre kitöltve (ismert hely esetén), vagy a KÖVETKEZŐ kattintáshoz készít elő egy
   * piszkozatot (`'unclear'` hely esetén) -- mindkét esetben "Mentés" kell a tényleges
   * ponthoz, lásd `PLAN_ai_scan_defect.md` 3.5 pontját. Ismert hely esetén a `zonePoint.view`
   * a MEGFELELŐ fülre is átvált (`setView`), hogy a felhasználó rögtön lássa, hova került az
   * előre kitöltött jelölő -- lásd `lib/inspections/damageLocationZones.ts`. */
  function handleAcceptAiSuggestion() {
    if (aiState.status !== 'suggested' || !aiPhoto) return;
    const { type, title, description, locationZone } = aiState;
    const { file, previewUrl } = aiPhoto;

    if (locationZone !== 'unclear') {
      const zonePoint = DAMAGE_LOCATION_ZONE_POINT[locationZone];
      setView(zonePoint.view);
      setPending({
        id: null,
        x: zonePoint.x,
        y: zonePoint.y,
        view: zonePoint.view,
        type,
        title,
        description,
        file,
        previewUrl,
        aiOrigin: true,
      });
    } else {
      setPendingAiDraft({ type, title, description, file, previewUrl });
    }

    // A fotó "tulajdonjoga" átkerült a `pending`/`pendingAiDraft`-ba -- itt NEM szabad
    // felszabadítani (`URL.revokeObjectURL`) az object URL-t, azt onnantól a popover Mentés/
    // Mégse ágai (ill. a következő kattintás) kezelik, ugyanúgy, mint egy kézzel csatolt fotónál.
    setAiPhoto(null);
    setAiState(IDLE_AI_STATE);
  }

  /** "Elvetem" -- az AI javaslat (és a hozzá feltöltött fotó) teljesen eldobásra kerül,
   * SEMMILYEN mező/jelölő nem jön létre belőle. */
  function handleRejectAiSuggestion() {
    if (aiPhoto?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(aiPhoto.previewUrl);
    setAiPhoto(null);
    setAiState(IDLE_AI_STATE);
  }

  /** A "kattints a képre, ahol a sérülés van" felirat "Mégse" gombja -- lásd a
   * `pendingAiDraft` JSDoc-ját. */
  function handleCancelAiDraft() {
    if (pendingAiDraft?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(pendingAiDraft.previewUrl);
    setPendingAiDraft(null);
  }

  function handleSave() {
    if (!pending || !onChange) return;
    if (pending.type === 'other' && pending.title.trim() === '') return;
    if (pending.id) {
      onChange(
        points.map((p) =>
          p.id === pending.id
            ? {
                ...p,
                type: pending.type,
                title: pending.title,
                description: pending.description,
                file: pending.file,
                previewUrl: pending.previewUrl,
              }
            : p
        )
      );
    } else {
      onChange([
        ...points,
        {
          id: crypto.randomUUID(),
          x: pending.x,
          y: pending.y,
          view: pending.view,
          type: pending.type,
          title: pending.title,
          description: pending.description,
          file: pending.file,
          previewUrl: pending.previewUrl,
        },
      ]);
    }
    closePending();
  }

  function handleDelete() {
    if (!pending?.id || !onChange) return;
    const target = points.find((p) => p.id === pending.id);
    if (target?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
    onChange(points.filter((p) => p.id !== pending.id));
    closePending();
  }

  function handleSelectPhoto(file: File) {
    if (!pending) return;
    setPending({ ...pending, file, previewUrl: URL.createObjectURL(file) });
  }

  function handleRemovePhoto() {
    if (!pending) return;
    if (pending.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(pending.previewUrl);
    setPending({ ...pending, file: null, previewUrl: null });
  }

  const panelClass =
    theme === 'dark' ? 'border-linear-hairline-strong bg-linear-surface-2' : 'border-bmw-hairline-strong bg-white';
  const headingClass = theme === 'dark' ? 'text-[14px] font-semibold text-linear-ink' : 'text-[14px] font-bold text-bmw-ink';
  // Érintési célterület: a vizuális gomb 28px marad, a hit-slop pszeudo-elem 44x44px-re
  // bővíti a kattintható/koppintható zónát -- lásd docs/ux-touch-targets-plan-2026-08-14.md D) pont.
  const closeButtonClass =
    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ' +
    iconHitSlopClass(28) +
    ' ' +
    (theme === 'dark'
      ? 'text-linear-ink-subtle hover:bg-linear-surface-3 hover:text-linear-ink'
      : 'text-bmw-muted hover:bg-bmw-surface-soft hover:text-bmw-ink');
  const fieldLabelClass = theme === 'dark' ? 'text-[12px] font-medium text-linear-ink-muted' : 'text-[12px] font-medium text-bmw-muted';
  const fieldClass =
    theme === 'dark'
      ? 'h-9 w-full rounded-md border border-linear-hairline bg-linear-surface-1 px-2.5 text-[13px] text-linear-ink placeholder:text-linear-ink-subtle transition-colors focus:border-linear-primary focus:outline-none focus:ring-2 focus:ring-linear-primary/30'
      : 'h-9 w-full rounded-md border border-bmw-hairline bg-white px-2.5 text-[13px] text-bmw-ink placeholder:text-bmw-muted-soft transition-colors focus:border-bmw-primary focus:outline-none focus:ring-2 focus:ring-bmw-primary/30';

  return (
    <div className={className}>
      {/* "AI sérülés-felismerés fotóból" panel -- lásd a komponens-JSDoc-ot. Szándékosan
          KIZÁRÓLAG `mode === 'edit'`-ben renderelt, Linear (dark) tokenekkel hardkódolva --
          `edit` mód a `cars.webp` referenciaképpel EGYETLEN hívóhelyről (`StepDamageMap.tsx`)
          fut, MINDIG `theme="dark"`-kal, ugyanúgy, ahogy a `StepDefects.tsx` "AI elemzés"
          gombja is kizárólag a Linear Wizardban él, nincs BMW/light megfelelője. */}
      {mode === 'edit' && (
        <div className="mb-4 rounded-lg border border-linear-hairline-strong bg-linear-surface-2 p-3.5">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-linear-primary">
            <Sparkles className="h-4 w-4" />
            AI sérülés-felismerés fotóból
          </div>
          <p className="mt-1 text-[12px] text-linear-ink-subtle">
            Tölts fel egy fotót a sérülésről -- az AI javaslatot ad a kategóriára és a leírásra,
            ÉS megbecsüli, hogy a képen látható tájékozódási pontok alapján nagyjából hol lehet a
            karosszérián. A helyet és a leírást is mindig ellenőrizd, mielőtt elfogadod és mented.
          </p>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
            <DefectMediaUpload
              file={aiPhoto?.file ?? null}
              previewUrl={aiPhoto?.previewUrl ?? null}
              onSelect={handleAiPhotoSelect}
              onRemove={handleAiPhotoRemove}
            />

            <div className="flex flex-1 flex-col gap-2">
              {aiPhoto && isAiPhotoVideo && (
                <p className="text-[12px] text-linear-warning">
                  Videóból nem kérhető AI elemzés -- tölts fel állóképet.
                </p>
              )}

              {aiPhoto && !isAiPhotoVideo && aiState.status === 'idle' && (
                <button
                  type="button"
                  onClick={handleAiAnalyze}
                  disabled={!inspectionId}
                  className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-linear-primary/40 bg-linear-primary/10 px-3 text-[12.5px] font-medium text-linear-primary transition-colors hover:bg-linear-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  AI elemzés
                </button>
              )}

              {aiState.status === 'loading' && (
                <div className="flex items-center gap-1.5 text-[12px] text-linear-ink-subtle">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  AI elemzi a fotót…
                </div>
              )}

              {aiState.status === 'not_detected' && (
                <p className="text-[12px] text-linear-ink-subtle">
                  Az AI nem ismert fel egyértelmű sérülést ezen a képen -- jelöld be kézzel a
                  képre kattintva.
                </p>
              )}

              {aiState.status === 'error' && (
                <div>
                  <p className="text-[12px] text-linear-danger">{aiState.message}</p>
                  <button
                    type="button"
                    onClick={handleAiAnalyze}
                    className="mt-1 text-[12px] font-medium text-linear-primary hover:underline"
                  >
                    Újra próbálom
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* "AI javaslat" kártya -- SZÁNDÉKOSAN elkülönítve, KÜLÖN "Elfogadom"/"Elvetem"
              gombbal, lásd a komponens-JSDoc-ot és `PLAN_ai_scan_defect.md` 3.5/3.7 pontját. */}
          {aiState.status === 'suggested' && (
            <div className="mt-3 rounded-md border border-dashed border-linear-primary/50 bg-linear-primary/5 p-3.5">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.4px] text-linear-primary">
                <Sparkles className="h-3.5 w-3.5" />
                AI javaslat
              </div>
              <p className="mt-2 text-[13.5px] text-linear-ink">
                <span className="font-semibold">{aiState.title}</span> -- {aiState.description}
              </p>
              <p className="mt-1.5 text-[12.5px] text-linear-ink-subtle">
                Becsült hely:{' '}
                <span className="font-medium text-linear-ink">
                  {aiState.locationZone !== 'unclear'
                    ? DAMAGE_LOCATION_ZONE_LABEL[aiState.locationZone]
                    : 'nem egyértelmű -- elfogadás után kattints a képre, ahol a sérülés van'}
                </span>
              </p>
              {aiState.confidence === 'low' && (
                <p className="mt-2 flex items-start gap-1.5 text-[12px] text-linear-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Az AI bizonytalan ebben a javaslatban -- ellenőrizd különösen alaposan.
                </p>
              )}
              <p className="mt-2 text-[11.5px] text-linear-ink-subtle">
                Az AI-javaslat -- a kategória, a leírás ÉS a hely is -- tájékoztató jellegű, a
                képen látottak alapján -- mindig ellenőrizd, mielőtt elfogadod és mented.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleAcceptAiSuggestion}
                  className="inline-flex h-8 items-center rounded-md bg-linear-primary px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-linear-primary-hover"
                >
                  Elfogadom
                </button>
                <button
                  type="button"
                  onClick={handleRejectAiSuggestion}
                  className="inline-flex h-8 items-center rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-3 text-[12.5px] font-medium text-linear-ink-muted transition-colors hover:bg-linear-surface-3"
                >
                  Elvetem
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* "Kattints a képre, ahol a sérülés van" felirat -- KIZÁRÓLAG akkor jelenik meg, ha egy
          elfogadott AI-javaslat helye `'unclear'` volt, lásd `pendingAiDraft`/
          `handleContainerClick()` JSDoc-ját. */}
      {pendingAiDraft && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-dashed border-linear-primary/50 bg-linear-primary/5 px-3 py-2 text-[12.5px] text-linear-ink">
          <span>Kattints a képre, ahol a sérülés van -- az AI-javaslat adatai automatikusan kitöltődnek.</span>
          <button
            type="button"
            onClick={handleCancelAiDraft}
            className="shrink-0 font-medium text-linear-ink-subtle hover:text-linear-ink"
          >
            Mégse
          </button>
        </div>
      )}

      {/* Nézetváltó fülek -- lásd a komponens-JSDoc "Nézetenkénti referenciaképek" szakaszát.
          A `counts` jelvény megmutatja, melyik fülön van már rögzített pont, anélkül, hogy oda
          kellene váltani. Nézetet `view`/`edit` módban EGYARÁNT lehet váltani. */}
      <div className="mx-auto mb-3 w-full max-w-[560px]">
        <CarViewSwitcher view={view} onChange={setView} theme={theme} counts={viewCounts} />
      </div>

      <div
        ref={containerRef}
        onClick={handleContainerClick}
        role={mode === 'edit' ? 'button' : undefined}
        aria-label={mode === 'edit' ? 'Kattints a képre egy sérülés-/hiba pont felvételéhez' : undefined}
        className={
          'relative mx-auto w-full max-w-[560px] overflow-visible rounded-lg ' +
          (theme === 'dark' ? 'bg-linear-surface-2' : 'bg-white') +
          ' ' +
          (mode === 'edit' ? 'cursor-crosshair' : '')
        }
        style={{ aspectRatio: `${CAR_VIEW_IMAGE[view].width} / ${CAR_VIEW_IMAGE[view].height}` }}
      >
        <CarViewImage view={view} />

        {visiblePoints.map((point) => {
          const isSelected = pending?.id === point.id;
          return (
            <CarPointPin
              key={point.id}
              x={point.x}
              y={point.y}
              color={DAMAGE_TYPE_COLOR[point.type]}
              selected={isSelected}
              accentColor={accent}
              onClick={(e) => handleMarkerClick(e, point)}
              ariaLabel={`${DAMAGE_TYPE_LABEL[point.type]}: ${point.title}`}
            />
          );
        })}

        {pending && pending.id === null && (
          <span
            style={{ left: `${pending.x}%`, top: `${pending.y}%`, borderColor: accent }}
            className="absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-dashed"
          />
        )}
      </div>

      {pending && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={closePending}
          onKeyDown={(e) => e.key === 'Escape' && closePending()}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={'w-full max-w-sm rounded-lg border p-4 shadow-xl sm:p-5 ' + panelClass}
          >
            <div className="flex items-center justify-between gap-2">
              <p className={headingClass}>
                {mode === 'edit' ? (pending.id ? 'Sérülés/hiba szerkesztése' : 'Új sérülés/hiba') : 'Sérülés/hiba'}
              </p>
              <button type="button" onClick={closePending} aria-label="Bezárás" className={closeButtonClass}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {mode === 'edit' ? (
              <div className="mt-3 flex flex-col gap-3">
                {/* AI-eredetű, MÉG NEM mentett pontnál egy rövid emlékeztető MENTÉS ELŐTT --
                    lásd `PendingDamage.aiOrigin` JSDoc-ját. */}
                {pending.aiOrigin && (
                  <p className="flex items-start gap-1.5 rounded-md border border-dashed border-linear-primary/40 bg-linear-primary/5 px-2.5 py-1.5 text-[11.5px] text-linear-ink-subtle">
                    <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-linear-primary" />
                    Az AI javaslata alapján előre kitöltve -- ellenőrizd, majd mentsd, vagy
                    módosítsd a mezőket.
                  </p>
                )}
                <div className="flex flex-col gap-1.5">
                  <span className={fieldLabelClass}>Kategória</span>
                  <select
                    value={pending.type}
                    onChange={(e) => handleTypeChange(e.target.value as DamageType)}
                    className={fieldClass + ' appearance-none'}
                  >
                    {DAMAGE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {DAMAGE_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Csak "Egyéb" kategóriánál jelenik meg -- a fix kategóriáknál a `title`
                    automatikusan a kategória feliratára áll (lásd `handleTypeChange`), itt
                    nincs rá szükség, feleslegesen duplikálná a select tartalmát. */}
                {pending.type === 'other' && (
                  <div className="flex flex-col gap-1.5">
                    <span className={fieldLabelClass}>Mi a hiba pontosan?</span>
                    <input
                      type="text"
                      autoFocus
                      placeholder="pl. Törött hátsó lámpabúra"
                      value={pending.title}
                      onChange={(e) => setPending({ ...pending, title: e.target.value })}
                      className={fieldClass}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <span className={fieldLabelClass}>Leírás (opcionális)</span>
                  <div className="relative">
                    <textarea
                      placeholder="Rövid megjegyzés a sérülésről…"
                      value={pending.description}
                      onChange={(e) => setPending({ ...pending, description: e.target.value })}
                      rows={2}
                      className={
                        theme === 'dark'
                          ? 'w-full resize-none rounded-md border border-linear-hairline bg-linear-surface-1 px-2.5 py-2 pr-9 text-[13px] text-linear-ink placeholder:text-linear-ink-subtle transition-colors focus:border-linear-primary focus:outline-none focus:ring-2 focus:ring-linear-primary/30'
                          : 'w-full resize-none rounded-md border border-bmw-hairline bg-white px-2.5 py-2 pr-9 text-[13px] text-bmw-ink placeholder:text-bmw-muted-soft transition-colors focus:border-bmw-primary focus:outline-none focus:ring-2 focus:ring-bmw-primary/30'
                      }
                    />
                    <VoiceInputButton
                      value={pending.description}
                      onChange={(next) => setPending({ ...pending, description: next })}
                      className="absolute right-1.5 top-1.5"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className={fieldLabelClass}>Fotó (opcionális)</span>
                  <DefectMediaUpload
                    file={pending.file}
                    previewUrl={pending.previewUrl}
                    onSelect={handleSelectPhoto}
                    onRemove={handleRemovePhoto}
                  />
                </div>

                <div className="mt-1 flex gap-2">
                  {pending.id && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-linear-danger/40 text-[13px] font-medium text-linear-danger transition-colors hover:bg-linear-danger-soft"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Törlés
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={pending.type === 'other' && pending.title.trim() === ''}
                    className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-linear-primary text-[13px] font-medium text-white transition-colors hover:bg-linear-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Mentés
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <span
                  className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
                  style={{ backgroundColor: `${DAMAGE_TYPE_COLOR[pending.type]}22`, color: DAMAGE_TYPE_COLOR[pending.type] }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DAMAGE_TYPE_COLOR[pending.type] }} />
                  {DAMAGE_TYPE_LABEL[pending.type]}
                </span>
                {/* A kategória-jelvény felett csak akkor jelenik meg külön cím, ha az
                    valóban EGYEDI szöveg ("Egyéb" kategóriánál a felhasználó által beírt
                    megnevezés) -- a fix kategóriáknál a `title` megegyezik a jelvény
                    feliratával, azt fölöslegesen duplikálná. */}
                {pending.title !== DAMAGE_TYPE_LABEL[pending.type] && (
                  <p className={theme === 'dark' ? 'text-[14px] font-semibold text-linear-ink' : 'text-[14px] font-bold text-bmw-ink'}>
                    {pending.title}
                  </p>
                )}
                {pending.description && (
                  <p className={theme === 'dark' ? 'text-[13px] text-linear-ink-subtle' : 'text-[13px] font-light text-bmw-muted'}>
                    {pending.description}
                  </p>
                )}
                {pending.previewUrl && (
                  <button
                    type="button"
                    onClick={() => onOpenPhoto?.(pending.previewUrl!)}
                    className="group relative aspect-video w-full overflow-hidden rounded-md border border-black/10"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pending.previewUrl} alt={pending.title} className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
                      <ZoomIn className="h-6 w-6" />
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Jelmagyarázat -- mindig látszik, hogy a marker-színek jelentése edit ÉS view
          módban egyaránt egyértelmű legyen. */}
      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2">
        {DAMAGE_TYPES.map((type) => (
          <span
            key={type}
            className={
              'flex items-center gap-2 text-[12px] ' +
              (theme === 'dark' ? 'font-medium text-linear-ink-subtle' : 'font-light text-bmw-muted')
            }
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DAMAGE_TYPE_COLOR[type] }} />
            {DAMAGE_TYPE_LABEL[type]}
          </span>
        ))}
      </div>
    </div>
  );
}
