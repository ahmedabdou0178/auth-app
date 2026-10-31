import { Link, type LinkProps } from 'react-router-dom';

export function TextLink({ className = '', ...props }: LinkProps) {
  return (
    <Link
      className={`font-semibold text-brand underline-offset-4 hover:underline ${className}`}
      {...props}
    />
  );
}
