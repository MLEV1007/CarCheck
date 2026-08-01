interface AuthDividerProps {
  label?: string;
}

/**
 * Letisztult elválasztó vonal a Passkey gomb és a Magic Link (email) form között.
 * Stripe design system: `{colors.hairline}` vonal, `{typography.micro-cap}` felirat.
 */
export function AuthDivider({ label = 'vagy' }: AuthDividerProps) {
  return (
    <div className="flex items-center gap-3" role="separator">
      <div className="h-px flex-1 bg-stripe-hairline" />
      <span className="font-sohne text-[11px] font-medium uppercase tracking-[0.6px] text-stripe-ink-mute">
        {label}
      </span>
      <div className="h-px flex-1 bg-stripe-hairline" />
    </div>
  );
}
