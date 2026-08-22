'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { SectionHeading } from '@/components/report/SectionHeading';
import { MediaLightbox } from '@/components/report/MediaLightbox';
import type { PublicReportFeature } from '@/lib/reports/types';

interface EquipmentMatrixProps {
  equipment: PublicReportFeature[];
}

/**
 * Felszereltség szekció, UX teljes újratervezés (2026-08-02). Két, egymástól élesen
 * elkülönített rész:
 *
 *  A) "⚠️ Észrevételek / Hibás extrák", kiemelt, piros figyelmeztető kártya a
 *     LEGELEJÉN, KIZÁRÓLAG ha van legalább egy `defective` elem. Itt jelenik meg a
 *     szaki megjegyzése és a felnagyítható hibafotó (a meglévő `MediaLightbox`-szal,
 *     ugyanaz a komponens, mint a hiba-/sérülés-médiáknál). Ha nincs hibás elem, ez a
 *     kártya EGYÁLTALÁN nem renderelődik.
 *  B) A `working` elemek letisztult, kompakt chip-rácsban, egy 200+ elemes
 *     katalógusnál egy tömör pill-felhő sokkal áttekinthetőbb, mint az egyenkénti nagy
 *     kártyák (a korábbi verzió mintája), ezért NEM azt a mintát követi.
 *
 * **"Extrák szűrése" lépés (2026-08-02):** a `not_present` ("nincs benne") státuszú
 * elemek SOHA nem jelennek meg a publikus riporton, egy 200+ elemes katalógusnál a
 * vásárlót/ügyfelet kizárólag az érdekli, mi VAN és MŰKÖDIK-e az autóban, a katalógus
 * túlnyomó többsége (ami az adott autóban egyszerűen nincs felszerelve) csak zajt
 * jelentene. A korábbi "Nem található extrák (N)" chip-szekció ezért TELJESEN törölve,
 * a wizard (`StepEquipment.tsx`) és a szakértői adatlap (`InspectionDetailView.tsx`)
 * TOVÁBBRA IS mutatja a `not_present` elemeket (ott a szakinak releváns, mit NEM
 * pipált be), KIZÁRÓLAG a publikus, ügyfélnek szánt riport szűri ki őket.
 *
 * Ha az `equipment` tömb teljesen üres, VAGY a szűrés után nincs egyetlen megjelenítendő
 * (`working`/`defective`) elem sem (elméletileg ritka, de egy csupa `not_present`
 * katalógusnál előfordulhat), a teljes szekció nem renderelődik, egy üres "Felszereltség
 * állapota" fejléc tartalom nélkül félrevezető lenne. BMW design: `rounded-none`.
 */
export function EquipmentMatrix({ equipment }: EquipmentMatrixProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const defective = equipment.filter((item) => item.status === 'defective');
  const working = equipment.filter((item) => item.status === 'working');

  if (defective.length === 0 && working.length === 0) return null;

  return (
    <section className="border-t border-bmw-hairline py-16 first:border-t-0 first:pt-0">
      <SectionHeading eyebrow="Kényelmi & Biztonsági Extrák" title="Felszereltség állapota" />

      {/* A) Kiemelt figyelmeztető kártya, csak hibás elem esetén. */}
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

      {/* B) Működő / nem található extrák, letisztult chip-rács. */}
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

      {lightboxUrl && <MediaLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </section>
  );
}
