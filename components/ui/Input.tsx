import { InputHTMLAttributes, ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';

// Stripe design system (stripe.md): `text-input` / `text-input-focused`
// -- rounded-sm (6px), 8px 12px padding, hairline-input border, fókuszban primary keret.
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** `ReactNode` (nem csak `string`) -- 2026-08-14, "Öröklött cégadatok" lépés: a
   * zárolt (Átvizsgálónak nem szerkeszthető) mezőknél a `SettingsForm.tsx` egy piros
   * tiltás-ikont fűz a címke mögé, ehhez kell a sima szövegnél bővebb típus. */
  label: ReactNode;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id ?? props.name;

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="font-sohne text-[13px] font-normal text-stripe-ink-secondary"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          className={cn(
            'h-11 rounded-stripe-sm border bg-white px-3',
            'font-sohne text-[15px] text-stripe-ink placeholder:text-stripe-ink-mute',
            'transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-stripe-primary/30 focus:border-stripe-primary',
            'disabled:cursor-not-allowed disabled:bg-stripe-canvas-soft disabled:text-stripe-ink-mute',
            error ? 'border-stripe-ruby' : 'border-stripe-hairline-input',
            className
          )}
          {...props}
        />
        {error && (
          <span className="font-sohne text-[13px] text-stripe-ruby" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
