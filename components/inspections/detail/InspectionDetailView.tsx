'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  MinusCircle,
  Pencil,
  XCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PaintStatusBadge } from '@/components/inspections/wizard/PaintStatusBadge';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { isVideoUrl } from '@/lib/reports/media';
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
import { formatHuf, formatKg, formatKm, formatKw, formatServiceDate } from '@/lib/format';
import { LicensePlateBadge } from '@/components/ui/LicensePlateBadge';
import { DamageCanvas } from '@/components/inspections/DamageCanvas';
import type {
  DamagePointState,
  DiagnosticsState,
  FeatureFormState,
  FinalAssessmentState,
  ReportThresholds,
  ServiceHistoryState,
  TireGeneralInfoState,
  TirePosition,
  TiresState,
} from '@/lib/inspections/types';

interface DetailInspection {
  id: string;
  car_brand: string | null;
  car_model: string | null;
  year: number | null;
  vin: string | null;
  license_plate: string | null;
  license_plate_country: string | null;
  odometer: number | null;
  engine_type: string | null;
  power_kw: number | null;
  gross_weight_kg: number | null;
  public_token: string;
  created_at: string;
}

interface DetailPaintMeasurement {
  id: string;
  x: number;
  y: number;
  value: number;
}

interface DetailDefect {
  id: string;
  category: string;
  description: string | null;
  media_url: string | null;
}

interface InspectionDetailViewProps {
  inspection: DetailInspection;
  paintMeasurements: DetailPaintMeasurement[];
  defects: DetailDefect[];
  generalPhotos: string[];
  serviceHistory: ServiceHistoryState;
  diagnostics: DiagnosticsState;
  equipment: FeatureFormState[];
  tires: TiresState;
  tireGeneralInfo: TireGeneralInfoState;
  damages: DamagePointState[];
  finalAssessment: FinalAssessmentState;
  /** Riport küszöbértékek (2026-08-07) -- lásd `InspectionWizard.tsx` JSDoc-ját.
   * Alapértéke `DEFAULT_REPORT_THRESHOLDS`. */
  reportThresholds?: ReportThresholds;
}

const FEATURE_ICON = { working: CheckCircle2, defective: XCircle, not_present: MinusCircle } as const;
const FEATURE_ICON_CLASS = {
  working: 'text-linear-success',
  defective: 'text-linear-danger',
  not_present: 'text-linear-ink-tertiary',
} as const;

/**
 * Befejezett vizsgálat belső szakértői adatlapja (`/inspections/[id]`, ha a
 * vizsgálat státusza 'completed' -- lásd app/inspections/[id]/page.tsx elágazása).
 * Linear Dark Design Style, ugyanazok a tokenek és komponens-minták (StatusBadge,
 * PaintStatusBadge), mint a Dashboardon és a wizard Összegzés lépésén.
 *
 * Akciók: publikus riport megnyitása új lapon, link vágólapra másolása (toast +
 * inline visszajelzéssel), illetve visszaállítás piszkozatba -- ez utóbbi a
 * `get_public_report` RPC-t (2026-07-31-es migráció óta) is inaktiválja a linken,
 * amíg a vizsgáló újra nem publikálja, így a régi ügyfél-link nem mutat félkész adatot.
 */
