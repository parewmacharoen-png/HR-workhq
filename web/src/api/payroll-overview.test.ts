import { describe, expect, it } from 'vitest';
import {
  fetchPayrollOverview,
  fetchPayrollOverviewEmployeeDetail,
  logPayrollOverviewExportInitiated,
} from './payroll-overview';

describe('payroll overview API client', () => {
  it('exports overview helpers', () => {
    expect(typeof fetchPayrollOverview).toBe('function');
    expect(typeof fetchPayrollOverviewEmployeeDetail).toBe('function');
    expect(typeof logPayrollOverviewExportInitiated).toBe('function');
  });
});
