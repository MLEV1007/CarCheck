interface StatsBarProps {
  total: number;
  draft: number;
  completed: number;
}

/**
 * Linear design system (linear.md): `feature-card` geometria (surface-1, rounded-lg,
 * hairline border) újrahasznosítva összegző statisztikai kártyaként.
 */
export function StatsBar({ total, draft, completed }: StatsBarProps) {
  const stats: { label: string; value: number }[] = [
    { label: 'Összes vizsgálat', value: total },
    { label: 'Folyamatban (piszkozat)', value: draft },
    { label: 'Befejezett / publikált', value: completed },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg border border-linear-hairline bg-linear-surface-1 px-5 py-4">
          <p className="text-[12px] font-medium uppercase tracking-[0.4px] text-linear-ink-subtle">
            {stat.label}
          </p>
          <p className="mt-1.5 font-mono text-[26px] font-semibold tabular-nums text-linear-ink">
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}
