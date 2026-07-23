import { describe, expect, it } from 'vitest';
import type { EmployeeCommissionHistoryItem } from '../api/employee-commission';
import {
  commissionStatusLabel,
  commissionStatusVariant,
  filterCommissionHistory,
  formatCommissionMoney,
} from './employee-commission-utils';

const history: EmployeeCommissionHistoryItem[] = [{
  id: 'mkt-1',
  sourceCycleId: 'cycle-1',
  finalizationCycleId: 'fin-1',
  periodStart: '2026-05-25',
  periodEnd: '2026-06-23',
  periodLabel: '2026-05-25 – 2026-06-23',
  companyId: 'co-1',
  companyName: 'Acme',
  teamId: 'team-1',
  teamName: 'Team Alpha',
  commissionType: 'marketing',
  method: 'Team Pool',
  target: 24,
  achieved: 20,
  commission: 12000,
  bonus: 500,
  carryForward: 0,
  status: 'pending_pay',
  uiStatus: 'pending',
}, {
  id: 'adm-1',
  sourceCycleId: 'cycle-2',
  finalizationCycleId: 'fin-2',
  periodStart: '2026-04-25',
  periodEnd: '2026-05-23',
  periodLabel: '2026-04-25 – 2026-05-23',
  companyId: 'co-1',
  companyName: 'Acme',
  teamId: null,
  teamName: null,
  commissionType: 'admin',
  method: 'Front Office',
  target: null,
  achieved: 22,
  commission: 8000,
  bonus: 0,
  carryForward: 0,
  status: 'paid',
  uiStatus: 'paid',
}];

describe('employee-commission-utils', () => {
  it('formats commission money', () => {
    expect(formatCommissionMoney(12000)).toContain('12,000');
    expect(formatCommissionMoney(null)).toBe('—');
  });

  it('labels and variants commission status', () => {
    expect(commissionStatusLabel('paid')).toBe('จ่ายแล้ว');
    expect(commissionStatusVariant('paid')).toBe('success');
    expect(commissionStatusVariant('rejected')).toBe('danger');
  });

  it('filters history by type, status, and search', () => {
    expect(filterCommissionHistory(history, {
      year: '2026',
      company: '',
      commissionType: 'admin',
      status: '',
      search: '',
    })).toHaveLength(1);
    expect(filterCommissionHistory(history, {
      year: '',
      company: '',
      commissionType: '',
      status: 'paid',
      search: '',
    })).toHaveLength(1);
    expect(filterCommissionHistory(history, {
      year: '',
      company: '',
      commissionType: '',
      status: '',
      search: 'Team Alpha',
    })).toHaveLength(1);
  });
});
