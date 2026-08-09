'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Loader2,
  MinusCircle,
  Search,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { TextareaField } from '@/components/inspections/wizard/FormControls';
import { VinScanToast, type VinScanToastVariant } from '@/components/inspections/wizard/VinScanToast';
import { WizardStepFooter } from '@/components/inspections/wizard/WizardBottomBar';
import { useInsufficientCredits } from '@/components/credits/InsufficientCreditsProvider';
import { useInspectionId } from '@/components/inspections/wizard/InspectionIdContext';
import { joinDictatedText } from '@/lib/utils';
import {
  EQUIPMENT_CATEGORY_LABEL,
  EQUIPMENT_CATEGORY_ORDER,
  EQUIPMENT_ITEMS,
  EQUIPMENT_NAME_TO_CATEGORY,
  EQUIPMENT_PRESET_BASIC,
  EQUIPMENT_PRESET_COMFORT_EXTRA,
  FEATURE_STATUS_LABEL,
} from '@/lib/inspections/constants';
import type { EquipmentCategory, FeatureFormState, FeatureStatus } from '@/lib/inspections/types';

interface StepEquipmentProps {
  value: FeatureFormState[];
  onChange: (value: FeatureFormState[]) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
}

const STATUS_OPTIONS: { status: FeatureStatus; icon: LucideIcon; activeClass: string }[] = [
  { status: 'working', icon: CheckCircle2, activeClass: 'border-linear-success bg-linear-success-soft text-linear-success' },
  { status: 'defective', icon: XCircle, activeClass: 'border-linear-danger bg-linear-danger-soft text-linear-danger' },
  {
    status: 'not_present',
    icon: MinusCircle,
    activeClass: 'border-linear-hairline-strong bg-linear-surface-3 text-linear-ink-muted',
  },
];

/** Statikus (a modul betöltésekor egyszer számolt) `Set`-ek a preset-gombokhoz -- a
 * `EQUIPMENT_PRESET_BASIC`/`EQUIPMENT_PRESET_COMFORT_EXTRA` importált tömbök nem
 * változnak renderelés közben, ezért NEM `useMemo`-ban, hanem modul-szinten élnek. */
const BASIC_PRESET_IDS = new Set(EQUIPMENT_PRESET_BASIC);
const COMFORT_PRESET_IDS = new Set([...EQUIPMENT_PRESET_BASIC, ...EQUIPMENT_PRESET_COMFORT_EXTRA]);

type PresetKey = 'basic' | 'comfort' | 'full' | 'reset';

const PRESET_BUTTONS: { key: PresetKey; label: string }[] = [
  { key: 'basic', label: '🥉 Alap' },
  { key: 'comfort', label: '🥈 Átlagos / Komfort' },
  { key: 'full', label: '🥇 Full Extra' },
  { key: 'reset', label: '🔄 Visszaállítás (Minden üres)' },
];

/** A Gemini AI parse-equipment route válasz-alakja (`app/api/ai/parse-equipment/route.ts`)
 * -- csak a kliens-oldalon ténylegesen felhasznált mezőket modellezi. */
interface ParseEquipmentApiResponse {
  success: boolean;
  updates?: { id: string; status: FeatureStatus; notes?: string }[];
  error?: string;
  /** Hibakeresési célú nyers hibaüzenet (lásd `route.ts` `toErrorDetails()`) -- ha jelen
   * van, a toast-üzenethez fűzve jelenik meg, hogy a szaki (vagy a fejlesztő Vercel-en) a
   * konzol megnyitása nélkül is lássa a tényleges okot. */
  details?: string;
}

