'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import { WizardSummaryFooter } from '@/components/inspections/wizard/WizardBottomBar';
import { TextField, ToggleField } from '@/components/inspections/wizard/FormControls';
import {
  DEFAULT_REPORT_THRESHOLDS,
  FEATURE_STATUS_LABEL,
  FINAL_ASSESSMENT_RECOMMENDATION_LABEL,
  RIM_TYPE_LABEL,
  SERVICE_HISTORY_STATUS_LABEL,
  TIRE_BRAND_OTHER,
  TIRE_POSITION_LABEL,
  getOverallPaintAverage,
  getPaintStatus,
} from '@/lib/inspections/constants';
import { decodeDot, isTreadWorn } from '@/lib/inspections/tireDot';
import { formatHuf, formatKm } from '@/lib/format';
import { LicensePlateBadge } from '@/components/ui/LicensePlateBadge';
import { PaintStatusBadge } from '@/components/inspections/wizard/PaintStatusBadge';
import { isVideoUrl } from '@/lib/reports/media';
import { DAMAGE_TYPE_LABEL } from '@/lib/inspections/constants';
import type {
  CarInfoState,
  ClientInfoState,
  DamagePointState,
  DefectState,
  DiagnosticsState,
  FeatureFormState,
  FinalAssessmentState,
  PaintPointState,
  ReportThresholds,
  ServiceHistoryState,
  TireGeneralInfoState,
  TirePosition,
  TiresState,
} from '@/lib/inspections/types';

interface StepSummaryProps {
  carInfo: CarInfoState;
  generalPhotoCount: number;
  serviceHistory: ServiceHistoryState;
  diagnostics: DiagnosticsState;
  equipment: FeatureFormState[];
  tires: TiresState;
  tireGeneralInfo: TireGeneralInfoState;
  paintMeasurements: PaintPointState[];
  damages: DamagePointState[];
  defects: DefectState[];
  finalAssessment: FinalAssessmentState;
  clientInfo: ClientInfoState;
  onClientInfoChange: (value: ClientInfoState) => void;
  isSubmitting: boolean;
  submitError: string | null;
  onBack: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  /** Riport küszöbértékek (2026-08-07) -- lásd `InspectionWizard.tsx` JSDoc-ját.
   * Alapértéke `DEFAULT_REPORT_THRESHOLDS`. */
  thresholds?: ReportThresholds;
}

const FEATURE_ICON = { working: CheckCircle2, defective: XCircle, not_present: MinusCircle } as const;
const FEATURE_ICON_CLASS = {
  working: 'text-linear-success',
  defective: 'text-linear-danger',
  not_present: 'text-linear-ink-tertiary',
} as const;

