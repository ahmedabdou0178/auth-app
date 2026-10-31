// The package ships `register-hooks.d.ts` next to `register-hooks.mjs`, which NodeNext
// resolution doesn't pair up; this mirrors the declarations it ships (v3.5).
declare module 'import-in-the-middle/register-hooks.mjs' {
  export interface RegisterHooksOptions {
    include?: (string | RegExp)[];
    exclude?: (string | RegExp)[];
    disableCjsSourceStripping?: boolean;
  }
  /** Synchronous in-thread loader hook via module.registerHooks() (Node >= 24.11.1). */
  export function register(options?: RegisterHooksOptions): void;
  export function supportsSyncHooks(): boolean;
}