/**
 * LÉPÉS -- Felszereltségi Elemek Állapota Modul.
 *
 * **UX TELJES ÚJRATERVEZÉSE (2026-08-02, 1. hullám):** a korábbi "Hibrid Okos-Lista"
 * (Kiemelt szekció + kategória-fülek + nézet-szűrő) helyett egy sokkal egyszerűbb,
 * gyorsabb struktúra: A) szupergyors tömeges kijelölés a keresés által listázott
 * elemekre, B) élő kereső a TELJES katalógusban, C) kompakt 3-állapotú segmented control
 * soronként, D) progressive disclosure (Megjegyzés + Fotó) KIZÁRÓLAG "Hibás" állapotnál.
 *
 * **AI DIKTÁLÁS + CSOMAG-PRESETEK (2026-08-02, 2. hullám, PROJEKT_INSTRUKCIOK.md "2. LÉPÉS"):**
 *  E) Csomag-alapú gyorsgombok (`PRESET_BUTTONS`/`applyPreset()`) -- Alap/Átlagos/Full
 *     Extra/Visszaállítás, 1 kattintással előkészítve a TELJES katalógust egy tipikus
 *     felszereltségi szinthez, lásd `lib/inspections/constants.ts`
 *     `EQUIPMENT_PRESET_BASIC`/`EQUIPMENT_PRESET_COMFORT_EXTRA`.
 *  F) AI diktálás (`EquipmentAiAssistant`) -- a szaki szabad szöveges/hangalapú (a
 *     megosztott `TextareaField` beépített `VoiceInputButton`-ján keresztül, magyar,
 *     Web Speech API) leírásából a `/api/ai/parse-equipment` Gemini 2.0 Flash backend
 *     (lásd az előző fejlesztési lépést) strukturált `FeatureState`-frissítéseket ad
 *     vissza, amiket `applyAiUpdates()` a state-be merge-el -- KIZÁRÓLAG az AI által
 *     ténylegesen visszaküldött elemeket módosítva, a többit érintetlenül hagyva.
 *
 * A `value` (`FeatureFormState[]`) a TELJES katalógust tartalmazza mindig (lásd
 * `InspectionWizard.tsx` `defaultEquipment()`) -- a keresés/csoportosítás/preset csak azt
 * szabályozza, mely elemek LÁTSZANAK/módosulnak, a tömb hossza maga nem változik.
 */
