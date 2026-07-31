import { PAINT_STATUS_LABEL } from '@/lib/inspections/constants';
import type { PaintStatus } from '@/lib/inspections/types';

const STATUS_STYLES: Record<PaintStatus, string> = {
  gyari: 'bg-linear-success-soft text-linear-success',
  ujrafujt: 'bg-linear-warning-soft text-linear-warning',
  gittelt: 'bg-linear-danger-soft text-linear-danger',
};

const DOT_STYLES: Record<PaintStatus, string> = {
  gyari: 'bg-linear-success',
  ujrafujt: 'bg-linear-warning',
  gittelt: 'bg-linear-danger',
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
