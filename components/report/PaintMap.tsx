import { PaintCanvas } from '@/components/inspections/PaintCanvas';
import { PAINT_STATUS_LABEL, getOverallPaintAverage, getPaintStatus } from '@/lib/inspections/constants';
import type { PublicReportPaintMeasurement } from '@/lib/reports/types';
import { SectionHeading } from '@/components/report/SectionHeading';

/**
 * Karosszéria & festékvastagság térkép (PROJEKT_INSTRUKCIOK.md 5.C + "Rétegvastagság-mérő
 * Szabadkézi (Free-form Canvas) átalakítása" lépés): UGYANAZ a `cars.webp` referenciaképre
 * épülő `PaintCanvas` komponens fut itt, mint a Wizard 6. lépésében (`mode="view"`,
 * `theme="light"` -- BMW design tokenek), hogy az ügyfél PONTOSAN ugyanazt a
 * színkódolt buborékos hőtérképet lássa, amit a vizsgáló a helyszínen rögzített, a
 * TENYLEGES koordinátákon (nincs előre definiált elem/hotspot). `mode="view"`-ban a
 * kép kattintása nem hoz létre új pontot, csak a meglévő buborékok értéke tekinthető
 * meg egy popoverben.
 *
 * A TELJES AUTÓ ÁTLAGA + a mért pontok száma egy kiemelt kártyában látszik a canvas
 * fölött.
 */
export function PaintMap({ measurements }: { measurements: PublicReportPaintMeasurement[] }) {
  if (measurements.length === 0) return null;

  const points = measurements.map((m) => ({ id: m.id, x: m.x, y: m.y, value: m.value }));

  const overallAverage = getOverallPaintAverage(points);
  const overallStatusLabel = overallAverage !== null ? PAINT_STATUS_LABEL[getPaintStatus(overallAverage)] : '—';

  return (
    <section className="border-t border-bmw-hairline py-16 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading eyebrow="Karosszéria" title="Festékvastagság-térkép" />
        <div className="flex items-center gap-3 rounded-none border border-bmw-hairline-strong bg-bmw-surface-card px-5 py-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-bmw-muted">Teljes autó átlaga</p>
            <p className="text-[22px] font-bold tabular-nums text-bmw-ink">
              {overallAverage}
              <span className="ml-1 text-[13px] font-light text-bmw-muted">µm</span>
            </p>
            <p className="text-[11px] font-light text-bmw-muted">
              {overallStatusLabel} · {measurements.length} pont mérve
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <PaintCanvas points={points} mode="view" theme="light" />
      </div>
    </section>
  );
}
