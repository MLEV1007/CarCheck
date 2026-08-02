'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react';
import { SectionHeading } from '@/components/report/SectionHeading';
import { MediaLightbox } from '@/components/report/MediaLightbox';
import type { PublicReportFeature } from '@/lib/reports/types';

interface EquipmentMatrixProps {
  equipment: PublicReportFeature[];
}

/**
 * Felszereltség szekció -- UX teljes újratervezés (2026-08-02). Két, egymástól élesen
 * elkülönített rész:
 *
 *  A) "⚠️ Észrevételek / Hibás extrák" -- kiemelt, piros figyelmeztető kártya a
 *     LEGELEJÉN, KIZÁRÓLAG ha van legalább egy `defective` elem. Itt jelenik meg a
 *     szaki megjegyzése és a felnagyítható hibafotó (a meglévő `MediaLightbox`-szal,
 *     ugyanaz a komponens, mint a hiba-/sérülés-médiáknál). Ha nincs hibás elem, ez a
 *     kártya EGYÁLTALÁN nem renderelődik.
 *  B) A `working`/`not_present` elemek letisztult, kompakt chip-rácsban -- egy 200+
 *     elemes katalógusnál egy tömör pill-felhő sokkal áttekinthetőbb, mint az egyenkénti
 *     nagy kártyák (a korábbi verzió mintája), ezért NEM azt a mintát követi.
 *
 * Ha az `equipment` tömb teljesen üres (elméletileg nem fordulhat elő, mert a wizard
 * mindig a teljes katalógust menti), a szekció nem renderelődik. BMW design: `rounded-none`.
 */
export function EquipmentMatrix({ equipment }: EquipmentMatrixProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (equipment.length === 0) return null;

  const defective = equipment.filter((item) => item.status === 'defective');
  const working = equipment.filter((item) => item.status === 'working');
  const notPresent = equipment.filter((item) => item.status === 'not_present');

  return (
    <section className="border-t border-bmw-hairline py-16 first:border-t-0 first:pt-0">
      <SectionHeading eyebrow="Kényelmi & Biztonsági Extrák" title="Felszereltség állapota" />

      {/* A) Kiemelt figyelmeztető kártya -- csak hibás elem esetén. */}
      {defective.length > 0 && (
        <div className="mt-8 border border-bmw-error bg-[#fdedec] p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-bmw-error" />
            <p className="text-[16px] font-bold text-bmw-ink">⚠️ Észrevételek / Hibás extrák</p>
          </div>

          <div className="mt-4 flex flex-col divide-y divide-bmw-error/25">
            {defective.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-5">
                {item.photo_url && (
                  <button
                    type="button"
                    onClick={() => setLightboxUrl(item.photo_url!)}
                    className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-none border border-bmw-error bg-bmw-surface-card"
                    aria-label={`${item.id} hibafotó megnyitása nagyobb nézetben`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.photo_url}
                      alt={`${item.id} hibafotó`}
                      className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                    />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-bmw-ink">{item.id}</p>
                  <p className="mt-1 text-[14px] font-light leading-relaxed text-bmw-body">
                    {item.notes?.trim() ? item.notes : 'Nincs megadva megjegyzés.'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* B) Működő / nem található extrák -- letisztult chip-rács. */}
      {working.length > 0 && (
        <div className="mt-8">
          <p className="text-[13px] font-bold uppercase tracking-[1px] text-bmw-muted">Működő extrák ({working.length})</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {working.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1.5 rounded-none border border-bmw-success bg-[#f0faf3] px-3 py-1.5 text-[13px] font-medium text-bmw-ink"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-bmw-success" />
                {item.id}
              </span>
            ))}
          </div>
        </div>
      )}

      {notPresent.length > 0 && (
        <div className="mt-8">
          <p className="text-[13px] font-bold uppercase tracking-[1px] text-bmw-muted">
            Nem található extrák ({notPresent.length})
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {notPresent.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1.5 rounded-none border border-bmw-hairline-strong bg-bmw-surface-soft px-3 py-1.5 text-[13px] font-medium text-bmw-muted"
              >
                <MinusCircle className="h-3.5 w-3.5 shrink-0 text-bmw-muted" />
                {item.id}
              </span>
            ))}
          </div>
        </div>
      )}

      {lightboxUrl && <MediaLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </section>
  );
}
