import { CAR_IMAGE_PANEL_NAMES } from '@/lib/inspections/carImageMap';
import { ImageHotspotDiagram, type CarDiagramPanelData } from '@/components/inspections/ImageHotspotDiagram';
import type { PublicReportPaintMeasurement } from '@/lib/reports/types';
import { SectionHeading } from '@/components/report/SectionHeading';

/**
 * Karosszéria & festékvastagság térkép (PROJEKT_INSTRUKCIOK.md 5.C + "Képalapú
 * interaktív rétegvastagság-mérő hőtérkép" lépés): UGYANAZ a `cars.webp` referenciaképre
 * épülő `ImageHotspotDiagram` komponens fut itt, mint a Wizard 6. lépésében
 * (`mode="view"`, `theme="light"` -- BMW design tokenek), hogy az ügyfél PONTOSAN
 * ugyanazt a színkódolt buborékos hőtérképet lássa, amit a vizsgáló a helyszínen
 * rögzített. Egy buborékra koppintva a pontos µm értékek (átlag + a 3 mérési pont, ha
 * elérhető) is megtekinthetők egy popover-ben.
 *
 * A TELJES AUTÓ ÁTLAGA egy kiemelt kártyában látszik a diagram fölött, az
 * `ImageHotspotDiagram` pedig minden hotspotot megjelenít (a nem mért elemeket üres,
 * pulzáló körrel), nem csak a ténylegesen rögzített `measurements` sorokat -- így a
 * diagram mindig a teljes autót mutatja, akkor is, ha csak néhány elem lett megmérve.
 */
export function PaintMap({ measurements }: { measurements: PublicReportPaintMeasurement[] }) {
  if (measurements.length === 0) return null;

  const measurementsByElement = new Map(measurements.map((m) => [m.element_name, m]));

  const diagramData: Record<string, CarDiagramPanelData> = Object.fromEntries(
    CAR_IMAGE_PANEL_NAMES.map((elementName) => {
      const row = measurementsByElement.get(elementName);
      if (!row) {
        return [elementName, { average: null, status: null }];
      }
      // A 3 nyers mérési pont KIZÁRÓLAG akkor kerül a részlet-panelre, ha ténylegesen
      // elérhető -- egy régi, a 3-pontos átalakítás ELŐTT mentett sornál (`point_1/2/3`
      // mind `null`) csak az átlag látszik, nem hazudunk 3 (valójában soha nem mért)
      // pontot az ügyfélnek.
      const points: [string, string, string] | null =
        row.point_1 != null && row.point_2 != null && row.point_3 != null
          ? [String(row.point_1), String(row.point_2), String(row.point_3)]
          : null;
      return [elementName, { average: row.micron_value, status: row.status, points }];
    })
  );

  const overallAverage =
    Math.round((measurements.reduce((sum, m) => sum + m.micron_value, 0) / measurements.length) * 10) / 10;
  const overallStatusLabel = overallAverage <= 150 ? 'Gyári' : overallAverage <= 250 ? 'Újrafújt / Javított' : 'Gittelt / Sérült';

  return (
    <section className="border-t border-bmw-hairline py-16 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading eyebrow="Karosszéria" title="Festékvastagság-térkép" />
        <div className="flex items-center gap-3 rounded-none border border-bmw-hairline-strong bg-bmw-surface-card px-5 py-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-bmw-muted">Összes elem átlaga</p>
            <p className="text-[22px] font-bold tabular-nums text-bmw-ink">
              {overallAverage}
              <span className="ml-1 text-[13px] font-light text-bmw-muted">µm</span>
            </p>
            <p className="text-[11px] font-light text-bmw-muted">{overallStatusLabel}</p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <ImageHotspotDiagram data={diagramData} mode="view" theme="light" />
      </div>
    </section>
  );
}
