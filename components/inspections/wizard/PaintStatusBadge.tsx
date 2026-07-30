import { PAINT_STATUS_LABEL } from '@/lib/inspections/constants';
import type { PaintStatus } from '@/lib/inspections/types';

const STATUS_STYLES: Record<PaintStatus, string> = {
  gyari: 'bg-[#122a1a] text-linear-success',
  ujrafujt: 'bg-[#3a3320] text-[#e0b84b]',
  gittelt: 'bg-[#3a1a1a] text-[#e05a5a]',
};

const DOT_STYLES: Record<PaintStatus, string> = {
  gyari: 'bg-linear-success',
  ujrafujt: 'bg-[#e0b84b]',
  gittelt: 'bg-[#e05a5a]',
};

/**
 * Automatikus állapot-badge a beírt mikron érték alapján
 * (PROJEKT_INSTRUKCIOK.md 5.B.2: Gyári / Újrafújt / Gittelt).
 */
export function PaintStatusBadge({ status }: { status: PaintStatus }) {
  return (
    <span
      className={
        'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ' +
        STATUS_STYLES[status]
      }
    >
      <span className={'h-1.5 w-1.5 rounded-full ' + DOT_STYLES[status]} />
      {PAINT_STATUS_LABEL[status]}
    </span>
  );
}
