import { passwordRules } from '@auth-app/shared';

/**
 * Live password requirements, from the same rules the API enforces. The segmented meter is a
 * visual summary only; the list carries the met / not met state for screen readers.
 */
export function PasswordChecklist({ password }: { password: string }) {
  const results = passwordRules.map((rule) => ({ ...rule, met: rule.test(password) }));
  const metCount = results.filter((rule) => rule.met).length;

  return (
    <div className="pt-1">
      <div className="flex gap-1" aria-hidden="true">
        {results.map((rule, index) => (
          <span
            key={rule.id}
            className={`h-1 flex-1 rounded-full transition-colors ${
              index < metCount ? (metCount === results.length ? 'bg-ok' : 'bg-brand') : 'bg-line'
            }`}
          />
        ))}
      </div>
      <ul className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {results.map((rule) => (
          <li
            key={rule.id}
            data-rule={rule.id}
            data-met={rule.met}
            className={`flex items-center gap-2 ${rule.met ? 'text-ok' : 'text-muted'}`}
          >
            <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden="true">
              {rule.met ? (
                <path
                  d="M3.5 8.5l3 3 6-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <circle cx="8" cy="8" r="2.5" fill="currentColor" />
              )}
            </svg>
            <span>
              {rule.label}
              <span className="sr-only">{rule.met ? ' (met)' : ' (not met)'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
