'use client';

import Image from 'next/image';
import { CAR_VIEW_IMAGE, CAR_VIEW_LABEL } from '@/lib/inspections/carViews';
import type { CarPointView } from '@/lib/inspections/carViews';

interface CarViewImageProps {
  view: CarPointView;
  className?: string;
}

/**
 * A kiválasztott `view`-hoz tartozó autó-referenciakép -- a `DamageCanvas.tsx` korábbi,
 * közvetlenül beágyazott `<Image src={CAR_IMAGE_SRC}>` blokkját váltja le, lásd
 * `lib/inspections/carViews.ts` fájl-JSDoc-ját a teljes indoklásért. A kattintás-kezelés
 * (sérülés-pont felvétele) VÁLTOZATLANUL a szülő (`DamageCanvas`) konténerén történik, ez a
 * komponens csak a vizuális hátteret adja, `pointer-events-none`-nel -- UGYANAZ a minta, mint
 * a (jelenleg használaton kívüli) `CarSilhouette.tsx`-é volt.
 *
 * A `key={view}` biztosítja, hogy nézetváltáskor a `next/image` egy VADONATÚJ `<img>`-ként
 * kezelje a cserét (ne próbáljon a régi elemre animálva átfedni két eltérő képarányú/tartalmú
 * képet), ugyanaz a minta, mint egy karusszélnél.
 */
export function CarViewImage({ view, className }: CarViewImageProps) {
  const spec = CAR_VIEW_IMAGE[view];

  return (
    <Image
      key={view}
      src={spec.src}
      alt={`Autó ${CAR_VIEW_LABEL[view].toLowerCase()} nézete a sérülések/hibák jelöléséhez`}
      fill
      sizes="(max-width: 640px) 100vw, 560px"
      className={
        'pointer-events-none select-none object-contain ' +
        (spec.mirror ? '[transform:scaleX(-1)] ' : '') +
        (className ?? '')
      }
      priority={false}
    />
  );
}
