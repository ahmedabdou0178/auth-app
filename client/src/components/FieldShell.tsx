import { type ReactNode, useId } from 'react';

export interface FieldAria {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

interface FieldShellProps {
  label: string;
  error?: string | undefined;
  /** Help shown under the input and announced with it (e.g. the password checklist). */
  description?: ReactNode;
  children: (aria: FieldAria) => ReactNode;
}

export const inputClassName =
  'block w-full rounded-md border border-line bg-white px-3 py-2.5 text-[15px] text-ink ' +
  'placeholder:text-muted/70 aria-invalid:border-danger';

/** Label, input slot, description and error, wired together for assistive tech. */
export function FieldShell({ label, error, description, children }: FieldShellProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const describedBy =
    [error ? errorId : null, description ? descriptionId : null].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
      {description && <div id={descriptionId}>{description}</div>}
    </div>
  );
}
