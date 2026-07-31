'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, MinusCircle, Search, XCircle, type LucideIcon } from 'lucide-react';
import {
  EQUIPMENT_CATEGORY_LABEL,
  EQUIPMENT_CATEGORY_ORDER,
  EQUIPMENT_NAME_TO_CATEGORY,
  EQUIPMENT_STATUS_LABEL,
  FEATURED_EQUIPMENT,
  FEATURED_EQUIPMENT_NAMES,
} from '@/lib/inspections/constants';
import type { EquipmentCategory, EquipmentItemState, EquipmentStatus } from '@/lib/inspections/types';

interface StepEquipmentProps {
  value: EquipmentItemState[];
  onChange: (value: EquipmentItemState[]) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
}

const STATUS_OPTIONS: { status: EquipmentStatus; icon: LucideIcon; activeClass: string }[] = [
  {
    status: 'working',
    icon: CheckCircle2,
    activeClass: 'border-linear-success bg-linear-success-soft text-linear-success',
  },
  {
    status: 'not_working',
    icon: XCircle,
    activeClass: 'border-linear-danger bg-linear-danger-soft text-linear-danger',
  },
  {
    status: 'na',
    icon: MinusCircle,
    activeClass: 'border-linear-hairline-strong bg-linear-surface-3 text-linear-ink-muted',
  },
];

type ViewFilter = 'all' | 'marked';

/** Egy elem 3-állású segmented control-ja (🟢 Működik / 🔴 Nem működik / ⚪ Nem releváns)
 * -- a Kiemelt szekció ÉS a fő (kategorizált/kereshető) lista is ugyanezt használja,
 * hogy a két hely UGYANAZT a vizuális kontrollt adja ugyanarra az állapotra. */
