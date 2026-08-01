import { AlertTriangle } from 'lucide-react';
import { SectionHeading } from '@/components/report/SectionHeading';
import { RIM_TYPE_LABEL, TIRE_AGE_WARNING_YEARS, TIRE_POSITIONS } from '@/lib/inspections/constants';
import { decodeDot } from '@/lib/inspections/tireDot';
import type { PublicReportTiresData } from '@/lib/reports/types';

interface TiresCardProps {
  tires: PublicReportTiresData;
}

/**
 * Gumiabroncsok kártya (PROJEKT_INSTRUKCIOK.md, "3 új szakértői modul" lépés, 3. pont) --
 * vizuális 4-kerekes elrendezés (`TIRE_POSITIONS` sorrendje -- fl, fr, rl, rr -- egy
 * `sm:grid-cols-2` rácsban PONTOSAN a jármű elölnézeti elrendezését adja: 1. sor bal/jobb
 * ELSŐ, 2. sor bal/jobb HÁTSÓ kerék). A DOT kódot itt, a Server Componentben dekódoljuk
 * újra a `decodeDot()` tiszta függvénnyel -- a publikus riport NEM a wizardban kliens-oldalon
 * számolt értéket jeleníti meg, hanem a tárolt DOT kódból mindig frissen számolja ki a
 * gyártási hetet/évet és a "koros gumiabroncs" (5+ év) figyelmeztetést.
 */
export function TiresCard({ tires }: TiresCardProps) {
  const hasAnyData = TIRE_POSITIONS.some(({ position }) => {
    const tire = tires[position];
    return tire && (tire.mm != null || tire.dot);
  });

  if (!hasAnyData) return null;

  const hasGeneralInfo = Boolean(tires.rim_type || tires.brand);

  return (
    <section className="border-t border-bmw-hairline py-16 first:border-t-0 first:pt-0">
      <SectionHeading eyebrow="Kerekek" title="Gumiabroncsok állapota" />

      {hasGeneralInfo && (
        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 border-b border-bmw-hairline pb-6">
          {tires.rim_type && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-bmw-muted">Felni típusa</p>
              <p className="mt-0.5 text-[15px] font-bold text-bmw-ink">{RIM_TYPE_LABEL[tires.rim_type]}</p>
            </div>
          )}
          {tires.brand && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-bmw-muted">Gumiabroncs márkája</p>
              <p className="mt-0.5 text-[15px] font-bold text-bmw-ink">{tires.brand}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TIRE_POSITIONS.map(({ position, label }) => {
          const tire = tires[position];
          const decoded = tire?.dot ? decodeDot(tire.dot) : null;
          const isOld = decoded?.isOld ?? false;

          return (
            <div
              key={position}
              className={
                'rounded-none border px-5 py-4 ' +
                (isOld ? 'border-bmw-warning bg-[#fef8ec]' : 'border-bmw-hairline-strong bg-bmw-surface-card')
              }
            >
              <p className="text-[13px] font-bold uppercase tracking-[0.5px] text-bmw-muted">{label}</p>

              <div className="mt-2 flex items-end justify-between gap-3">
                <span className="text-[28px] font-bold tabular-nums text-bmw-ink">
                  {tire?.mm != null ? tire.mm : '—'}
                  <span className="ml-1 text-[14px] font-light text-bmw-muted">mm</span>
                </span>
                {tire?.dot && <span className="font-mono text-[13px] text-bmw-muted">DOT {tire.dot}</span>}
              </div>

              {decoded && (
                <p
                  className={
                    'mt-3 flex items-center gap-1.5 text-[12px] font-bold ' +
                    (isOld ? 'text-[#92620a]' : 'text-bmw-muted')
                  }
                >
                  {isOld && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                  Gyártás: {decoded.label}
                  {isOld ? ` -- Koros gumiabroncs (${TIRE_AGE_WARNING_YEARS}+ év)` : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
