const DUPLICATE_KEY = 11000;

/** True for a MongoDB unique-index violation (E11000). */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY
  );
}