function StatusButtons({
  name,
  status,
  onSetStatus,
}: {
  name: string;
  status: EquipmentStatus;
  onSetStatus: (name: string, status: EquipmentStatus) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={`${name} állapota`}>
      {STATUS_OPTIONS.map(({ status: optionStatus, icon: Icon, activeClass }) => {
        const isActive = status === optionStatus;
        return (
          <button
            key={optionStatus}
            type="button"
            onClick={() => onSetStatus(name, optionStatus)}
            aria-pressed={isActive}
            className={
              'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors ' +
              (isActive
                ? activeClass
                : 'border-linear-hairline-strong bg-linear-surface-2 text-linear-ink-subtle hover:bg-linear-surface-3')
            }
          >
            <Icon className="h-3.5 w-3.5" />
            {EQUIPMENT_STATUS_LABEL[optionStatus]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * LÉPÉS -- Felszereltségi Elemek Állapota Modul, HIBRID OKOS-LISTA
 * (PROJEKT_INSTRUKCIOK.md, "Felszereltség modul" lépés). Négy réteg épül egymásra:
 *
 *  A) "Kiemelt / Gyakori extrák" -- a 16 leggyakrabban vizsgált elem (`FEATURED_EQUIPMENT`,
 *     `constants.ts`) MINDIG a lépés tetején látszik, kategória-fültől és kereséstől
 *     teljesen függetlenül, hogy a leggyakoribb eseteket egy görgetés nélkül el lehessen
 *     intézni.
 *  B) Ragadós (`sticky`) kereső + kategória-fülek -- gépelés közben AZONNAL szűr a TELJES
 *     katalógusban (kategóriától függetlenül); keresés hiányában a 4 kategória-fül szűri a
 *     listát (alapértelmezett: Műszaki). Minden fülnél egy "Minden elem ezen a fülön ⚪ Nem
 *     releváns" gomb a gyors kitöltéshez -- ez a TELJES kategóriára hat, nem csak a
 *     szűrt/látható elemekre, hogy tényleg "egy katt, kész a fül" élményt adjon.
 *  C) Nézet-szűrő ("Összes elem" / "Csak a vizsgált/bejelölt elemek") -- a lenti
 *     (nem-kiemelt) lista látható elemeit tovább szűkíti a `na`-tól eltérő állapotúakra.
 *  D) A fő lista NEM ismétli meg a Kiemelt szekcióban már szereplő elemeket
 *     (`FEATURED_EQUIPMENT_NAMES`), hogy ne legyen két sor ugyanarra az állapotra.
 *
 * A `value` maga NEM változik réteg-váltáskor (továbbra is a teljes ~212 elemes
 * `EquipmentItemState[]`, lásd `InspectionWizard.tsx` `defaultEquipment()`) -- a fenti
 * rétegek CSAK azt szabályozzák, mely elemek LÁTSZANAK és milyen sorrendben.
 */
export function StepEquipment({ value, onChange, onBack, onNext, nextLabel }: StepEquipmentProps) {
  const [activeCategory, setActiveCategory] = useState<EquipmentCategory>('muszaki');
  const [query, setQuery] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');

  const statusByName = useMemo(() => new Map(value.map((item) => [item.name, item.status])), [value]);

  function setStatus(name: string, status: EquipmentStatus) {
    onChange(value.map((item) => (item.name === name ? { ...item, status } : item)));
  }

  /** "Minden elem ezen a fülön ⚪ Nem releváns" -- a TELJES kategóriára hat (nem csak a
   * keresés/nézet-szűrő miatt épp látható elemekre), hogy egy kattintással valóban
   * lezárható legyen egy teljes fül. */
  function markCategoryNotRelevant(category: EquipmentCategory) {
    onChange(
      value.map((item) => (EQUIPMENT_NAME_TO_CATEGORY[item.name] === category ? { ...item, status: 'na' } : item))
    );
  }

  const selectedCount = useMemo(() => value.filter((item) => item.status !== 'na').length, [value]);

  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery !== '';

  const mainListItems = useMemo(() => {
    const withoutFeatured = value.filter((item) => !FEATURED_EQUIPMENT_NAMES.has(item.name));
    const scoped = isSearching
      ? withoutFeatured.filter((item) => item.name.toLowerCase().includes(trimmedQuery))
      : withoutFeatured.filter((item) => EQUIPMENT_NAME_TO_CATEGORY[item.name] === activeCategory);
    return viewFilter === 'marked' ? scoped.filter((item) => item.status !== 'na') : scoped;
  }, [value, isSearching, trimmedQuery, activeCategory, viewFilter]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">
          Felszereltségi elemek állapota
        </h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Jelöld be az egyes kényelmi és biztonsági felszerelések működési állapotát.
          {selectedCount > 0 && ` ${selectedCount} elem már megjelölve (működik/nem működik).`}
        </p>
      </div>

      {/* A) Kiemelt / Gyakori extrák -- mindig felül, kategóriától/keresétől függetlenül. */}
      <div className="rounded-lg border border-linear-hairline-strong bg-linear-surface-2 p-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          ⭐ Kiemelt / Gyakori extrák
        </p>
        <ul className="mt-2 divide-y divide-linear-hairline">
          {FEATURED_EQUIPMENT.map(({ displayLabel, name }) => {
            const status = statusByName.get(name) ?? 'na';
            return (
              <li
                key={name}
                className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <span className="text-[14px] font-medium text-linear-ink">{displayLabel}</span>
                <StatusButtons name={name} status={status} onSetStatus={setStatus} />
              </li>
            );
          })}
        </ul>
      </div>

      {/* B) Ragadós kereső + kategória-fülek + C) nézet-szűrő. */}
      <div className="sticky top-0 z-10 -mx-5 flex flex-col gap-3 border-b border-linear-hairline bg-linear-surface-1 px-5 py-3 sm:-mx-7 sm:px-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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

          <div className="inline-flex shrink-0 rounded-md border border-linear-hairline-strong bg-linear-surface-2 p-0.5">
            {(
              [
                { key: 'all', label: 'Összes elem' },
                { key: 'marked', label: 'Csak a vizsgált elemek' },
              ] as { key: ViewFilter; label: string }[]
            ).map(({ key, label }) => {
              const isActive = viewFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setViewFilter(key)}
                  aria-pressed={isActive}
                  className={
                    'whitespace-nowrap rounded-[5px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ' +
                    (isActive ? 'bg-linear-primary text-white' : 'text-linear-ink-subtle hover:text-linear-ink')
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {!isSearching && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div
              className={
                'flex gap-1.5 overflow-x-auto pb-1 ' +
                '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
              }
              role="tablist"
              aria-label="Felszereltség kategóriák"
            >
              {EQUIPMENT_CATEGORY_ORDER.map((category) => {
                const isActive = category === activeCategory;
                return (
                  <button
                    key={category}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveCategory(category)}
                    className={
                      'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ' +
                      (isActive
                        ? 'border-linear-primary bg-linear-primary text-white'
                        : 'border-linear-hairline-strong bg-linear-surface-2 text-linear-ink-subtle hover:bg-linear-surface-3')
                    }
                  >
                    {EQUIPMENT_CATEGORY_LABEL[category]}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => markCategoryNotRelevant(activeCategory)}
              className="shrink-0 whitespace-nowrap rounded-md border border-dashed border-linear-hairline-strong px-3 py-1.5 text-[12.5px] font-medium text-linear-ink-subtle transition-colors hover:bg-linear-surface-2 hover:text-linear-ink"
            >
              Minden elem ezen a fülön ⚪ Nem releváns
            </button>
          </div>
        )}
      </div>

      {mainListItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linear-hairline-strong px-4 py-8 text-center text-[13px] text-linear-ink-subtle">
          {viewFilter === 'marked'
            ? 'Nincs a szűrésnek megfelelő, már megjelölt elem.'
            : 'Nincs a keresésnek megfelelő felszereltségi elem.'}
        </p>
      ) : (
        <ul className="divide-y divide-linear-hairline overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1">
          {mainListItems.map((item) => (
            <li
              key={item.name}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <span className="text-[14px] font-medium text-linear-ink">{item.name}</span>
              <StatusButtons name={item.name} status={item.status} onSetStatus={setStatus} />
            </li>
          ))}
        </ul>
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
