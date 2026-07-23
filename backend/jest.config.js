// ============================================================================
// jest.config.js
// Three test projects:
//   unit        – pure domain services (no DB, no NestJS, fastest)
//   integration – repository adapters (needs DB, set DATABASE_URL)
//   e2e         – full HTTP round-trips via supertest
//
// Run unit only:    npx jest --selectProjects unit
// Run all:          npx jest
// With coverage:    npx jest --selectProjects unit --coverage
// ============================================================================

'use strict';

const tsJestOptions = {
  tsconfig: {
    module: 'commonjs',
    target: 'ES2021',
    emitDecoratorMetadata: true,
    experimentalDecorators: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    strict: true,
    strictNullChecks: true,
    noImplicitAny: true,
    skipLibCheck: true,
  },
};

/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',

  // Integration suites boot Nest + hit PostgreSQL
  testTimeout: 120_000,

  projects: [
    // ── UNIT ──────────────────────────────────────────────────────────────────
    // Pure domain service tests. No I/O. Should complete in < 10s total.
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.unit.spec.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', tsJestOptions] },
      moduleNameMapper: { '^src/(.*)$': '<rootDir>/src/$1' },
    },

    // ── INTEGRATION ───────────────────────────────────────────────────────────
    // Full-stack HTTP tests against a real PostgreSQL instance.
    // Set DATABASE_URL before running: npm run test:int
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/integration/**/*.integration.spec.ts'],
      globalSetup: '<rootDir>/test/global-setup.ts',
      maxWorkers: 1,
      transform: { '^.+\\.ts$': ['ts-jest', tsJestOptions] },
      moduleNameMapper: { '^src/(.*)$': '<rootDir>/src/$1' },
    },

    // ── E2E ───────────────────────────────────────────────────────────────────
    // Full HTTP stack via supertest. Bootstraps the NestJS app in beforeAll.
    {
      displayName: 'e2e',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/**/*.e2e.spec.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', tsJestOptions] },
      moduleNameMapper: { '^src/(.*)$': '<rootDir>/src/$1' },
    },
  ],

  // Coverage configuration (activated with --coverage flag)
  collectCoverageFrom: [
    'src/modules/*/domain/services/*.ts',
    'src/modules/*/application/*.service.ts',
    'src/auth/**/*.ts',
    'src/common/**/*.ts',
    '!src/**/*.spec.ts',
  ],
  coverageReporters: ['text', 'text-summary', 'lcov'],
};
