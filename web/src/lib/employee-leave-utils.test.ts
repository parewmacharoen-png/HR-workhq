import { describe, expect, it } from 'vitest';
import {
  filterLeaveHistory,
  leaveStatusLabel,
  leaveStatusVariant,
  leaveTypeOptions,
  leaveYearOptions,
} from './employee-leave-utils';
import type { EmployeeLeaveHistoryItem } from '../api/employee-leave';

const base = (overrides: Partial<EmployeeLeaveHistoryItem>): EmployeeLeaveHistoryItem => ({
  id: 'lr-1',
  requestDate: '2026-06-01T10:00:00.000Z',
  leaveTypeCode: 'annual',
  leaveTypeName: 'Annual leave',
  startDate: '2026-06-10',
  endDate: '2026-06-11',
  days: 2,
  status: 'approved',
  approverName: 'Owner User',
  reason: 'Trip',
  workflowInstanceId: 'wf-1',
  ...overrides,
});

describe('employee leave utils', () => {
  it('maps leave status labels and colors', () => {
    expect(leaveStatusLabel('pending')).toBe('รออนุมัติ');
    expect(leaveStatusVariant('approved')).toBe('success');
    expect(leaveStatusVariant('rejected')).toBe('danger');
    expect(leaveStatusVariant('cancelled')).toBe('neutral');
  });

  it('filters by year, type, status, and search', () => {
    const items = [
      base({ id: 'a' }),
      base({ id: 'b', leaveTypeCode: 'sick', leaveTypeName: 'Sick leave', status: 'pending', requestDate: '2025-12-01T10:00:00.000Z', approverName: null }),
    ];
    expect(filterLeaveHistory(items, { year: '2026', leaveType: '', status: '', search: '' })).toHaveLength(1);
    expect(filterLeaveHistory(items, { year: '', leaveType: 'sick', status: '', search: '' })).toHaveLength(1);
    expect(filterLeaveHistory(items, { year: '', leaveType: '', status: 'pending', search: '' })).toHaveLength(1);
    expect(filterLeaveHistory(items, { year: '', leaveType: '', status: '', search: 'owner user' })).toHaveLength(1);
  });

  it('builds year and leave type options', () => {
    const items = [
      base({ requestDate: '2026-06-01T10:00:00.000Z' }),
      base({ id: 'lr-2', leaveTypeCode: 'sick', leaveTypeName: 'Sick leave', requestDate: '2025-06-01T10:00:00.000Z' }),
    ];
    expect(leaveYearOptions(items, 2026)).toEqual(['2026', '2025']);
    expect(leaveTypeOptions(items).map((row) => row.code).sort()).toEqual(['annual', 'sick']);
  });
});
