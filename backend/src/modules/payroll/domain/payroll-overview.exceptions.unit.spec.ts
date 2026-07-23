import {
  collectPayrollOverviewExceptions,
  derivePayrollStatus,
  maskBankAccountNo,
} from '../domain/payroll-overview.exceptions';

describe('collectPayrollOverviewExceptions', () => {
  it('flags missing bank, zero net, and pending adjustment', () => {
    const flags = collectPayrollOverviewExceptions({
      items: [{ itemType: 'bonus', note: 'manual bonus', sourceRefType: 'manual' }],
      netPayAmount: 0,
      bank: null,
      employmentStatus: 'active',
      hasPaidFinalSettlement: false,
    });

    expect(flags).toEqual(expect.arrayContaining([
      'missing_bank_account',
      'net_pay_non_positive',
      'pending_adjustment',
    ]));
  });

  it('flags inactive employee without paid final settlement', () => {
    const flags = collectPayrollOverviewExceptions({
      items: [{ itemType: 'salary', note: 'payroll_builder | salary', sourceRefType: null }],
      netPayAmount: 10000,
      bank: { accountNo: '1234567890', accountName: 'Test User' },
      employmentStatus: 'terminated',
      hasPaidFinalSettlement: false,
    });

    expect(flags).toContain('inactive_without_exit_settlement');
  });

  it('flags missing bank account name when account number exists', () => {
    const flags = collectPayrollOverviewExceptions({
      items: [],
      netPayAmount: 1000,
      bank: { accountNo: '1234567890', accountName: '   ' },
      employmentStatus: 'active',
      hasPaidFinalSettlement: false,
    });

    expect(flags).toContain('missing_bank_account_name');
  });
});

describe('maskBankAccountNo', () => {
  it('masks all but last four digits', () => {
    expect(maskBankAccountNo('1234567890')).toBe('****7890');
  });
});

describe('derivePayrollStatus', () => {
  it('returns exception when flagged', () => {
    expect(derivePayrollStatus(true, 1000, true)).toBe('exception');
  });

  it('returns no_items when empty', () => {
    expect(derivePayrollStatus(false, 0, false)).toBe('no_items');
  });
});
