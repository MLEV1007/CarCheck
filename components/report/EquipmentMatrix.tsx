import { CheckCircle2, XCircle } from 'lucide-react';
import { SectionHeading } from '@/components/report/SectionHeading';
import type { PublicReportEquipmentItem } from '@/lib/reports/types';

interface EquipmentMatrixProps {
  equipment: PublicReportEquipmentItem[];
}

/**
 * Felszereltség állapot-mátrix (PROJEKT_INSTRUKCIOK.md, "3 új szakértői modul" lépés,
 * 3. pont) -- letisztult, ikonikus lista a MŰKÖDŐ és NEM MŰKÖDŐ elemekről; a `na`
 * (nem releváns / nincs az autóban) elemek szándékosan nem jelennek meg itt, hogy a
 * riport csak a ténylegesen releváns felszereltségre hívja fel a figyelmet. BMW
 * design: `rounded-none`, szemantikus zöld/piros kártyák (státuszjelentés, nem
 * márka-akcentus -- ugyanaz az elv, mint a `PaintMap.tsx`-nél).
 */
export function EquipmentMatrix({ equipment }: EquipmentMatrixProps) {
  const relevant = equipment.filter((item) => item.status !== 'na');
  if (relevant.length === 0) return null;

  return (
    <section className="border-t border-bmw-hairline py-16 first:border-t-0 first:pt-0">
      <SectionHeading eyebrow="Kényelmi & Biztonsági Extrák" title="Felszereltség állapota" />

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {relevant.map((item) => {
          const isWorking = item.status === 'working';
          return (
            <div
              key={item.name}
              className={
                'flex items-center justify-between gap-3 rounded-none border px-5 py-4 ' +
                (isWorking ? 'border-bmw-success bg-[#f0faf3]' : 'border-bmw-error bg-[#fdedec]')
              }
            >
              <span className="text-[15px] font-bold text-bmw-ink">{item.name}</span>
              <span
                className={
                  'flex shrink-0 items-center gap-1.5 text-[13px] font-bold ' +
                  (isWorking ? 'text-[#166534]' : 'text-[#991b1b]')
                }
              >
                {isWorking ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {isWorking ? 'Működik' : 'Nem működik'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
