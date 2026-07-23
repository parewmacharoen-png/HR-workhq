import { describe, expect, it } from 'vitest';
import { normalizeEmployeeList, EMPTY_EMPLOYEE_LIST } from '../api/employees';

describe('employees api helpers', () => {
  it('normalizes empty response', () => {
    expect(normalizeEmployeeList(undefined)).toEqual(EMPTY_EMPLOYEE_LIST);
    expect(normalizeEmployeeList(null)).toEqual(EMPTY_EMPLOYEE_LIST);
  });

  it('normalizes legacy array response', () => {
    const rows = [{ id: '1', globalId: 'EMP000001', firstName: 'A', lastName: 'B', employmentStatus: 'active', telegramLinked: false, username: null }];
    expect(normalizeEmployeeList(rows)).toEqual({ items: rows, total: 1 });
  });

  it('normalizes envelope response', () => {
    expect(normalizeEmployeeList({ items: [], total: 0 })).toEqual({ items: [], total: 0 });
  });
});
