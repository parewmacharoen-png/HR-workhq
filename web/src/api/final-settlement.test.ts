import { describe, expect, it } from 'vitest';
import {
  approveFinalSettlement,
  cancelFinalSettlement,
  createFinalSettlementDraft,
  fetchEmployeePaidSettlementSummary,
  fetchFinalSettlement,
  markFinalSettlementPaid,
  recalculateFinalSettlement,
  submitFinalSettlement,
  updateFinalSettlement,
} from './final-settlement';

describe('final settlement API client', () => {
  it('exports workflow helpers', () => {
    expect(typeof createFinalSettlementDraft).toBe('function');
    expect(typeof fetchFinalSettlement).toBe('function');
    expect(typeof fetchEmployeePaidSettlementSummary).toBe('function');
    expect(typeof updateFinalSettlement).toBe('function');
    expect(typeof recalculateFinalSettlement).toBe('function');
    expect(typeof submitFinalSettlement).toBe('function');
    expect(typeof approveFinalSettlement).toBe('function');
    expect(typeof markFinalSettlementPaid).toBe('function');
    expect(typeof cancelFinalSettlement).toBe('function');
  });
});
