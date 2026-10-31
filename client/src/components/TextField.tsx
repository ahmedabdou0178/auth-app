import type { InputHTMLAttributes, Ref } from 'react';
import { FieldShell, inputClassName } from './FieldShell';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string | undefined;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({ label, error, ...inputProps }: TextFieldProps) {
  return (
    <FieldShell label={label} error={error}>
      {(aria) => <input {...inputProps} {...aria} className={inputClassName} />}
    </FieldShell>
  );
}
