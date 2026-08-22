interface StatusBadgeProps {
  isDraft: boolean;
}

/**
 * Linear design system (linear.md): `status-badge`, surface-2 alapon, rounded-pill,
 * caption tipográfia. A draft/completed megkülönböztetést egy tompított sárga (draft)
 * és a `{colors.semantic-success}` (#27a644) zöld (completed) jelzi, kis színes ponttal.
 */
export function StatusBadge({ isDraft }: StatusBadgeProps) {
  return (
    <span
      className={
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ' +
        (isDraft ? 'bg-linear-warning-soft text-linear-warning' : 'bg-linear-success-soft text-linear-success')
      }
    >
      <span className={'h-1.5 w-1.5 rounded-full ' + (isDraft ? 'bg-linear-warning' : 'bg-linear-success')} />
      {isDraft ? 'Piszkozat' : 'Befejezett'}
    </span>
  );
}
