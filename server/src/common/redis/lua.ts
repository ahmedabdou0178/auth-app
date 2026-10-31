/** Parses a Lua script reply that must be an array of integers. */
export function toIntegers(reply: unknown, expectedLength: number): number[] {
  if (
    !Array.isArray(reply) ||
    reply.length !== expectedLength ||
    !reply.every((value): value is number => typeof value === 'number')
  ) {
    throw new Error('Unexpected Redis script reply');
  }
  return reply;
}

/** Redis PTTL (ms; -1/-2 for none) → whole seconds remaining, never negative. */
export function pttlToSeconds(pttl: number): number {
  return pttl > 0 ? Math.ceil(pttl / 1000) : 0;
}