/** LÉPÉS 8 -- Összegzés & Publikálás (PROJEKT_INSTRUKCIOK.md 5.B.4 + "3 új szakértői modul"). */
export function StepSummary({
  carInfo,
  generalPhotoCount,
  serviceHistory,
  diagnostics,
  equipment,
  tires,
  tireGeneralInfo,
  paintMeasurements,
  damages,
  defects,
  finalAssessment,
  clientInfo,
  onClientInfoChange,
  isSubmitting,
  submitError,
  onBack,
  onSaveDraft,
  onPublish,
  thresholds = DEFAULT_REPORT_THRESHOLDS,
}: StepSummaryProps) {
  const overallPaintAverage = getOverallPaintAverage(paintMeasurements);
  const overallPaintStatus = overallPaintAverage !== null ? getPaintStatus(overallPaintAverage, thresholds) : null;
  const resolvedTireBrand =
    tireGeneralInfo.brand === TIRE_BRAND_OTHER ? tireGeneralInfo.customBrand : tireGeneralInfo.brand;
  const diagnosticCodes = diagnostics.codes.filter((entry) => entry.code.trim() !== '');
  const relevantEquipment = equipment.filter((item) => item.status !== 'not_present');
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
          <SummaryField
            label="Rendszám"
            value={carInfo.licensePlate || '—'}
            valueNode={
              carInfo.licensePlate ? (
                <LicensePlateBadge value={carInfo.licensePlate} countryCode={carInfo.licensePlateCountry} size="sm" />
              ) : undefined
            }
          />
          <SummaryField label="Km óra állás" value={carInfo.odometer ? formatKm(carInfo.odometer) : '—'} />
          <SummaryField label="Alvázszám (VIN)" value={carInfo.vin || '—'} mono fullWidth />
          <SummaryField label="Általános fotók" value={generalPhotoCount > 0 ? `${generalPhotoCount} db` : '—'} />
        </dl>
      </div>

      {/* Átvizsgáló és Ügyfél adatok + PDF megjelenítési kapcsolók (2026-08-06,
          kiegészítve az Átvizsgáló neve input mezővel) -- az EGYETLEN wizard-lépés,
          ahol az "Összegzés" mellett még ténylegesen szerkeszthető mező is van: az
          "Átvizsgáló neve" input + a "Megrendelő adatai" blokk (Név/Telefon/Email) +
          a publikus riporton (PDF) az Átvizsgáló/Megrendelő blokk láthatóságát
          vezérlő 2 kapcsoló. Szándékosan ITT, az Összegzés & Publikálás lépésen él,
          nem egy külön wizard-lépésként -- ez a legutolsó állomás Publikálás előtt,
          ahol a "mi kerüljön a bejelentkezés nélkül elérhető nyilvános linkre"
          döntés amúgy is meghozandó (lásd `InspectionWizard.tsx` `handleSubmit`,
          `inspector_id`/`inspector_name`/`client_*`/`show_*_on_pdf` mezők). A 2
          kapcsoló ELŐBB jelenik meg, a hozzájuk tartozó input mező(k) pedig
          KIZÁRÓLAG a kapcsoló BE állapotában renderelődnek -- kikapcsolt kapcsolónál
          az input eltűnik (a state-ben megmaradó érték nem vész el, csak a UI nem
          mutatja), hogy a felület ne kínáljon fel kitöltésre olyan mezőt, ami úgyis
          rejtve marad a publikus riporton. */}
      <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Átvizsgáló és Megrendelő adatai
        </p>
        <p className="mt-1 text-[12px] text-linear-ink-subtle">
          Vezérli, mi kerüljön a bejelentkezés nélkül elérhető publikus riportra.
        </p>

        <div className="mt-3 flex flex-col divide-y divide-linear-hairline">
          <ToggleField
            id="show-inspector-on-pdf"
            label="Átvizsgáló neve szerepeljen a PDF-en"
            hint="A publikus riporton megjelenik, ki végezte a vizsgálatot."
            checked={clientInfo.showInspectorOnPdf}
            onChange={(next) => onClientInfoChange({ ...clientInfo, showInspectorOnPdf: next })}
          />
          {clientInfo.showInspectorOnPdf && (
            <div className="pb-3 pt-3">
              <TextField
                label="Átvizsgáló neve"
                name="inspector-name"
                placeholder="Kovács Péter"
                hint="Üresen hagyva a bejelentkezett fiók neve jelenik meg."
                value={clientInfo.inspectorName}
                onChange={(e) => onClientInfoChange({ ...clientInfo, inspectorName: e.target.value })}
              />
            </div>
          )}

          <ToggleField
            id="show-client-on-pdf"
            label="Ügyfél adatai szerepeljenek a PDF-en"
            hint="Az alábbi Név/Telefon/Email a bejelentkezés nélkül elérhető riportra kerül."
            checked={clientInfo.showClientOnPdf}
            onChange={(next) => onClientInfoChange({ ...clientInfo, showClientOnPdf: next })}
          />
          {clientInfo.showClientOnPdf && (
            <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-3">
              <TextField
                label="Név"
                name="client-name"
                placeholder="Kovács János"
                value={clientInfo.clientName}
                onChange={(e) => onClientInfoChange({ ...clientInfo, clientName: e.target.value })}
              />
              <TextField
                label="Telefon"
                name="client-phone"
                type="tel"
                placeholder="+36 30 123 4567"
                value={clientInfo.clientPhone}
                onChange={(e) => onClientInfoChange({ ...clientInfo, clientPhone: e.target.value })}
              />
              <TextField
                label="Email"
                name="client-email"
                type="email"
                placeholder="kovacs.janos@example.com"
                value={clientInfo.clientEmail}
                onChange={(e) => onClientInfoChange({ ...clientInfo, clientEmail: e.target.value })}
              />
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Szervizmúlt & Dokumentumok
        </p>
        <p className="mt-2 text-[13px] text-linear-ink">
          {serviceHistory.status ? SERVICE_HISTORY_STATUS_LABEL[serviceHistory.status] : 'Nincs kiválasztva státusz'}
        </p>
        <p className="mt-1 text-[13px] text-linear-ink-subtle">
          {serviceHistory.photos.length > 0 ? `${serviceHistory.photos.length} dokumentum-fotó` : 'Nincs dokumentum-fotó'} ·{' '}
          {serviceHistory.entries.length > 0 ? `${serviceHistory.entries.length} idővonal-bejegyzés` : 'Nincs idővonal-bejegyzés'} ·{' '}
          {serviceHistory.carVerticalPdf.fileName ? 'CarVertical riport feltöltve' : 'Nincs CarVertical riport'}
        </p>
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
              const Icon = FEATURE_ICON[item.status];
              return (
                <li key={item.id} className="flex flex-col gap-1 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-linear-ink">{item.id}</span>
                    <span className={'inline-flex items-center gap-1.5 text-[13px] ' + FEATURE_ICON_CLASS[item.status]}>
                      <Icon className="h-3.5 w-3.5" />
                      {FEATURE_STATUS_LABEL[item.status]}
                    </span>
                  </div>
                  {item.status === 'defective' && (item.notes.trim() !== '' || item.previewUrl) && (
                    <p className="truncate text-[12px] text-linear-ink-subtle">
                      {item.notes.trim() !== '' ? item.notes : 'Nincs megjegyzés.'}
                      {item.previewUrl ? ' · 📷 fotó csatolva' : ''}
                    </p>
                  )}
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
        {(tireGeneralInfo.rimType || resolvedTireBrand.trim() !== '') && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-linear-ink-muted">
            {tireGeneralInfo.rimType && <span>Felni: {RIM_TYPE_LABEL[tireGeneralInfo.rimType]}</span>}
            {resolvedTireBrand.trim() !== '' && <span>Márka: {resolvedTireBrand}</span>}
          </p>
        )}
        {filledTirePositions.length === 0 ? (
          <p className="mt-2 text-[13px] text-linear-ink-subtle">Nincs rögzített gumiabroncs-adat.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-linear-hairline">
            {filledTirePositions.map(([position, tire]) => {
              const decoded = tire.dot.length === 4 ? decodeDot(tire.dot, undefined, thresholds) : null;
              const mmValue = tire.mm.trim() === '' ? null : Number(tire.mm);
              const treadWorn = mmValue !== null && !Number.isNaN(mmValue) && isTreadWorn(mmValue, thresholds);
              return (
                <li key={position} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[13px] text-linear-ink">{TIRE_POSITION_LABEL[position as TirePosition]}</span>
                  <span className="flex items-center gap-3 text-[13px] text-linear-ink-muted">
                    {tire.mm && (
                      <span className={'font-mono ' + (treadWorn ? 'text-linear-warning' : '')}>
                        {tire.mm} mm{treadWorn ? ' ⚠' : ''}
                      </span>
                    )}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
            Festékvastagság-mérés ({paintMeasurements.length} pont mérve)
          </p>
          {overallPaintAverage !== null && overallPaintStatus && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] text-linear-ink-muted">Teljes autó átlaga: {overallPaintAverage} µm</span>
              <PaintStatusBadge status={overallPaintStatus} />
            </div>
          )}
        </div>
        {paintMeasurements.length === 0 ? (
          <p className="mt-2 text-[13px] text-linear-ink-subtle">Nincs rögzített mérés.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-linear-hairline">
            {paintMeasurements.map((point, index) => (
              <li key={point.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-[13px] text-linear-ink">{index + 1}. pont</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[13px] text-linear-ink-muted">{point.value} µm</span>
                  <PaintStatusBadge status={getPaintStatus(point.value, thresholds)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Sérülés- és Hibatérkép ({damages.length} pont rögzítve)
        </p>
        {damages.length === 0 ? (
          <p className="mt-2 text-[13px] text-linear-ink-subtle">Nincs rögzített sérülés/hiba.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-linear-hairline">
            {damages.map((damage, index) => (
              <li key={damage.id} className="flex items-center gap-3 py-2.5">
                {damage.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={damage.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-md bg-linear-surface-2" />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-linear-ink">
                    #{index + 1} · {DAMAGE_TYPE_LABEL[damage.type]}
                  </p>
                  {/* "Egyéb" kategóriánál a cím egyedi szöveg -- csak akkor jelenik meg ez a
                      sor, ha van kiírható tartalom (fix kategóriáknál a cím megegyezne a
                      fenti sorral, lásd DamageCanvas.tsx). */}
                  {(damage.title !== DAMAGE_TYPE_LABEL[damage.type] || damage.description) && (
                    <p className="truncate text-[12px] text-linear-ink-subtle">
                      {damage.title !== DAMAGE_TYPE_LABEL[damage.type] ? damage.title : ''}
                      {damage.description ? ` · ${damage.description}` : ''}
                    </p>
                  )}
                </div>
              </li>
            ))}
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

      <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5">
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
          Végső Szakvélemény & Várható Költségek
        </p>
        {!finalAssessment.recommendation &&
        finalAssessment.estimatedCostMin.trim() === '' &&
        finalAssessment.estimatedCostMax.trim() === '' &&
        finalAssessment.costNotes.trim() === '' &&
        finalAssessment.summaryText.trim() === '' ? (
          <p className="mt-2 text-[13px] text-linear-ink-subtle">
            Nincs megadva -- ez a szekció opcionális, üresen a publikus riporton nem jelenik meg.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-2 text-[13px]">
            {finalAssessment.recommendation && (
              <p className="text-linear-ink">{FINAL_ASSESSMENT_RECOMMENDATION_LABEL[finalAssessment.recommendation]}</p>
            )}
            {(finalAssessment.estimatedCostMin.trim() !== '' || finalAssessment.estimatedCostMax.trim() !== '') && (
              <p className="font-mono text-linear-ink-muted">
                {finalAssessment.estimatedCostMin.trim() !== '' ? formatHuf(finalAssessment.estimatedCostMin) : '—'}
                {' – '}
                {finalAssessment.estimatedCostMax.trim() !== '' ? formatHuf(finalAssessment.estimatedCostMax) : '—'}
              </p>
            )}
            {finalAssessment.costNotes.trim() !== '' && (
              <p className="text-linear-ink-subtle">{finalAssessment.costNotes}</p>
            )}
            {finalAssessment.summaryText.trim() !== '' && (
              <p className="text-linear-ink-subtle">{finalAssessment.summaryText}</p>
            )}
          </div>
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

      <WizardSummaryFooter onBack={onBack} onSaveDraft={onSaveDraft} onPublish={onPublish} isSubmitting={isSubmitting} />
    </div>
  );
}

function SummaryField({
  label,
  value,
  mono,
  fullWidth,
  valueNode,
}: {
  label: string;
  value: string;
  mono?: boolean;
  /** 17 karakteres VIN-hez: 2-oszlopos mobil rácsban teljes szélességű sort kap, hogy ne
   * csússzon/lógjon bele a szomszédos mezőbe (`col-span-full` a legszűkebb, `grid-cols-2`
   * nézeten -- `sm:` felett már mindenképp elfér a saját cellájában). */
  fullWidth?: boolean;
  /** Ha meg van adva, ez jelenik meg a `value` sima szövege HELYETT (pl. a Rendszám mezőnél
   * a `LicensePlateBadge` -- lásd "Rendszám felségjelzés" lépés) -- a `value` ilyenkor is
   * kötelező marad, csak a screen reader szöveges tartalmához (nincs `aria-label` duplikálva). */
  valueNode?: ReactNode;
}) {
  return (
    <div className={fullWidth ? 'col-span-2 sm:col-span-1' : undefined}>
      <dt className="text-[11px] uppercase tracking-[0.4px] text-linear-ink-subtle">{label}</dt>
      <dd className={'mt-0.5 text-linear-ink ' + (mono ? 'font-mono break-all' : '')}>{valueNode ?? value}</dd>
    </div>
  );
}
