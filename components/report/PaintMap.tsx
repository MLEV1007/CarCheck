import { PAINT_STATUS_LABEL } from '@/lib/inspections/constants';
import type { PaintStatus } from '@/lib/inspections/types';
import type { PublicReportPaintMeasurement } from '@/lib/reports/types';
import { SectionHeading } from '@/components/report/SectionHeading';

const STATUS_CARD_STYLES: Record<PaintStatus, string> = {
  gyari: 'border-bmw-success bg-[#f0faf3]',
  ujrafujt: 'border-bmw-warning bg-[#fef8ec]',
  gittelt: 'border-bmw-error bg-[#fdedec]',
};

const STATUS_TEXT_STYLES: Record<PaintStatus, string> = {
  gyari: 'text-[#166534]',
  ujrafujt: 'text-[#92620a]',
  gittelt: 'text-[#991b1b]',
};

const STATUS_DOT_STYLES: Record<PaintStatus, string> = {
  gyari: 'bg-bmw-success',
  ujrafujt: 'bg-bmw-warning',
  gittelt: 'bg-bmw-error',
};

const LEGEND_ITEMS: Array<{ status: PaintStatus; range: string }> = [
  { status: 'gyari', range: '0–160 µm' },
  { status: 'ujrafujt', range: '161–300 µm' },
  { status: 'gittelt', range: '300+ µm' },
];

/**
 * Karosszéria & festékvastagság térkép (PROJEKT_INSTRUKCIOK.md 5.C): a rögzített
 * mikron-értékek rácsa, színkódolva a wizardban is használt (`getPaintStatus`)
 * gyári/újrafújt/gittelt-sérült besorolás szerint. BMW design: `rounded-none`,
 * hairline szegélyű kártyák, drámai 700-as szám a mikron értéknek.
 */
export function PaintMap({ measurements }: { measurements: PublicReportPaintMeasurement[] }) {
  if (measurements.length === 0) return null;

  return (
    <section className="py-16 first:pt-0">
      <SectionHeading eyebrow="Karosszéria" title="Festékvastagság-térkép" />

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {measurements.map((measurement) => (
          <div
            key={measurement.id}
            className={`flex items-center justify-between rounded-none border px-5 py-4 ${STATUS_CARD_STYLES[measurement.status]}`}
          >
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-bmw-ink">{measurement.element_name}</p>
              <p className={`mt-0.5 text-[13px] font-light ${STATUS_TEXT_STYLES[measurement.status]}`}>
                {PAINT_STATUS_LABEL[measurement.status]}
              </p>
            </div>
            <div className="ml-4 flex shrink-0 items-center gap-2">
              <span className={`h-2 w-2 rounded-none ${STATUS_DOT_STYLES[measurement.status]}`} />
              <span className="text-[20px] font-bold tabular-nums text-bmw-ink">
                {measurement.micron_value}
                <span className="ml-0.5 text-[13px] font-light text-bmw-muted">µm</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-bmw-hairline pt-6">
        {LEGEND_ITEMS.map((item) => (
          <span key={item.status} className="flex items-center gap-2 text-[13px] font-light text-bmw-muted">
            <span className={`h-2 w-2 rounded-none ${STATUS_DOT_STYLES[item.status]}`} />
            {PAINT_STATUS_LABEL[item.status]} ({item.range})
          </span>
        ))}
      </div>
    </section>
  );
}
