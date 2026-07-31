import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { SectionHeading } from '@/components/report/SectionHeading';
import type { PublicReportDiagnostics } from '@/lib/reports/types';

interface DiagnosticsCardProps {
  diagnostics: PublicReportDiagnostics;
}

/**
 * Diagnosztika kártya (PROJEKT_INSTRUKCIOK.md, "3 új szakértői modul" lépés, 3. pont) --
 * zöld "OBD Tiszta" jelvény, ha nincs hibakód, egyébként szembetűnő piros hibalista.
 * BMW design: `rounded-none`, hairline szegélyű kártyák/sorok.
 */
export function DiagnosticsCard({ diagnostics }: DiagnosticsCardProps) {
  const codes = diagnostics.codes ?? [];

  return (
    <section className="border-t border-bmw-hairline py-16 first:border-t-0 first:pt-0">
      <SectionHeading eyebrow="OBD Kiolvasás" title="Diagnosztika" />

      {diagnostics.no_dtc ? (
        <div className="mt-8 flex items-center gap-3 rounded-none border border-bmw-success bg-[#f0faf3] px-5 py-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-bmw-success" />
          <p className="text-[15px] font-bold text-bmw-ink">OBD Tiszta -- nincs rögzített hibakód</p>
        </div>
      ) : codes.length === 0 ? (
        <p className="mt-8 text-[15px] font-light text-bmw-body">
          A diagnosztikai kiolvasás során ezen a járművön nem került rögzítésre hibakód.
        </p>
      ) : (
        <div className="mt-8 flex flex-col divide-y divide-bmw-hairline border border-bmw-hairline">
          {codes.map((entry, index) => (
            <div
              key={`${entry.code}-${index}`}
              className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-6"
            >
              <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-none border border-bmw-error bg-[#fdedec] px-3 py-1.5 font-mono text-[14px] font-bold text-bmw-error">
                <AlertTriangle className="h-3.5 w-3.5" />
                {entry.code}
              </span>
              <p className="min-w-0 flex-1 text-[15px] font-light leading-relaxed text-bmw-body">
                {entry.description || 'Nincs megadva leírás.'}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
