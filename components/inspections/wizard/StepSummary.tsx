'use client';

import { AlertTriangle, CheckCircle2, Loader2, MinusCircle, XCircle } from 'lucide-react';
import { EQUIPMENT_STATUS_LABEL, getPaintStatus } from '@/lib/inspections/constants';
import { decodeDot } from '@/lib/inspections/tireDot';
import { PaintStatusBadge } from '@/components/inspections/wizard/PaintStatusBadge';
import { isVideoUrl } from '@/lib/reports/media';
import type {
  CarInfoState,
  DefectState,
  DiagnosticsState,
  EquipmentItemState,
  PaintMeasurementState,
  TiresState,
} from '@/lib/inspections/types';

interface StepSummaryProps {
  carInfo: CarInfoState;
  generalPhotoCount: number;
  diagnostics: DiagnosticsState;
  equipment: EquipmentItemState[];
  tires: TiresState;
  paintMeasurements: PaintMeasurementState[];
  defects: DefectState[];
  isSubmitting: boolean;
  submitError: string | null;
  onBack: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
}

const EQUIPMENT_ICON = { working: CheckCircle2, not_working: XCircle, na: MinusCircle } as const;
const EQUIPMENT_ICON_CLASS = {
  working: 'text-linear-success',
  not_working: 'text-linear-danger',
  na: 'text-linear-ink-tertiary',
} as const;

