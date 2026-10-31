import { sha256Hex } from '../sessions/tokens.js';

/** 16-char SHA-256 prefix: correlates log lines for one email without logging the email. */
export function emailLogHash(email: string): string {
  return sha256Hex(email).slice(0, 16);
}
