import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Stripe design system (stripe.md): `button-primary-pill` / `button-secondary`,
// rounded-full (pill), 8px 16px padding, button-md tipográfia (16px / 400).
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `danger`, destruktív műveletekhez (pl. "Fiók törlése"), `stripe-ruby` háttérrel,
   * lásd `DeleteAccountCard.tsx`. */
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', isLoading, fullWidth, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5',
          'font-sohne text-[16px] font-normal leading-none transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stripe-primary focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          fullWidth && 'w-full',
          variant === 'primary' &&
            'bg-stripe-primary text-white hover:bg-stripe-primary-deep active:bg-stripe-primary-press',
          variant === 'secondary' &&
            'border border-stripe-hairline bg-white text-stripe-primary hover:bg-stripe-canvas-soft',
          variant === 'danger' && 'bg-stripe-ruby text-white hover:opacity-90 active:opacity-80',
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
