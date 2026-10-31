import { type InputHTMLAttributes, type ReactNode, type Ref, useState } from 'react';
import { FieldShell, inputClassName } from './FieldShell';

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string;
  error?: string | undefined;
  description?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

/** Password input with a show/hide toggle. */
export function PasswordField({ label, error, description, ...inputProps }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <FieldShell label={label} error={error} description={description}>
      {(aria) => (
        <div className="relative">
          <input
            {...inputProps}
            {...aria}
            type={visible ? 'text' : 'password'}
            className={`${inputClassName} pr-16`}
          />
          <button
            type="button"
            onClick={() => {
              setVisible((value) => !value);
            }}
            aria-controls={aria.id}
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="absolute inset-y-1 right-1 rounded px-2.5 text-sm font-medium text-brand hover:bg-mist"
          >
            {visible ? 'Hide' : 'Show'}
          </button>
        </div>
      )}
    </FieldShell>
  );
}
