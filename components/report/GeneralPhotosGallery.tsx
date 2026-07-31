'use client';

import { useState } from 'react';
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
 */
export function GeneralPhotosGallery({ photos }: GeneralPhotosGalleryProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (photos.length === 0) return null;

  return (
    <section className="border-t border-bmw-hairline py-16 first:border-t-0 first:pt-0">
      <SectionHeading eyebrow="Áttekintés" title="Gépjármű fotók" />

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((url, index) => (
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
        ))}
      </div>

      {lightboxUrl && <MediaLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </section>
  );
}
