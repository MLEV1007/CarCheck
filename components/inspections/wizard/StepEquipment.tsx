'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, MinusCircle, Search, XCircle, type LucideIcon } from 'lucide-react';
import {
  EQUIPMENT_CATEGORY_LABEL,
  EQUIPMENT_CATEGORY_ORDER,
  EQUIPMENT_NAME_TO_CATEGORY,
  EQUIPMENT_STATUS_LABEL,
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

/**
 * LÉPÉS -- Felszereltségi Elemek Állapota Modul, BŐVÍTETT katalógussal
 * (PROJEKT_INSTRUKCIOK.md, "Bővített Felszereltség Lista" lépés). A `lib/inspections/
 * constants.ts` `EQUIPMENT_CATALOG` ~200 elemet tartalmaz 4 kategóriában (Műszaki /
 * Beltér / Kültér / Multimédia) -- egyetlen lapos lista ennyi elemnél már
 * áttekinthetetlen lenne, ezért:
 *  - kategória-fülek szűrik a listát (alapértelmezetten "Műszaki"),
 *  - egy gyorskereső mező FÜGGETLENÜL a kategóriától, az ÖSSZES elem között keres --
 *    keresés közben a kategória-fülek elrejtődnek, hogy ne legyen zavaró két egyidejű
 *    szűrő ugyanarra a listára.
 * A `value` maga NEM változik (továbbra is a teljes ~200 elemes `EquipmentItemState[]`,
 * lásd `InspectionWizard.tsx` `defaultEquipment()`) -- a kategória/kereső CSAK azt
 * szabályozza, mely elemek LÁTSZANAK, a status-oknál nincs adatvesztés fül/keresés váltáskor.
 */
export function StepEquipment({ value, onChange, onBack, onNext, nextLabel }: StepEquipmentProps) {
  const [activeCategory, setActiveCategory] = useState<EquipmentCategory>('muszaki');
  const [query, setQuery] = useState('');

  function setStatus(name: string, status: EquipmentStatus) {
    onChange(value.map((item) => (item.name === name ? { ...item, status } : item)));
  }

  const selectedCount = useMemo(() => value.filter((item) => item.status !== 'na').length, [value]);

  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery !== '';

  const visibleItems = useMemo(() => {
    if (isSearching) {
      return value.filter((item) => item.name.toLowerCase().includes(trimmedQuery));
    }
    return value.filter((item) => EQUIPMENT_NAME_TO_CATEGORY[item.name] === activeCategory);
  }, [value, isSearching, trimmedQuery, activeCategory]);

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

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-linear-ink-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Gyorskeresés az összes kategóriában…"
            className="h-10 w-full rounded-md border border-linear-hairline bg-linear-surface-1 pl-9 pr-3 text-[14px] text-linear-ink placeholder:text-linear-ink-subtle transition-colors focus:border-linear-primary focus:outline-none focus:ring-1 focus:ring-linear-primary/40"
          />
        </div>

        {!isSearching && (
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
        )}
      </div>

      {visibleItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linear-hairline-strong px-4 py-8 text-center text-[13px] text-linear-ink-subtle">
          Nincs a keresésnek megfelelő felszereltségi elem.
        </p>
      ) : (
        <ul className="divide-y divide-linear-hairline overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1">
          {visibleItems.map((item) => (
            <li
              key={item.name}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <span className="text-[14px] font-medium text-linear-ink">{item.name}</span>

              <div className="flex flex-wrap gap-2" role="group" aria-label={`${item.name} állapota`}>
                {STATUS_OPTIONS.map(({ status, icon: Icon, activeClass }) => {
                  const isActive = item.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatus(item.name, status)}
                      aria-pressed={isActive}
                      className={
                        'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors ' +
                        (isActive
                          ? activeClass
                          : 'border-linear-hairline-strong bg-linear-surface-2 text-linear-ink-subtle hover:bg-linear-surface-3')
                      }
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {EQUIPMENT_STATUS_LABEL[status]}
                    </button>
                  );
                })}
              </div>
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