export function InspectionDetailView({
  inspection,
  paintMeasurements,
  defects,
  generalPhotos,
  serviceHistory,
  diagnostics,
  equipment,
  tires,
  tireGeneralInfo,
  damages,
  finalAssessment,
  reportThresholds = DEFAULT_REPORT_THRESHOLDS,
}: InspectionDetailViewProps) {
  const router = useRouter();
  const overallPaintAverage = getOverallPaintAverage(paintMeasurements);
  const overallPaintStatus = overallPaintAverage !== null ? getPaintStatus(overallPaintAverage, reportThresholds) : null;
  const diagnosticCodes = diagnostics.codes.filter((entry) => entry.code.trim() !== '');
  const relevantEquipment = equipment.filter((item) => item.status !== 'not_present');
  const filledTirePositions = Object.entries(tires).filter(
    ([, tire]) => tire.mm.trim() !== '' || tire.dot.trim() !== ''
  );
  const resolvedTireBrand =
    tireGeneralInfo.brand === TIRE_BRAND_OTHER ? tireGeneralInfo.customBrand : tireGeneralInfo.brand;
  const [copied, setCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);

  const carLabel = [inspection.car_brand, inspection.car_model].filter(Boolean).join(' ') || 'Ismeretlen autó';
  const reportUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/report/${inspection.public_token}`;
  const createdAt = new Date(inspection.created_at).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(reportUrl);
      setCopied(true);
      setShowToast(true);
      setTimeout(() => setCopied(false), 2000);
      setTimeout(() => setShowToast(false), 4000);
    } catch {
      // Clipboard API nem elérhető -- a user a "Publikus riport megtekintése" gombbal
      // manuálisan is másolhat a böngésző címsorából.
    }
  }

  async function handleRevertToDraft() {
    setIsReverting(true);
    setRevertError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setRevertError('A munkamenet lejárt. Jelentkezz be újra, és próbáld meg ismét.');
      setIsReverting(false);
      return;
    }

    const { error } = await supabase
      .from('inspections')
      .update({ status: 'draft' })
      .eq('id', inspection.id)
      .eq('user_id', user.id);

    if (error) {
      setRevertError('A visszaállítás sikertelen volt. Próbáld újra.');
      setIsReverting(false);
      return;
    }

    // A szülő Server Component (app/inspections/[id]/page.tsx) az `inspections.status`
    // alapján ágazik el draft/completed nézet között -- egy `router.refresh()` újra
    // lekérdezi a szervertől, és mostantól a wizardot fogja renderelni ugyanezen az URL-en.
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-linear-canvas">
      {showToast && (
        <div
          role="status"
          className="fixed inset-x-4 top-4 z-50 flex items-center gap-2.5 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-4 py-3 shadow-lg sm:inset-x-auto sm:left-auto sm:right-6 sm:w-[380px]"
        >
          <Check className="h-5 w-5 shrink-0 text-linear-success" />
          <p className="font-mono text-[12px] text-linear-ink-muted">A publikus riport linkje a vágólapra másolva.</p>
        </div>
      )}

      <header className="flex h-16 items-center gap-3 border-b border-linear-hairline px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-linear-ink-subtle transition-colors hover:bg-linear-surface-1 hover:text-linear-ink"
          aria-label="Vissza a dashboardra"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="min-w-0 truncate text-[14px] font-medium text-linear-ink">{carLabel}</span>
        <StatusBadge isDraft={false} />
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-3 rounded-lg border border-linear-hairline bg-linear-surface-1 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] text-linear-ink-subtle">Vizsgálat dátuma: {createdAt}</p>
            <p className="mt-1 truncate font-mono text-[12px] text-linear-ink-subtle">{reportUrl}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/report/${inspection.public_token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-3 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-3"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Publikus riport megtekintése
            </a>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-3 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-3"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-linear-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Másolva' : 'Publikus link másolása'}
            </button>
            <button
              type="button"
              onClick={handleRevertToDraft}
              disabled={isReverting}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-linear-primary px-3 text-[13px] font-medium text-white transition-colors hover:bg-linear-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isReverting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
              Visszaállítás piszkozatba / Szerkesztés
            </button>
          </div>
        </div>

        {revertError && (
          <p role="alert" className="rounded-md border border-linear-danger/30 bg-linear-danger-soft px-3 py-2.5 text-[13px] text-linear-danger">
            {revertError}
          </p>
        )}

        <p className="rounded-md border border-linear-hairline bg-linear-surface-1 px-3 py-2.5 text-[12px] text-linear-ink-subtle">
          A "Visszaállítás piszkozatba" a publikus riport linkjét is inaktiválja, amíg újra nem publikálod a
          vizsgálatot -- így az ügyfél nem lát félkész adatot szerkesztés közben.
        </p>

        <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5">
          <p className="text-[15px] font-semibold text-linear-ink">{carLabel}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-4">
            <DetailField label="Évjárat" value={inspection.year ? String(inspection.year) : '—'} />
            <DetailField
              label="Rendszám"
              value={inspection.license_plate || '—'}
              valueNode={
                inspection.license_plate ? (
                  <LicensePlateBadge
                    value={inspection.license_plate}
                    countryCode={inspection.license_plate_country}
                    size="sm"
                  />
                ) : undefined
              }
            />
            <DetailField
              label="Km óra állás"
              value={typeof inspection.odometer === 'number' ? formatKm(inspection.odometer) : '—'}
            />
            <DetailField label="Motor típusa" value={inspection.engine_type || '—'} />
            <DetailField
              label="Teljesítmény"
              value={typeof inspection.power_kw === 'number' ? formatKw(inspection.power_kw) : '—'}
            />
            <DetailField
              label="Össztömeg"
              value={typeof inspection.gross_weight_kg === 'number' ? formatKg(inspection.gross_weight_kg) : '—'}
            />
            <DetailField label="Alvázszám (VIN)" value={inspection.vin || '—'} mono fullWidth />
          </dl>
        </div>

        <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5">
          <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
            Általános fotók ({generalPhotos.length} db)
          </p>
          {generalPhotos.length === 0 ? (
            <p className="mt-2 text-[13px] text-linear-ink-subtle">Nincs feltöltve általános fotó.</p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {generalPhotos.map((url, index) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square overflow-hidden rounded-md border border-linear-hairline bg-linear-surface-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Általános fotó ${index + 1}`}
                    className="h-full w-full object-cover transition-opacity hover:opacity-80"
                  />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5">
          <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-linear-ink-subtle">
            Szervizmúlt & Dokumentumok
          </p>
          <p className="mt-2 text-[13px] text-linear-ink">
            {serviceHistory.status ? SERVICE_HISTORY_STATUS_LABEL[serviceHistory.status] : 'Nincs kiválasztva státusz'}
          </p>
          {serviceHistory.photos.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {serviceHistory.photos.map((photo, index) => (
                <a
                  key={photo.clientId}
                  href={photo.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square overflow-hidden rounded-md border border-linear-hairline bg-linear-surface-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.previewUrl}
                    alt={`Szerviz dokumentum ${index + 1}`}
                    className="h-full w-full object-cover transition-opacity hover:opacity-80"
                  />
                </a>
              ))}
            </div>
          )}
          {serviceHistory.carVerticalPdf.url && (
            <a
              href={serviceHistory.carVerticalPdf.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-linear-hairline-strong bg-linear-surface-2 px-3 py-1.5 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-3"
            >
              <FileText className="h-3.5 w-3.5" />
              CarVertical riport megnyitása (PDF)
            </a>
          )}
          {serviceHistory.entries.length === 0 ? (
            <p className="mt-3 text-[13px] text-linear-ink-subtle">Nincs rögzített idővonal-bejegyzés.</p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-linear-hairline">
              {serviceHistory.entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-mono text-[13px] text-linear-ink-muted">{formatServiceDate(entry.date) || '—'}</span>
                  <span className="text-[13px] font-medium text-linear-ink">{entry.type || 'Egyéb'}</span>
                  {entry.mileage && (
                    <span className="font-mono text-[13px] text-linear-ink-subtle">{formatKm(entry.mileage)}</span>
                  )}
                  {entry.notes && <span className="text-[12px] text-linear-ink-subtle">{entry.notes}</span>}
                </li>
              ))}
            </ul>
          )}
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
                      <div className="flex flex-wrap items-center gap-2 text-[12px] text-linear-ink-subtle">
                        {item.notes.trim() !== '' && <span>{item.notes}</span>}
                        {item.previewUrl && (
                          <a
                            href={item.previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 text-linear-primary hover:underline"
                          >
                            📷 Fotó megtekintése
                          </a>
                        )}
                      </div>
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
                const decoded = tire.dot.length === 4 ? decodeDot(tire.dot, undefined, reportThresholds) : null;
                const mmValue = tire.mm.trim() === '' ? null : Number(tire.mm);
                const treadWorn = mmValue !== null && !Number.isNaN(mmValue) && isTreadWorn(mmValue, reportThresholds);
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
              {paintMeasurements.map((measurement, index) => (
                <li key={measurement.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[13px] text-linear-ink">{index + 1}. pont</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[13px] text-linear-ink-muted">{measurement.value} µm</span>
                    <PaintStatusBadge status={getPaintStatus(measurement.value, reportThresholds)} />
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
            <div className="mt-4">
              <DamageCanvas points={damages} mode="view" theme="dark" />
            </div>
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
              {defects.map((defect) => (
                <li key={defect.id} className="flex items-center gap-3 py-2.5">
                  {defect.media_url ? (
                    isVideoUrl(defect.media_url) ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video src={defect.media_url} className="h-12 w-12 shrink-0 rounded-md object-cover" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={defect.media_url}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-md object-cover"
                      />
                    )
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-md bg-linear-surface-2" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-linear-ink">{defect.category}</p>
                    <p className="truncate text-[12px] text-linear-ink-subtle">
                      {defect.description || 'Nincs megadva leírás.'}
                    </p>
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
      </main>
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
  fullWidth,
  valueNode,
}: {
  label: string;
  value: string;
  mono?: boolean;
  /** 17 karakteres VIN-hez: a 2-oszlopos mobil rácsban (`grid-cols-2 sm:grid-cols-4`) teljes
   * szélességű sort kap, hogy ne csússzon/lógjon bele a szomszédos mezőbe -- `sm:` felett a
   * 4-oszlopos elrendezésben már mindenképp elfér a saját cellájában. */
  fullWidth?: boolean;
  /** Ha meg van adva, ez jelenik meg a `value` sima szövege HELYETT (pl. a Rendszám mezőnél
   * a `LicensePlateBadge` -- lásd "Rendszám felségjelzés" lépés). */
  valueNode?: ReactNode;
}) {
  return (
    <div className={fullWidth ? 'col-span-2 sm:col-span-1' : undefined}>
      <dt className="text-[11px] uppercase tracking-[0.4px] text-linear-ink-subtle">{label}</dt>
      <dd className={'mt-0.5 break-all text-linear-ink ' + (mono ? 'font-mono' : '')}>{valueNode ?? value}</dd>
    </div>
  );
}
