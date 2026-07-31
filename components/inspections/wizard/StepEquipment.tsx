'use client';

import { CheckCircle2, MinusCircle, XCircle, type LucideIcon } from 'lucide-react';
import { EQUIPMENT_STATUS_LABEL } from '@/lib/inspections/constants';
import type { EquipmentItemState, EquipmentStatus } from '@/lib/inspections/types';

interface StepEquipmentProps {
  value: EquipmentItemState[];
  onChange: (value: EquipmentItemState[]) => void;
  onBack: () => void;
  onNext: () => void;
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
 * LÉPÉS -- Felszereltségi Elemek Állapota Modul (PROJEKT_INSTRUKCIOK.md, "3 új
 * szakértői modul" lépés, B pont). Minden elemnél 3-állású segmented control
 * (Működik / Nem működik / Nem releváns) -- a `value` a wizard indulásakor a
 * `lib/inspections/constants.ts` `EQUIPMENT_ITEMS` listájából épül fel, alapértelmezetten
 * `na` státusszal (lásd InspectionWizard.tsx), hogy ne kényszerítsen döntést minden elemnél.
 */
export function StepEquipment({ value, onChange, onBack, onNext }: StepEquipmentProps) {
  function setStatus(name: string, status: EquipmentStatus) {
    onChange(value.map((item) => (item.name === name ? { ...item, status } : item)));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">
          Felszereltségi elemek állapota
        </h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Jelöld be az egyes kényelmi és biztonsági felszerelések működési állapotát.
        </p>
      </div>

      <ul className="divide-y divide-linear-hairline overflow-hidden rounded-lg border border-linear-hairline bg-linear-surface-1">
        {value.map((item) => (
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
          Tovább a gumiabroncsokhoz
        </button>
      </div>
    </div>
  );
}
