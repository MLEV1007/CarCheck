'use client';

import { DAMAGE_TYPE_LABEL } from '@/lib/inspections/constants';
import { DamageCanvas } from '@/components/inspections/DamageCanvas';
import { WizardStepFooter } from '@/components/inspections/wizard/WizardBottomBar';
import { HintCallout } from '@/components/onboarding/HintCallout';
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
 * pontjára kattinthat egy sérülés/esztétikai hiba felvételéhez, amihez kategóriát (ill.
 * "Egyéb" esetén egy rövid megnevezést), opcionális leírást és opcionális fotót is
 * rögzíthet -- lásd `DamageCanvas.tsx` JSDoc-ját a "cím" mező 2026-08-04-i
 * egyszerűsítéséről. Egy meglévő, színes markerre kattintva a pont módosítható vagy
 * törölhető.
 */
export function StepDamageMap({ value, onChange, onBack, onNext, nextLabel }: StepDamageMapProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Sérülés- és Hibatérkép</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Kattints a képre a karosszéria vagy a beltér sérüléseinek megjelöléséhez, válaszd ki a
          kategóriát, és csatolj fotót.
        </p>
      </div>

      <HintCallout id="damage-map" title="Tipp: jelöld be a látható sérüléseket">
        Kattints a képen pontosan arra a helyre, ahol a karcolást/horpadást találtad -- a meglévő
        jelölőre kattintva bármikor módosíthatod vagy törölheted.
      </HintCallout>

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
              {/* Csak akkor jelenik meg külön szöveg, ha a cím ELTÉR a kategória
                  feliratától (lásd DamageCanvas.tsx JSDoc) -- fix kategóriáknál a kettő
                  megegyezik, azt fölöslegesen duplikálná ez a lista. */}
              <span className="min-w-0 flex-1 truncate text-[13px] text-linear-ink">
                {point.title !== DAMAGE_TYPE_LABEL[point.type] ? point.title : ''}
              </span>
              <span className="shrink-0 text-[12px] text-linear-ink-subtle">{DAMAGE_TYPE_LABEL[point.type]}</span>
            </li>
          ))}
        </ul>
      )}

      <WizardStepFooter onBack={onBack} onNext={onNext} nextLabel={nextLabel} />
    </div>
  );
}
