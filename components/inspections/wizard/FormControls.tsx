import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Linear design system (linear.md) `text-input` tokenje -- surface-1 háttér,
 * rounded-md, hairline szegély, fókuszban primary-focus keret. Ezeket a mezőket
 * a wizard mind az öt lépése újrahasznosítja, hogy a form-vizuál konzisztens maradjon.
 */

const FIELD_BASE =
  'h-11 w-full rounded-md border border-linear-hairline bg-linear-surface-1 px-3 text-[14px] text-linear-ink ' +
  'placeholder:text-linear-ink-subtle transition-colors focus:border-linear-primary focus:outline-none ' +
  'focus:ring-2 focus:ring-linear-primary/30';

interface FieldWrapperProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
}

function FieldLabel({ label, htmlFor, hint }: FieldWrapperProps) {
  return (
    <div className="flex items-baseline justify-between">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-linear-ink-muted">
        {label}
      </label>
      {hint && <span className="text-[12px] text-linear-ink-subtle">{hint}</span>}
    </div>
  );
}

/** Szigorú adatvalidáció (PROJEKT_INSTRUKCIOK.md, "Szigorú adatvalidáció" lépés) -- ha a
 * `error` prop meg van adva, piros keret + piros hibaszöveg jelenik meg a mező alatt. */
function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <span role="alert" className="text-[12px] text-linear-danger">
      {error}
    </span>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement>, FieldWrapperProps {}

export function TextField({ label, hint, error, id, className, ...props }: TextFieldProps) {
  const fieldId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} htmlFor={fieldId} hint={hint} />
      <input
        id={fieldId}
        aria-invalid={!!error}
        className={cn(FIELD_BASE, error && 'border-linear-danger focus:border-linear-danger focus:ring-linear-danger/30', className)}
        {...props}
      />
      <FieldError error={error} />
    </div>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldWrapperProps {
  options: string[];
  placeholder?: string;
}

export function SelectField({ label, hint, error, id, className, options, placeholder, ...props }: SelectFieldProps) {
  const fieldId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} htmlFor={fieldId} hint={hint} />
      <select
        id={fieldId}
        aria-invalid={!!error}
        className={cn(FIELD_BASE, 'appearance-none', error && 'border-linear-danger focus:border-linear-danger focus:ring-linear-danger/30', className)}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <FieldError error={error} />
    </div>
  );
}

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldWrapperProps {}

export function TextareaField({ label, hint, id, className, ...props }: TextareaFieldProps) {
  const fieldId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} htmlFor={fieldId} hint={hint} />
      <textarea
        id={fieldId}
        className={cn(
          'min-h-[96px] w-full resize-y rounded-md border border-linear-hairline bg-linear-surface-1 px-3 py-2.5',
          'text-[14px] text-linear-ink placeholder:text-linear-ink-subtle transition-colors',
          'focus:border-linear-primary focus:outline-none focus:ring-2 focus:ring-linear-primary/30',
          className
        )}
        {...props}
      />
    </div>
  );
}
