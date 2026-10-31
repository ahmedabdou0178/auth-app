import { z } from 'zod';

// Imported first in main.tsx. zod's JIT compiles validators with `new Function`, which the
// strict Content-Security-Policy (script-src 'self', no 'unsafe-eval') forbids.
z.config({ jitless: true });