export function StepEquipment({ value, onChange, onBack, onNext, nextLabel }: StepEquipmentProps) {
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<{ variant: VinScanToastVariant; message: string } | null>(null);

  function setStatus(id: string, status: FeatureStatus) {
    onChange(value.map((item) => (item.id === id ? { ...item, status } : item)));
  }

  function setNotes(id: string, notes: string) {
    onChange(value.map((item) => (item.id === id ? { ...item, notes } : item)));
  }

  function setPhoto(id: string, file: File) {
    onChange(
      value.map((item) => {
        if (item.id !== id) return item;
        if (item.file && item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
        return { ...item, file, previewUrl: URL.createObjectURL(file) };
      })
    );
  }

  function removePhoto(id: string) {
    onChange(
      value.map((item) => {
        if (item.id !== id) return item;
        if (item.file && item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
        return { ...item, file: null, previewUrl: null };
      })
    );
  }

  /** E) Csomag-alapú gyorsgombok -- a TELJES katalógusra hatnak (nem a keresés által
   * szűrt listára, szemben az alábbi `markListedAsWorking()`-gal), mert egy preset
   * kifejezetten a teljes vizsgálat egyben történő előkészítésére szolgál. Státusz-
   * VÁLTÁSKOR a korábbi hiba-megjegyzés/fotó törlődik (a blob URL felszabadításával) --
   * egy már nem "Hibás" elemnél ezek elavulttá válnának, a "Visszaállítás" gombnál pedig
   * ez a szándékolt, teljes nullázó viselkedés. */
  function applyPreset(preset: PresetKey) {
    onChange(
      value.map((item) => {
        let nextStatus: FeatureStatus;
        if (preset === 'full') nextStatus = 'working';
        else if (preset === 'reset') nextStatus = 'not_present';
        else if (preset === 'basic') nextStatus = BASIC_PRESET_IDS.has(item.id) ? 'working' : 'not_present';
        else nextStatus = COMFORT_PRESET_IDS.has(item.id) ? 'working' : 'not_present';

        if (nextStatus === item.status) return item;
        if (item.file && item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
        return { ...item, status: nextStatus, notes: '', file: null, previewUrl: null };
      })
    );
  }

  /** F) Az AI válaszában érkező frissítések merge-elése -- KIZÁRÓLAG a `updates`-ben
   * ténylegesen szereplő `id`-jű elemeket módosítja, a többi elem VÁLTOZATLAN marad.
   * "Hibás" célállapotnál az AI `notes` mezőjét (ha érkezett) átveszi, egyébként a
   * meglévő megjegyzést megtartja; minden más célállapotnál -- ugyanúgy, mint a
   * preset-eknél -- törli az esetleg korábban rögzített hiba-megjegyzést/fotót. */
  function applyAiUpdates(updates: { id: string; status: FeatureStatus; notes?: string }[]) {
    const updateMap = new Map(updates.map((update) => [update.id, update]));
    onChange(
      value.map((item) => {
        const update = updateMap.get(item.id);
        if (!update) return item;

        if (update.status === 'defective') {
          return { ...item, status: 'defective', notes: update.notes ?? item.notes };
        }

        if (item.file && item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
        return { ...item, status: update.status, notes: '', file: null, previewUrl: null };
      })
    );
  }

  const trimmedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(
    () => (trimmedQuery === '' ? value : value.filter((item) => item.id.toLowerCase().includes(trimmedQuery))),
    [value, trimmedQuery]
  );

  /** A) Szupergyors tömeges kijelölés -- KIZÁRÓLAG a keresés által jelenleg LISTÁZOTT
   * elemekre hat (nem a teljes katalógusra), hogy kereséssel kombinálva célzottan is
   * használható legyen (pl. "ülés" -> Összes kijelölése -> az összes ülés-extra egyszerre
   * működőre áll). Keresés nélkül ez a teljes katalógust jelenti. */
  function markListedAsWorking() {
    const listedIds = new Set(filteredItems.map((item) => item.id));
    onChange(value.map((item) => (listedIds.has(item.id) ? { ...item, status: 'working' as const } : item)));
  }

  const groupedByCategory = useMemo(() => {
    const groups = new Map<EquipmentCategory, FeatureFormState[]>();
    for (const category of EQUIPMENT_CATEGORY_ORDER) groups.set(category, []);
    for (const item of filteredItems) {
      const category = EQUIPMENT_NAME_TO_CATEGORY[item.id];
      if (!category) continue;
      groups.get(category)!.push(item);
    }
    return EQUIPMENT_CATEGORY_ORDER.map((category) => ({ category, items: groups.get(category) ?? [] })).filter(
      (group) => group.items.length > 0
    );
  }, [filteredItems]);

  const workingCount = useMemo(() => value.filter((item) => item.status === 'working').length, [value]);
  const defectiveCount = useMemo(() => value.filter((item) => item.status === 'defective').length, [value]);

  return (
    <div className="flex flex-col gap-6">
      {toast && <VinScanToast variant={toast.variant} message={toast.message} onDismiss={() => setToast(null)} />}

      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">
          Felszereltségi elemek állapota
        </h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Jelöld be gyorsan az egyes kényelmi és biztonsági felszerelések állapotát.
        </p>
        {(workingCount > 0 || defectiveCount > 0) && (
          <p className="mt-1 text-[12px] text-linear-ink-subtle">
            {workingCount > 0 && <span className="text-linear-success">{workingCount} működik</span>}
            {workingCount > 0 && defectiveCount > 0 && ' · '}
            {defectiveCount > 0 && <span className="text-linear-danger">{defectiveCount} hibás</span>}
          </p>
        )}
      </div>

      {/* E) Csomag-alapú gyorsgombok -- lásd a `StepEquipment` JSDoc-ját fent. */}
      <div className="flex flex-wrap gap-2">
        {PRESET_BUTTONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => applyPreset(key)}
            className="inline-flex h-9 items-center rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-3 text-[12.5px] font-medium text-linear-ink-muted transition-colors hover:border-linear-primary hover:text-linear-ink"
          >
            {label}
          </button>
        ))}
      </div>

      {/* F) AI diktálás -- lásd `EquipmentAiAssistant` lent. */}
      <EquipmentAiAssistant value={value} onApplyUpdates={applyAiUpdates} onToast={setToast} />

      {/* A) Tömeges kijelölő varázsgomb + B) Élő kereső -- ragadós, hogy hosszú görgetés
          közben is elérhető maradjon. */}
      <div className="sticky top-0 z-10 -mx-5 flex flex-col gap-2 border-b border-linear-hairline bg-linear-surface-1 px-5 py-3 sm:-mx-7 sm:flex-row sm:items-center sm:px-7">
        <button
          type="button"
          onClick={markListedAsWorking}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md bg-linear-primary px-4 text-[13px] font-semibold text-white transition-colors hover:bg-linear-primary-hover"
        >
          <Zap className="h-4 w-4" />
          Összes kijelölése: Működik
        </button>

        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-linear-ink-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`🔍 Keresés a ${EQUIPMENT_ITEMS.length} felszerelés között…`}
            className="h-10 w-full rounded-md border border-linear-hairline bg-linear-surface-1 pl-9 pr-3 text-[14px] text-linear-ink placeholder:text-linear-ink-subtle transition-colors focus:border-linear-primary focus:outline-none focus:ring-1 focus:ring-linear-primary/40"
          />
        </div>
      </div>

      {groupedByCategory.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linear-hairline-strong px-4 py-8 text-center text-[13px] text-linear-ink-subtle">
          Nincs a keresésnek megfelelő felszereltségi elem.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {groupedByCategory.map(({ category, items }) => (
            <div key={category}>
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
                {EQUIPMENT_CATEGORY_LABEL[category]}{' '}
                <span className="font-normal normal-case text-linear-ink-tertiary">({items.length})</span>
              </p>
              <ul className="divide-y divide-linear-hairline overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1">
                {items.map((item) => (
                  <FeatureRow
                    key={item.id}
                    item={item}
                    onSetStatus={setStatus}
                    onNotesChange={setNotes}
                    onPhotoSelect={setPhoto}
                    onPhotoRemove={removePhoto}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <WizardStepFooter onBack={onBack} onNext={onNext} nextLabel={nextLabel} />
    </div>
  );
}

/**
 * F) AI diktálás kártya -- kiemelt, a lépés tetején (a preset-gombok alatt) élő vezérlő.
 * A szöveges mező a megosztott `TextareaField`-et használja fel VÁLTOZTATÁS NÉLKÜL --
 * az automatikusan tartalmazza a magyar (hu-HU) `VoiceInputButton`-t (mikrofon gomb,
 * pulzáló "Diktálás…" jelzéssel felvétel közben, lásd `lib/hooks/useSpeechToText.ts`),
 * így nem kellett külön mikrofon-komponenst építeni -- ugyanaz a bevált, projekt-szintű
 * hangalapú bevitel, mint minden más hosszabb Megjegyzés/Leírás mezőnél.
 *
 * A mikrofon kikapcsolásakor a `TextareaField` `onDictationEnd` callback-je AUTOMATIKUSAN
 * meghívja a `/api/ai/parse-equipment` route-ot hívó `handleProcess()`-t -- külön "Feldolgozás
 * AI-val" gomb NEM kell, mert a diktálás vége önmagában elindítja a feldolgozást (lásd
 * "Auto-Trigger AI Diktálás", 39. szakasz). A gomb 2026-08-06-án el lett távolítva, mert a
 * kézi indítás redundáns volt a beépített auto-trigger mellett. A válasz `updates` tömbjét
 * az `onApplyUpdates` callback-en keresztül adja tovább a szülőnek, a siker/hiba
 * visszajelzést pedig az `onToast`-on.
 */
function EquipmentAiAssistant({
  value,
  onApplyUpdates,
  onToast,
}: {
  value: FeatureFormState[];
  onApplyUpdates: (updates: { id: string; status: FeatureStatus; notes?: string }[]) => void;
  onToast: (toast: { variant: VinScanToastVariant; message: string }) => void;
}) {
  const [text, setText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { notifyInsufficientCredits } = useInsufficientCredits();
  const inspectionId = useInspectionId();

  /** "Auto-Trigger AI Diktálás" lépés (2026-08-02) -- `overrideText` az
   * `onDictationEnd`-ből érkezik (lásd a `TextareaField` hívását lent): a diktálás
   * VÉGÉN a `useSpeechToText` közvetlenül a frissen felismert, végleges szöveget adja
   * át, NEM a `text` React state-re támaszkodva -- ez elkerüli azt az elméleti
   * race condition-t, hogy a `text` state a `onSessionEnd` böngésző-esemény
   * lefutásakor még nem feltétlenül frissült a legutolsó `onresult`-ból (a state-
   * frissítés aszinkron). A kézi "Feldolgozás AI-val" gomb 2026-08-06-án eltávolításra
   * került (redundáns volt az auto-trigger mellett), így `overrideText` a gyakorlatban
   * MINDIG megadott -- az opcionális paraméter csak azért maradt, hogy a függvény
   * jövőbeli, kézi hívási móddal is kompatibilis maradjon módosítás nélkül. */
  async function handleProcess(overrideText?: string) {
    const trimmed = (overrideText ?? text).trim();
    if (!trimmed || isProcessing) return;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/ai/parse-equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, inspectionId }),
      });

      // 402 (INSUFFICIENT_AI_QUOTA) -- lásd `InsufficientCreditsProvider.tsx`. A globális
      // "Elfogyott az AI kereted" modalt nyitjuk meg a lokális toast helyett, hogy a
      // felhasználó egyértelmű, akcionálható visszajelzést kapjon.
      if (response.status === 402) {
        notifyInsufficientCredits();
        return;
      }

      const data = (await response.json()) as ParseEquipmentApiResponse;

      if (!response.ok || !data.success) {
        // A `details` mezőt (ha érkezett -- lásd `route.ts` `toErrorDetails()`) KIZÁRÓLAG a
        // konzolba logoljuk hibakereséshez -- ez a nyers Gemini API hibaüzenet (pl. kvóta-
        // túllépés, modell-hiba stb.) fejlesztői/hibakeresési célú, a szakinak (felhasználónak)
        // szánt toast-üzenetben SOSE jelenhet meg. Korábban ez a nyers szöveg a `baseMessage`
        // után zárójelben a toast-ba is bekerült -- egy 2026-08-09-i éles hibajegy szerint ez
        // egy hosszú, technikai Gemini-hibaüzenetet jelenített meg a felhasználónak, ezért
        // mostantól a toast MINDIG a rövid, általános `baseMessage`-et mutatja, a `details`
        // csak a böngésző konzolján (és a Vercel szerver-logokban) érhető el.
        if (data.details) console.error('[EquipmentAiAssistant] Gemini API hiba részletek:', data.details);
        const baseMessage = data.error ?? 'Hiba történt az AI feldolgozás közben. Próbáld újra.';
        onToast({ variant: 'warning', message: baseMessage });
        return;
      }

      const updates = data.updates ?? [];
      if (updates.length === 0) {
        onToast({
          variant: 'warning',
          message: 'Az AI nem talált egyértelműen felismerhető felszereltségi elemet a szövegben.',
        });
        return;
      }

      onApplyUpdates(updates);
      onToast({ variant: 'success', message: `AI frissítve: ${updates.length} elem módosítva` });
      setText('');
    } catch {
      onToast({ variant: 'warning', message: 'Hálózati hiba -- az AI feldolgozás nem sikerült. Próbáld újra.' });
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="rounded-lg border border-linear-primary/30 bg-linear-surface-1 p-4">
      {/* A korábbi lila Sparkles ikon és "AI diktálás" felirat "generatív AI tech-demó"
          hatást keltett -- a "UI/UX finomhangolás, Copywriting tisztítás" lépés kérésére
          egy letisztult, ikon nélküli, profi SaaS-copy váltotta fel (a funkció maga --
          Gemini szöveg-értelmezés + a megosztott hangalapú diktálás -- változatlan). */}
      <div className="mb-3">
        <p className="text-[14px] font-semibold text-linear-ink">Hangalapú gyorskitöltés</p>
        <p className="text-[12px] text-linear-ink-subtle">
          Diktáld be egyetlen mondatban a tesztelt extrákat, és a rendszer automatikusan beállítja a gombokat.
        </p>
      </div>

      <TextareaField
        label="Diktált / beírt szöveg"
        name="equipment-ai-text"
        placeholder='pl. "a klíma működik, a tolatókamera hibás, homályos a kép, navigáció nincs az autóban"'
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        // "Auto-Trigger AI Diktálás" lépés -- ez KIVÁLTJA a `TextareaField`
        // alapértelmezett nyelvhelyesség-javítását: itt a mikrofon kikapcsolásakor
        // NEM a szöveg "kisimítása" a cél, hanem a `/api/ai/parse-equipment` strukturált
        // feldolgozás AZONNALI, kézi gombnyomás nélküli elindítása.
        onDictationEnd={(sessionText, baseValueAtStart) => {
          const finalText = joinDictatedText(baseValueAtStart, sessionText);
          setText(finalText);
          void handleProcess(finalText);
        }}
      />

      {isProcessing && (
        <div className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-linear-ink-subtle">
          <Loader2 className="h-4 w-4 animate-spin" />
          AI értelmezi a diktálást…
          <span className="text-[12px] text-linear-ink-subtle">Ez néhány másodpercig tarthat…</span>
        </div>
      )}
    </div>
  );
}

/** Egy sor: elem neve + 3-állapotú segmented control + (Hibás esetén) az inline
 * progressive-disclosure panel. Külön komponens, hogy a `key`-elt lista-elemek
 * lokálisan izoláltak maradjanak (a szülő `StepEquipment` re-renderje ne mozgassa a
 * fókuszt a Megjegyzés mezőről gépelés közben). */
function FeatureRow({
  item,
  onSetStatus,
  onNotesChange,
  onPhotoSelect,
  onPhotoRemove,
}: {
  item: FeatureFormState;
  onSetStatus: (id: string, status: FeatureStatus) => void;
  onNotesChange: (id: string, notes: string) => void;
  onPhotoSelect: (id: string, file: File) => void;
  onPhotoRemove: (id: string) => void;
}) {
  const isDefective = item.status === 'defective';

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <span className="text-[14px] font-medium text-linear-ink">{item.id}</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label={`${item.id} állapota`}>
          {STATUS_OPTIONS.map(({ status, icon: Icon, activeClass }) => {
            const isActive = item.status === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => onSetStatus(item.id, status)}
                aria-pressed={isActive}
                className={
                  'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors ' +
                  (isActive
                    ? activeClass
                    : 'border-linear-hairline-strong bg-linear-surface-2 text-linear-ink-subtle hover:bg-linear-surface-3')
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {FEATURE_STATUS_LABEL[status]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Progressive disclosure -- csak "Hibás" állapotnál, lágy fade+slide animációval
          (globals.css `feature-defect-panel-in` keyframe). */}
      {isDefective && (
        <div
          className="flex flex-col gap-3 rounded-md border border-linear-danger/30 bg-linear-danger-soft p-3"
          style={{ animation: 'feature-defect-panel-in 180ms ease-out' }}
        >
          <TextareaField
            label="Mi a hiba pontosan?"
            name={`feature-notes-${item.id}`}
            placeholder="pl. az ülésfűtés csak a jobb oldalon melegszik"
            value={item.notes}
            onChange={(e) => onNotesChange(item.id, e.target.value)}
          />
          <FeaturePhotoPicker
            file={item.file}
            previewUrl={item.previewUrl}
            onSelect={(file) => onPhotoSelect(item.id, file)}
            onRemove={() => onPhotoRemove(item.id)}
          />
        </div>
      )}
    </li>
  );
}

/** Kompakt, egyetlen-fotós csatoló a "Hibás" progressive-disclosure panelhez -- a
 * meglévő `DefectMediaUpload.tsx`-nél (Hibák & Média lépés) jóval kisebb, sűrűbb
 * elrendezésben, mert itt sok sor mellett, egy szűk inline panelben él, és
 * SZÁNDÉKOSAN csak fotót fogad (nem videót, `accept="image/*"`), a spec "📷 Fotó
 * csatolása a hibáról" kérése szerint. Ugyanaz a "blob vs. már feltöltött Storage URL"
 * minta, mint a többi médiánál a projektben. */
function FeaturePhotoPicker({
  file,
  previewUrl,
  onSelect,
  onRemove,
}: {
  file: File | null;
  previewUrl: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (previewUrl) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-linear-hairline bg-linear-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- kliens-oldali object URL / meglévő Storage URL előnézet */}
          <img src={previewUrl} alt={file?.name ?? 'Hibafotó előnézet'} className="h-full w-full object-cover" />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-3 text-[12.5px] font-medium text-linear-ink-subtle transition-colors hover:bg-linear-surface-3 hover:text-linear-danger"
        >
          <X className="h-3.5 w-3.5" />
          Fotó eltávolítása
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="inline-flex h-9 w-fit items-center gap-1.5 rounded-md border border-dashed border-linear-hairline-strong bg-linear-surface-2 px-3 text-[12.5px] font-medium text-linear-ink-subtle transition-colors hover:border-linear-primary hover:text-linear-ink"
    >
      <Camera className="h-3.5 w-3.5" />
      📷 Fotó csatolása a hibáról
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) onSelect(selected);
          e.target.value = '';
        }}
      />
    </button>
  );
}