/** LÉPÉS 8 -- Összegzés & Publikálás (PROJEKT_INSTRUKCIOK.md 5.B.4 + "3 új szakértői modul"). */
export function StepSummary({
  carInfo,
  generalPhotoCount,
  diagnostics,
  equipment,
  tires,
  paintMeasurements,
  defects,
  isSubmitting,
  submitError,
  onBack,
  onSaveDraft,
  onPublish,
}: StepSummaryProps) {
  const filledPaint = paintMeasurements.filter((panel) => panel.micronValue.trim() !== '');
  const diagnosticCodes = diagnostics.codes.filter((entry) => entry.code.trim() !== '');
  const relevantEquipment = equipment.filter((item) => item.status !== 'na');
  const filledTirePositions = Object.entries(tires).filter(
    ([, tire]) => tire.mm.trim() !== '' || tire.dot.trim() !== ''
  );
  const carLabel = [carInfo.carBrand, carInfo.carModel].filter(Boolean).join(' ') || 'Ismeretlen autó';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.3px] text-linear-ink">Összegzés & Publikálás</h2>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          Ellenőrizd az adatokat, majd mentsd piszkozatként, vagy fejezd be és publikáld az ügyfélriportot.
        </p>
      </div>

      <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5">
        <p className="text-[15px] font-semibold text-linear-ink">{carLabel}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
          <SummaryField label="Évjárat" value={carInfo.year || '—'} />
          <SummaryField label="Rendszám" value={carInfo.licensePlate || '—'} mono />
          <SummaryField label="Km óra állás" value={carInfo.odometer ? `${carInfo.odometer} km` : '—'} />
          <SummaryField label="Alvázszám (VIN)" value={carInfo.vin || '—'} mono fullWidth />
          <SummaryField label="Általános fotók" value={generalPhotoCount > 0 ? `${generalPhotoCount} db` : '—'} />
        </dl>
      </div>

      <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">Diagnosztika</p>
        {diagnostics.noDtc ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-linear-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            OBD Tiszta -- nincs hibakód
          </p>
        ) : diagnosticCodes.length === 0 ? (
          <p className="mt-2 text-[13px] text-linear-ink-subtle">Nincs rögzített hibakód.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-linear-hairline">
            {diagnosticCodes.map((entry) => (
              <li key={entry.clientId} className="flex items-center gap-3 py-2">
                <span className="font-mono text-[13px] font-semibold text-linear-danger">{entry.code}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-linear-ink-muted">
                  {entry.description || 'Nincs megadva leírás.'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Felszereltség állapota ({relevantEquipment.length} jelölt elem)
        </p>
        {relevantEquipment.length === 0 ? (
          <p className="mt-2 text-[13px] text-linear-ink-subtle">Nincs jelölt (működő/hibás) felszereltségi elem.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-linear-hairline">
            {relevantEquipment.map((item) => {
              const Icon = EQUIPMENT_ICON[item.status];
              return (
                <li key={item.name} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[13px] text-linear-ink">{item.name}</span>
                  <span className={'inline-flex items-center gap-1.5 text-[13px] ' + EQUIPMENT_ICON_CLASS[item.status]}>
                    <Icon className="h-3.5 w-3.5" />
                    {EQUIPMENT_STATUS_LABEL[item.status]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Gumiabroncsok ({filledTirePositions.length}/4 pozíció kitöltve)
        </p>
        {filledTirePositions.length === 0 ? (
          <p className="mt-2 text-[13px] text-linear-ink-subtle">Nincs rögzített gumiabroncs-adat.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-linear-hairline">
            {filledTirePositions.map(([position, tire]) => {
              const decoded = tire.dot.length === 4 ? decodeDot(tire.dot) : null;
              return (
                <li key={position} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[13px] uppercase text-linear-ink">{position}</span>
                  <span className="flex items-center gap-3 text-[13px] text-linear-ink-muted">
                    {tire.mm && <span className="font-mono">{tire.mm} mm</span>}
                    {tire.dot && <span className="font-mono">DOT {tire.dot}</span>}
                    {decoded && (
                      <span className={decoded.isOld ? 'text-linear-warning' : 'text-linear-ink-subtle'}>
                        {decoded.label}
                        {decoded.isOld ? ' ⚠' : ''}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Festékvastagság-mérés ({filledPaint.length} elem rögzítve)
        </p>
        {filledPaint.length === 0 ? (
          <p className="mt-2 text-[13px] text-linear-ink-subtle">Nincs rögzített mérés.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-linear-hairline">
            {filledPaint.map((panel) => {
              const micron = Number(panel.micronValue);
              return (
                <li key={panel.elementName} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[13px] text-linear-ink">{panel.elementName}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[13px] text-linear-ink-muted">{micron} µm</span>
                    <PaintStatusBadge status={getPaintStatus(micron)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Hibák ({defects.length} rögzítve)
        </p>
        {defects.length === 0 ? (
          <p className="mt-2 text-[13px] text-linear-ink-subtle">Nincs rögzített hiba.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-linear-hairline">
            {defects.map((defect, index) => (
              <li key={defect.clientId} className="flex items-center gap-3 py-2.5">
                {defect.previewUrl ? (
                  (defect.file ? defect.file.type.startsWith('video/') : isVideoUrl(defect.previewUrl)) ? (
                    <video src={defect.previewUrl} className="h-12 w-12 shrink-0 rounded-md object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={defect.previewUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-md object-cover"
                    />
                  )
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-md bg-linear-surface-2" />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-linear-ink">
                    #{index + 1} · {defect.category}
                  </p>
                  <p className="truncate text-[12px] text-linear-ink-subtle">{defect.description}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {submitError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-linear-danger/30 bg-linear-danger-soft px-3 py-2.5 text-[13px] text-linear-danger"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {submitError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-linear-hairline pt-5 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="inline-flex h-10 items-center rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-5 text-[14px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Vissza
        </button>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={isSubmitting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-linear-hairline-strong bg-linear-surface-1 px-5 text-[14px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Mentés piszkozatként
          </button>
          <button
            type="button"
            onClick={onPublish}
            disabled={isSubmitting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-linear-primary px-5 text-[14px] font-medium text-white transition-colors hover:bg-linear-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Vizsgálat befejezése & Publikálás
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryField({
  label,
  value,
  mono,
  fullWidth,
}: {
  label: string;
  value: string;
  mono?: boolean;
  /** 17 karakteres VIN-hez: 2-oszlopos mobil rácsban teljes szélességű sort kap, hogy ne
   * csússzon/lógjon bele a szomszédos mezőbe (`col-span-full` a legszűkebb, `grid-cols-2`
   * nézeten -- `sm:` felett már mindenképp elfér a saját cellájában). */
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? 'col-span-2 sm:col-span-1' : undefined}>
      <dt className="text-[11px] uppercase tracking-[0.4px] text-linear-ink-subtle">{label}</dt>
      <dd className={'mt-0.5 text-linear-ink ' + (mono ? 'font-mono break-all' : '')}>{value}</dd>
    </div>
  );
}
