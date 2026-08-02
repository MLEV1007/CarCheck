import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { SectionHeading } from '@/components/report/SectionHeading';
import { FINAL_ASSESSMENT_RECOMMENDATION_LABEL } from '@/lib/inspections/constants';
import { formatHuf } from '@/lib/format';
import type { PublicReportFinalAssessment } from '@/lib/reports/types';
import type { FinalAssessmentRecommendation } from '@/lib/inspections/types';

interface FinalAssessmentCardProps {
  finalAssessment: PublicReportFinalAssessment;
}

/** Javaslat jelvény vizuál kulcsa -- `recommended` pozitív (zöld), `conditional`
 * figyelmeztető (sárga, ugyanaz a `bmw-warning` token, mint a `ServiceHistoryCard`
 * `partial` státuszánál), `not_recommended` negatív (piros, ugyanaz a minta, mint a
 * `DiagnosticsCard` hibakód-jelvényeinél). */
const RECOMMENDATION_TONE: Record<FinalAssessmentRecommendation, { icon: typeof CheckCircle2; className: string }> = {
  recommended: { icon: CheckCircle2, className: 'border-bmw-success bg-[#f0faf3] text-bmw-ink' },
  conditional: { icon: AlertTriangle, className: 'border-bmw-warning bg-[#fef8ec] text-bmw-ink' },
  not_recommended: { icon: XCircle, className: 'border-bmw-error bg-[#fdedec] text-bmw-ink' },
};

/**
 * Végső Szakvélemény & Várható Költségek kártya (PROJEKT_INSTRUKCIOK.md, "Végső
 * Szakvélemény & Várható Költségek modul" lépés) -- a vizsgálatot lezáró szakértői
 * összegzés: A) javaslat-jelvény, B) várható szervizköltség-sáv + megjegyzés, C) szabad
 * szöveges szakvélemény. TELJESEN OPCIONÁLIS -- ha a vizsgáló egyetlen mezőt sem
 * töltött ki, a kártya `return null`-t ad, a szekció EGYÁLTALÁN nem jelenik meg a
 * publikus riporton (ugyanaz a minta, mint a `ServiceHistoryCard`/`EquipmentMatrix`-nél).
 * BMW design: `rounded-none`, hairline szegélyű kártyák/sorok.
 */
export function FinalAssessmentCard({ finalAssessment }: FinalAssessmentCardProps) {
  const hasRecommendation = finalAssessment.recommendation !== null;
  const hasCostRange = finalAssessment.estimated_cost_min !== null || finalAssessment.estimated_cost_max !== null;
  const hasCostNotes = Boolean(finalAssessment.cost_notes?.trim());
  const hasSummary = Boolean(finalAssessment.summary_text?.trim());

  if (!hasRecommendation && !hasCostRange && !hasCostNotes && !hasSummary) return null;

  const tone = finalAssessment.recommendation ? RECOMMENDATION_TONE[finalAssessment.recommendation] : null;
  const ToneIcon = tone?.icon;

  return (
    <section className="border-t border-bmw-hairline py-16 first:border-t-0 first:pt-0">
      <SectionHeading eyebrow="Szakértői összegzés" title="Végső Szakvélemény" />

      {finalAssessment.recommendation && tone && ToneIcon && (
        <div className={'mt-8 flex items-center gap-3 rounded-none border px-5 py-4 ' + tone.className}>
          <ToneIcon className="h-5 w-5 shrink-0" />
          <p className="text-[15px] font-bold">{FINAL_ASSESSMENT_RECOMMENDATION_LABEL[finalAssessment.recommendation]}</p>
        </div>
      )}

      {hasCostRange && (
        <div className="mt-8 border border-bmw-hairline p-5">
          <p className="text-[13px] font-bold uppercase tracking-[1px] text-bmw-muted">Várható szervizköltség</p>
          <p className="mt-2 font-mono text-[22px] font-bold text-bmw-ink">
            {finalAssessment.estimated_cost_min !== null ? formatHuf(finalAssessment.estimated_cost_min) : '—'}
            {' – '}
            {finalAssessment.estimated_cost_max !== null ? formatHuf(finalAssessment.estimated_cost_max) : '—'}
          </p>
          {hasCostNotes && (
            <p className="mt-2 text-[14px] font-light leading-relaxed text-bmw-body">{finalAssessment.cost_notes}</p>
          )}
        </div>
      )}

      {!hasCostRange && hasCostNotes && (
        <div className="mt-8 border border-bmw-hairline p-5">
          <p className="text-[13px] font-bold uppercase tracking-[1px] text-bmw-muted">Költség-megjegyzés</p>
          <p className="mt-2 text-[14px] font-light leading-relaxed text-bmw-body">{finalAssessment.cost_notes}</p>
        </div>
      )}

      {hasSummary && (
        <div className="mt-8">
          <p className="text-[13px] font-bold uppercase tracking-[1px] text-bmw-muted">Összefoglaló</p>
          <p className="mt-3 whitespace-pre-line text-[15px] font-light leading-relaxed text-bmw-body">
            {finalAssessment.summary_text}
          </p>
        </div>
      )}
    </section>
  );
}
