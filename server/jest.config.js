/**
 * Unit (`src/**\/*.spec.ts`) and e2e (`test/**\/*.e2e-spec.ts`) tests.
 * Run with `--experimental-vm-modules` (see the `test` script): NestJS 12 is ESM-only and
 * Jest can `require()` ES modules from this CommonJS code only with that flag (Node >= 24.9).
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  // Sources use NodeNext-style `.js` specifiers; map them back to the `.ts` files.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testTimeout: 30_000,
};
