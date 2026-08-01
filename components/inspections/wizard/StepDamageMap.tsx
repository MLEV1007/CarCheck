'use client';

import { DAMAGE_TYPE_LABEL } from '@/lib/inspections/constants';
import { DamageCanvas } from '@/components/inspections/DamageCanvas';
import type { DamagePointState } from '@/lib/inspections/types';

interface StepDamageMapProps {
  value: DamagePointState[];
  onChange: (value: DamagePointState[]) => void;
  onBack: () => void;
  onNext: () => void;
  /** A KÖVETKEZŐ lépés rövid címe -- lásd StepCarInfo.tsx ugyanerről a propról. */
  nextLabel: string;
}

/**
 * LÉPÉS -- Sérülés- és Hibatérkép modul: PONTOSAN a Festékvastagság-mérő "Szabadkézi
 * (Free-form Canvas)" mintáját követi (`DamageCanvas`, `mode="edit"`) -- nincs előre
 * definiált karosszéria-elem, a felhasználó a `cars.webp` referenciakép TETSZŐLEGES
 * pontjára kattinthat egy sérülés/esztétikai hiba felvételéhez, amihez kategóriát,
 * rövid címet, opcionális leírást és opcionális fotót is rögzíthet. Egy meglévő,
 * színes markerre kattintva a pont módosítható vagy törölhető.
 */
export function StepDamageMap({ value, onChange, onBack, onNext, nextLabel }: StepDamageMapProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Sérülés- és Hibatérkép</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Kattints az autó-képen BÁRHOVA egy sérülés/esztétikai hiba rögzítéséhez -- add meg a
          kategóriát, egy rövid címet, és -- ha van -- csatolj fotót. Egy meglévő markerre kattintva
          módosíthatod vagy törölheted a bejegyzést.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-linear-hairline-strong bg-linear-surface-2 px-5 py-3.5">
        <p className="text-[13px] font-medium text-linear-ink-subtle">
          <span className="font-mono text-[15px] font-semibold text-linear-ink">{value.length}</span> sérülés/hiba
          rögzítve
        </p>
      </div>

      <DamageCanvas points={value} mode="edit" onChange={onChange} theme="dark" />

      {value.length > 0 && (
        <ul className="flex flex-col divide-y divide-linear-hairline rounded-lg border border-linear-hairline bg-linear-surface-1">
          {value.map((point, index) => (
            <li key={point.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-[13px] text-linear-ink-subtle">{index + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-linear-ink">{point.title}</span>
              <span className="shrink-0 text-[12px] text-linear-ink-subtle">{DAMAGE_TYPE_LABEL[point.type]}</span>
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
