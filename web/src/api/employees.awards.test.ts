import { describe, expect, it } from 'vitest';
import { th } from '../i18n/th-labels';

describe('employee awards labels', () => {
  it('includes EMP-011 recognition types in Thai labels', () => {
    expect(th.employeeDetail.recognitionTypes.SERVICE_AWARD_1_YEAR).toContain('1');
    expect(th.employeeDetail.recognitionTypes.BEST_ATTENDANCE).toBeTruthy();
    expect(th.employeeDetail.recognitionTypes.TOP_MARKETING).toBeTruthy();
  });
});
