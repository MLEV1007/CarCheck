import { getSilhouetteSpec } from '@/lib/inspections/carSilhouette';
import type { CarBodyType, CarView } from '@/lib/inspections/carSilhouette';

interface CarSilhouetteProps {
  bodyType: CarBodyType;
  view: CarView;
  /** `dark` = Linear design tokenek (Wizard), `light` = BMW design tokenek (Publikus
   * riport), UGYANAZ a minta, mint a `PaintCanvas.tsx`/`DamageCanvas.tsx` `theme`
   * propja, amiknek ez a komponens a `next/image`-alapú `cars.webp` hátterét váltja le. */
  theme: 'dark' | 'light';
  className?: string;
}

/** A körvonal/ablak/kerék/fényszóró-lámpa színpalettája téma szerint, a `dark`
 * változat a Linear sötét felületeihez (`#0f1011`/`#17181c` közeli tónusok, halvány
 * `#3a3d46` hajszálvonalak), a `light` a BMW világos, sötétkék (`#1a2129`) körvonalú
 * "mérnöki vonalrajz" stílusához illeszkedik. */
const PALETTE: Record<
  'dark' | 'light',
  { body: string; outline: string; window: string; windowOutline: string; wheel: string; wheelHub: string; detail: string; light: string }
> = {
  dark: {
    body: '#17181c',
    outline: '#4b4d57',
    window: '#22242b',
    windowOutline: '#5e6ad2',
    wheel: '#0a0a0b',
    wheelHub: '#4b4d57',
    detail: '#3a3d46',
    light: '#5e6ad2',
  },
  light: {
    body: '#ffffff',
    outline: '#1a2129',
    window: '#eef3f8',
    windowOutline: '#1c69d4',
    wheel: '#1a2129',
    wheelHub: '#9ba3ad',
    detail: '#1a2129',
    light: '#1c69d4',
  },
};

/**
 * Autó-sziluett, a `public/cars.webp` raszter-referenciakép utódja (lásd
 * `lib/inspections/carSilhouette.ts` fájl-JSDoc a teljes indoklással). Kizárólag a
 * kiválasztott `(bodyType, view)` párhoz tartozó, a konténert kitöltő SVG-t rajzolja ki,
 * a kattintás-kezelés (mérési/hiba pont felvétele) VÁLTOZATLANUL a szülő
 * (`PaintCanvas`/`DamageCanvas`) konténerén történik, ez a komponens csak a vizuális
 * hátteret adja, `pointer-events-none`-nel.
 */
export function CarSilhouette({ bodyType, view, theme, className }: CarSilhouetteProps) {
  const spec = getSilhouetteSpec(bodyType, view);
  const c = PALETTE[theme];

  return (
    <svg
      viewBox={`0 0 ${spec.viewBoxWidth} ${spec.viewBoxHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className={'pointer-events-none absolute inset-0 h-full w-full select-none ' + (className ?? '')}
      role="img"
      aria-label={`Autó ${view === 'front' ? 'elölnézete' : view === 'rear' ? 'hátulnézete' : view === 'side' ? 'oldalnézete' : 'felülnézete'}`}
    >
      <path d={spec.outlineD} fill={c.body} stroke={c.outline} strokeWidth={3} strokeLinejoin="round" />
      <polygon points={spec.windowPoints} fill={c.window} stroke={c.windowOutline} strokeWidth={1.5} strokeLinejoin="round" />

      {spec.detailLines?.map((line, i) => (
        <line key={i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={c.detail} strokeWidth={1.5} strokeLinecap="round" />
      ))}

      {spec.headlights?.map((h, i) => (
        <ellipse key={i} cx={h.cx} cy={h.cy} rx={h.rx} ry={h.ry} fill={c.light} stroke={c.outline} strokeWidth={1} opacity={0.9} />
      ))}

      {spec.taillights?.map((t, i) => (
        <rect key={i} x={t.x} y={t.y} width={t.w} height={t.h} rx={2} fill={c.light} stroke={c.outline} strokeWidth={1} opacity={0.85} />
      ))}

      {spec.wheels?.map((w, i) => (
        <g key={i}>
          <circle cx={w.cx} cy={w.cy} r={w.r} fill={c.wheel} />
          <circle cx={w.cx} cy={w.cy} r={w.r * 0.42} fill={c.wheelHub} />
        </g>
      ))}
    </svg>
  );
}
