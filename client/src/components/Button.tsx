import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Disables the button and shows a spinner next to the label. */
  pending?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong disabled:bg-brand/70',
  secondary:
    'border border-line bg-white text-ink hover:border-muted hover:bg-mist disabled:text-muted',
};

export function Button({
  variant = 'primary',
  pending = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={Boolean(disabled) || pending}
      aria-busy={pending || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {pending && <Spinner />}
      {children}
    </button>
  );
}
