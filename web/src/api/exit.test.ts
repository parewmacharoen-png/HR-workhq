import { describe, expect, it } from 'vitest';
import { cancelExitCase } from './exit';

describe('exit API client', () => {
  it('exports cancelExitCase helper', () => {
    expect(typeof cancelExitCase).toBe('function');
  });
});
