'use client';

import { useState } from 'react';
import { Video } from 'lucide-react';
import { isVideoUrl } from '@/lib/reports/media';
import { SectionHeading } from '@/components/report/SectionHeading';
import { MediaLightbox } from '@/components/report/MediaLightbox';

interface GeneralPhotosGalleryProps {
  photos: string[];
}

/**
 * "Gépjármű fotók" galéria (PROJEKT_INSTRUKCIOK.md, "Általános autó fotók modul" lépés):
 * az `inspections.general_photos` tömb (elölről/hátulról/oldalról/beltér/műszerfal stb.
 * áttekintő képek, NEM a `defects` hibafotói) rács-elrendezésben, kattintásra ugyanaz a
 * `MediaLightbox` nyílik meg, mint a hibák galériájánál. BMW design: `rounded-none`
 * miniatűrök, hairline szegély.
 *
 * **2026-08-21-i felhasználói visszajelzés:** a videó a riportban KIZÁRÓLAG linkként
 * jelenjen meg (ne beágyazott lejátszóként/előnézetként), lásd `DefectsGallery.tsx`
 * ugyanezen elvét, `isVideoUrl` (`lib/reports/media.ts`) dönti el, melyik URL videó.
 */
export function GeneralPhotosGallery({ photos }: GeneralPhotosGalleryProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (photos.length === 0) return null;

  return (
    <section className="border-t border-bmw-hairline py-16 first:border-t-0 first:pt-0">
      <SectionHeading eyebrow="Áttekintés" title="Gépjármű fotók" />

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((url, index) =>
          isVideoUrl(url) ? (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex aspect-[4/3] flex-col items-center justify-center gap-2 overflow-hidden rounded-none border border-bmw-hairline-strong bg-bmw-surface-card transition-colors hover:border-bmw-ink"
            >
              <Video className="h-6 w-6 text-bmw-muted-soft" />
              <span className="text-[12px] font-light text-bmw-body">Videó megtekintése</span>
            </a>
          ) : (
            <button
              key={url}
              type="button"
              onClick={() => setLightboxUrl(url)}
              className="group relative aspect-[4/3] overflow-hidden rounded-none border border-bmw-hairline-strong bg-bmw-surface-card"
              aria-label={`${index + 1}. fotó megnyitása nagyobb nézetben`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Gépjármű fotó ${index + 1}`}
                className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
              />
            </button>
          )
        )}
      </div>

      {lightboxUrl && <MediaLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </section>
  );
}
