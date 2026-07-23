import { evaluateCondition } from './request-condition.util';

describe('request-condition.util', () => {
  it('evaluates equals on field values', () => {
    expect(evaluateCondition(
      { fieldKey: 'leaveType', operator: 'equals', value: 'sick' },
      { leaveType: 'sick' },
    )).toBe(true);
  });

  it('evaluates greater_than', () => {
    expect(evaluateCondition(
      { fieldKey: 'amount', operator: 'greater_than', value: 10000 },
      { amount: 15000 },
    )).toBe(true);
  });

  it('evaluates requester context', () => {
    expect(evaluateCondition(
      { fieldKey: 'requester.role', operator: 'equals', value: 'employee' },
      {},
      { role: 'employee' },
    )).toBe(true);
  });

  it('returns true when condition is missing', () => {
    expect(evaluateCondition(null, {})).toBe(true);
  });
});
