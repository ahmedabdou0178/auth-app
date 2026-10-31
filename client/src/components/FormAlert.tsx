/** Form-level error (wrong credentials, rate limit, server error), announced when it appears. */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger"
    >
      {message}
    </p>
  );
}
