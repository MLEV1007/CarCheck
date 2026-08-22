'use client';

import { useState } from 'react';
import { DamageCanvas } from '@/components/inspections/DamageCanvas';
import { MediaLightbox } from '@/components/report/MediaLightbox';
import { SectionHeading } from '@/components/report/SectionHeading';
import type { PublicReportDamage } from '@/lib/reports/types';

interface DamageMapCardProps {
  damages: PublicReportDamage[];
}

/**
 * Sérülés- és Hibatérkép kártya a publikus riportban (BMW Corporate Design, 0px
 * lekerekítés). UGYANAZ a nézetenkénti autó-referenciaképekre épülő `DamageCanvas`
 * komponens fut itt, mint a Wizard 8. lépésében (`mode="view"`, `theme="light"`), hogy az ügyfél
 * PONTOSAN ugyanazokat a színkódolt markereket lássa a TÉNYLEGES koordinátákon, amiket a
 * vizsgáló a helyszínen rögzített, ugyanaz az elv, mint a `PaintMap.tsx`-nél.
 *
 * A `PublicReportDamage[]` (`photo_url`) itt alakul át a `DamageCanvas` várt
 * `DamagePointState`-forma alakjára (`file: null`, a `photo_url` a `previewUrl`-be
 * kerül), ugyanaz a minta, mint a `PaintMap.tsx` `measurements.map(...)`-je.
 *
 * `mode="view"`-ban a modal fotójára kattintva a `DamageCanvas` az `onOpenPhoto` propon
 * keresztül jelzi a szülőnek, hogy nyissa meg a `MediaLightbox`-ot, PONTOSAN ugyanaz a
 * kompozíció, mint a `DefectsGallery.tsx`-nél (`onOpenMedia`/`lightboxUrl` state).
 *
 * Ha nincs egyetlen rögzített sérülés/hiba sem, a szekció nem renderelődik (`return
 * null`), ugyanaz a minta, mint a `GeneralPhotosGallery`/`EquipmentMatrix`/`TiresCard`-nál.
 */
export function DamageMapCard({ damages }: DamageMapCardProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (damages.length === 0) return null;

  const points = damages.map((damage) => ({
    id: damage.id,
    x: damage.x,
    y: damage.y,
    view: damage.view ?? undefined,
    type: damage.type,
    title: damage.title,
    description: damage.description,
    file: null,
    previewUrl: damage.photo_url,
  }));

  return (
    <section className="border-t border-bmw-hairline py-16 first:border-t-0 first:pt-0">
      <SectionHeading
        eyebrow="Karosszéria"
        title={`Sérülés- és Hibatérkép (${damages.length} rögzített pont)`}
      />

      <div className="mt-8">
        <DamageCanvas points={points} mode="view" theme="light" onOpenPhoto={setLightboxUrl} />
      </div>

      {lightboxUrl && <MediaLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </section>
  );
}
