'use client';

import { useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, MinusCircle, Search, X, XCircle, Zap, type LucideIcon } from 'lucide-react';
import { TextareaField } from '@/components/inspections/wizard/FormControls';
import {
  EQUIPMENT_CATEGORY_LABEL,
  EQUIPMENT_CATEGORY_ORDER,
  EQUIPMENT_NAME_TO_CATEGORY,
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

/**
 * LÉPÉS -- Felszereltségi Elemek Állapota Modul, UX TELJES ÚJRATERVEZÉSE (2026-08-02).
 * Ez a redesign SZÁNDÉKOSAN lecseréli a korábbi "Hibrid Okos-Lista" (Kiemelt szekció +
 * kategória-fülek + nézet-szűrő) réteges felépítését egy sokkal egyszerűbb, gyorsabb
 * struktúrára:
 *
 *  A) Szupergyors tömeges kijelölés -- "⚡ Összes kijelölése: Működik" gomb a lépés
 *     tetején. A jelenleg LÁTHATÓ (keresés által szűrt) elemek státuszát egyszerre
 *     `working`-ra állítja -- így egy tipikus "minden extra megvan és működik" vizsgálat
 *     pár másodperc alatt elintézhető, a szaki csak a kivételeket (hibás/hiányzó elem)
 *     állítja át kézzel utána.
 *  B) Élő kereső -- EGYETLEN keresőmező, ami gépelés közben azonnal szűr a TELJES
 *     katalógusban. Nincsenek többé kategória-fülek/váltógombok -- a találatok a
 *     kategória-fejlécek alá csoportosítva jelennek meg (csak a nem üres kategóriák
 *     látszanak), hogy a ~212 elemes lista mindig áttekinthető maradjon.
 *  C) Kompakt, 3-állapotú segmented control minden soron (🟢 Működik / 🔴 Hibás /
 *     ⚪ Nincs benne) -- a korábbi "nehézkes dobozok" helyett egyetlen, tömör pill-sor.
 *  D) Progressive disclosure -- ha egy elemnél a 🔴 Hibás állapotot választja a szaki, a
 *     sor alatt lágy animációval megjelenik egy feltételes panel: Megjegyzés (a megosztott
 *     `TextareaField`-en keresztül -- automatikusan kapja a magyar hangalapú jegyzetelés
 *     mikrofon gombját is, lásd `FormControls.tsx`), és egy "📷 Fotó csatolása a hibáról"
 *     gomb. A tényleges Supabase Storage feltöltés -- a projekt MINDEN más média-
 *     feltöltésével (Hibák & Média, Általános fotók, Szervizmúlt, Sérülés-térkép) azonos
 *     elven -- csak a wizard végleges beküldésekor történik meg (lásd
 *     `InspectionWizard.tsx` `handleSubmit`), itt csak kliens-oldali fájlválasztás és
 *     előnézet zajlik.
 *
 * A `value` (`FeatureFormState[]`) a TELJES katalógust tartalmazza mindig (lásd
 * `InspectionWizard.tsx` `defaultEquipment()`) -- a keresés/csoportosítás csak azt
 * szabályozza, mely elemek LÁTSZANAK, a state maga nem szűkül.
 */
export function StepEquipment({ value, onChange, onBack, onNext, nextLabel }: StepEquipmentProps) {
  const [query, setQuery] = useState('');

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
            placeholder="🔍 Keresés a felszereltségek között…"
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
