import { Spinner } from './Spinner';

/** Shown while the session is restoring and while a lazy page loads. */
export function FullPageSpinner() {
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center text-brand">
      <Spinner className="size-7" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
