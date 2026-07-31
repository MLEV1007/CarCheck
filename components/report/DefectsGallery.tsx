'use client';

import { useMemo, useState } from 'react';
import type { PublicReportDefect } from '@/lib/reports/types';
import { isVideoUrl } from '@/lib/reports/media';
import { SectionHeading } from '@/components/report/SectionHeading';
import { MediaLightbox } from '@/components/report/MediaLightbox';

interface DefectsGalleryProps {
  defects: PublicReportDefect[];
}

function groupByCategory(defects: PublicReportDefect[]): Array<[string, PublicReportDefect[]]> {
  const map = new Map<string, PublicReportDefect[]>();
  for (const defect of defects) {
    const key = defect.category?.trim() || 'Egyéb';
    const list = map.get(key) ?? [];
    list.push(defect);
    map.set(key, list);
  }
  return Array.from(map.entries());
}

/**
 * Talált hibák & média galéria (PROJEKT_INSTRUKCIOK.md 5.C): kategória szerint
 * csoportosított hibalista, fotó/videó thumbnaillel -- kattintásra a `MediaLightbox`
 * nyílik meg. BMW design: `rounded-none` kártyák, hairline elválasztók, 300-as light
 * leírás-szöveg a 700-as kategória-címekkel szemben.
 */
export function DefectsGallery({ defects }: DefectsGalleryProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const grouped = useMemo(() => groupByCategory(defects), [defects]);

  return (
    <section className="border-t border-bmw-hairline py-16 first:border-t-0 first:pt-0">
      <SectionHeading
        eyebrow="Talált hibák"
        title={defects.length > 0 ? `${defects.length} rögzített hiba` : 'Nincs rögzített hiba'}
      />

      {grouped.length === 0 ? (
        <p className="mt-6 text-[15px] font-light text-bmw-body">
          A vizsgálat során ezen a járművön nem került rögzítésre hiba.
        </p>
      ) : (
        <div className="mt-10 flex flex-col gap-12">
          {grouped.map(([category, items]) => (
            <div key={category}>
              <h3 className="text-[18px] font-bold text-bmw-ink">{category}</h3>
              <div className="mt-4 flex flex-col divide-y divide-bmw-hairline border border-bmw-hairline">
                {items.map((defect) => (
                  <DefectRow key={defect.id} defect={defect} onOpenMedia={setLightboxUrl} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {lightboxUrl && <MediaLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </section>
  );
}

function DefectRow({
  defect,
  onOpenMedia,
}: {
  defect: PublicReportDefect;
  onOpenMedia: (url: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6">
      {defect.media_url ? (
        <button
          type="button"
          onClick={() => onOpenMedia(defect.media_url!)}
          className="group relative h-24 w-32 shrink-0 overflow-hidden rounded-none border border-bmw-hairline-strong bg-bmw-surface-card"
          aria-label="Média megnyitása nagyobb nézetben"
        >
          {isVideoUrl(defect.media_url) ? (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={defect.media_url} className="h-full w-full object-cover" muted />
              <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-[18px] text-white">
                ▶
              </span>
            </>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={defect.media_url}
              alt={defect.description || defect.category}
              className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
            />
          )}
        </button>
      ) : (
        <div className="flex h-24 w-32 shrink-0 items-center justify-center rounded-none border border-dashed border-bmw-hairline-strong text-[12px] font-light text-bmw-muted-soft print:hidden">
          Nincs média
        </div>
      )}
      <p className="min-w-0 flex-1 text-[15px] font-light leading-relaxed text-bmw-body">
        {defect.description || 'Nincs megadva leírás.'}
      </p>
    </div>
  );
}
