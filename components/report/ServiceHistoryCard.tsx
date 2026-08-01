'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, HelpCircle, Wrench } from 'lucide-react';
import { SectionHeading } from '@/components/report/SectionHeading';
import { MediaLightbox } from '@/components/report/MediaLightbox';
import { SERVICE_HISTORY_STATUS_LABEL } from '@/lib/inspections/constants';
import { formatKm, formatServiceDate } from '@/lib/format';
import type { PublicReportServiceHistory } from '@/lib/reports/types';

interface ServiceHistoryCardProps {
  serviceHistory: PublicReportServiceHistory;
}

/** Általános státusz jelvény vizuál kulcsa (Szervizmúlt & Dokumentumok modul, A pont) --
 * `full`/`digital` pozitív (zöld), `partial` figyelmeztető (sárga), `none` semleges (szürke). */
const STATUS_TONE: Record<'full' | 'partial' | 'digital' | 'none', { icon: typeof CheckCircle2; className: string }> = {
  full: { icon: CheckCircle2, className: 'border-bmw-success bg-[#f0faf3] text-bmw-ink' },
  digital: { icon: CheckCircle2, className: 'border-bmw-success bg-[#f0faf3] text-bmw-ink' },
  partial: { icon: AlertTriangle, className: 'border-bmw-warning bg-[#fef8ec] text-bmw-ink' },
  none: { icon: HelpCircle, className: 'border-bmw-hairline-strong bg-bmw-surface-soft text-bmw-body' },
};

/**
 * Szervizmúlt & Dokumentumok kártya (PROJEKT_INSTRUKCIOK.md, "Szervizmúlt & Dokumentumok
 * modul" lépés) -- 3 alappillér megjelenítve: A) Általános státusz jelvény, B) Dokumentum-
 * fotók galériája (ugyanaz a `MediaLightbox`, mint a `GeneralPhotosGallery`-nél), C) Manuális
 * idővonal (dátum/km óra állás/típus/megjegyzés, időrendi -- a rögzítés sorrendjében).
 * Ha egyáltalán nincs adat (nincs státusz, fotó, bejegyzés), a szekció nem renderelődik --
 * ugyanaz a minta, mint a `GeneralPhotosGallery`/`EquipmentMatrix`-nél. BMW design:
 * `rounded-none`, hairline szegélyű kártyák/sorok.
 */
export function ServiceHistoryCard({ serviceHistory }: ServiceHistoryCardProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const hasStatus = serviceHistory.status !== null;
  const hasPhotos = serviceHistory.photos.length > 0;
  const hasEntries = serviceHistory.entries.length > 0;
  const hasCarVerticalPdf = Boolean(serviceHistory.carvertical_pdf_url);

  if (!hasStatus && !hasPhotos && !hasEntries && !hasCarVerticalPdf) return null;

  const tone = serviceHistory.status ? STATUS_TONE[serviceHistory.status] : null;
  const StatusIcon = tone?.icon;

  return (
    <section className="border-t border-bmw-hairline py-16 first:border-t-0 first:pt-0">
      <SectionHeading eyebrow="Dokumentáció" title="Szervizmúlt" />

      {serviceHistory.status && tone && StatusIcon && (
        <div className={'mt-8 flex items-center gap-3 rounded-none border px-5 py-4 ' + tone.className}>
          <StatusIcon className="h-5 w-5 shrink-0" />
          <p className="text-[15px] font-bold">{SERVICE_HISTORY_STATUS_LABEL[serviceHistory.status]}</p>
        </div>
      )}

      {hasPhotos && (
        <div className="mt-8">
          <p className="text-[13px] font-bold uppercase tracking-[1px] text-bmw-muted">Dokumentumok</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {serviceHistory.photos.map((url, index) => (
              <button
                key={url}
                type="button"
                onClick={() => setLightboxUrl(url)}
                className="group relative aspect-[4/3] overflow-hidden rounded-none border border-bmw-hairline-strong bg-bmw-surface-card"
                aria-label={`${index + 1}. dokumentum megnyitása nagyobb nézetben`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Szerviz dokumentum ${index + 1}`}
                  className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {hasCarVerticalPdf && (
        <div className="mt-8">
          <a
            href={serviceHistory.carvertical_pdf_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-bmw-hairline-strong bg-bmw-surface-card px-5 py-3 text-[14px] font-bold text-bmw-ink transition-colors hover:bg-bmw-surface-strong"
          >
            <FileText className="h-4 w-4 text-[var(--report-accent)]" />
            {serviceHistory.carvertical_pdf_name || 'CarVertical riport letöltése (PDF)'}
          </a>
        </div>
      )}

      {hasEntries && (
        <div className="mt-8">
          <p className="text-[13px] font-bold uppercase tracking-[1px] text-bmw-muted">Idővonal</p>
          <div className="mt-4 flex flex-col divide-y divide-bmw-hairline border border-bmw-hairline">
            {serviceHistory.entries.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:gap-6">
                <span className="inline-flex w-fit shrink-0 items-center gap-1.5 border border-bmw-hairline-strong px-3 py-1.5 font-mono text-[13px] font-bold text-bmw-body-strong">
                  <Wrench className="h-3.5 w-3.5 text-[var(--report-accent)]" />
                  {formatServiceDate(entry.date) || '—'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-bmw-ink">{entry.type || 'Egyéb szerviz esemény'}</p>
                  {entry.notes && <p className="mt-0.5 text-[14px] font-light leading-relaxed text-bmw-body">{entry.notes}</p>}
                </div>
                {entry.mileage > 0 && (
                  <span className="shrink-0 font-mono text-[13px] text-bmw-muted">{formatKm(entry.mileage)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {lightboxUrl && <MediaLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </section>
  );
}
