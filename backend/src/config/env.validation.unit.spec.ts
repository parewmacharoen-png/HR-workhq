// ============================================================================
// config/env.validation.unit.spec.ts
// ============================================================================

import 'reflect-metadata';
import { NodeEnv, validateEnv } from './env.validation';

const baseEnv = {
  NODE_ENV: NodeEnv.development,
  PORT: 3000,
  DATABASE_URL: 'postgresql://workhq:workhq@localhost:5432/workhq',
  JWT_SECRET: 'dev_secret_minimum_16',
};

describe('validateEnv production hardening', () => {
  it('allows short JWT in development', () => {
    expect(() => validateEnv(baseEnv)).not.toThrow();
  });

  it('rejects short JWT in production', () => {
    expect(() => validateEnv({
      ...baseEnv,
      NODE_ENV: NodeEnv.production,
      CORS_ORIGINS: 'https://app.example.com',
    })).toThrow(/JWT_SECRET must be at least 64/);
  });

  it('rejects wildcard CORS in staging', () => {
    expect(() => validateEnv({
      ...baseEnv,
      NODE_ENV: NodeEnv.staging,
      JWT_SECRET: 'a'.repeat(64),
      CORS_ORIGINS: '*',
    })).toThrow(/CORS_ORIGINS must not be \*/);
  });

  it('accepts valid production config', () => {
    const result = validateEnv({
      ...baseEnv,
      NODE_ENV: NodeEnv.production,
      JWT_SECRET: 'a'.repeat(64),
      CORS_ORIGINS: 'https://app.example.com',
    });
    expect(result.NODE_ENV).toBe(NodeEnv.production);
  });

  it('defaults MARKETING_ENABLED to false for HR mode', () => {
    const result = validateEnv(baseEnv);
    expect(result.MARKETING_ENABLED).toBe(false);
  });
});
