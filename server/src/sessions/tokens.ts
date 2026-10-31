import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 random bytes, base64url (43 chars): session IDs, CSRF tokens, refresh tokens. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Constant-time string comparison (length is not secret: every token has the same length). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
