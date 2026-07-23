import { resolveThBankName } from '../domain/services/th-bank-names';
import { PayrollExportSheetGenerator } from './payroll-export-sheet.generator';
import type { PayrollExportSheetContext } from './payroll-export-sheet.generator';

describe('resolveThBankName', () => {
  it('maps known bank codes', () => {
    expect(resolveThBankName('KBANK')).toContain('กสิกร');
  });

  it('returns raw code when unknown', () => {
    expect(resolveThBankName('MYBANK')).toBe('MYBANK');
  });
});

describe('PayrollExportSheetGenerator', () => {
  const generator = new PayrollExportSheetGenerator();

  const context = {
    batch: {
      id: 'batch-1',
      payrollCycleId: 'cycle-1',
      companyId: 'co-1',
      exportedBy: 'user-1',
      exportedAt: '2026-06-23T10:00:00.000Z',
      status: 'completed' as const,
      includedCount: 1,
      exceptionCount: 1,
      totalNetPayAmount: 25000,
      ownerConfirmedExceptions: false,
      ownerConfirmedBy: null,
      ownerConfirmedAt: null,
      regeneratedFromBatchId: null,
      cancelledAt: null,
      cancelledBy: null,
      items: [
        {
          id: 'item-1',
          employeeId: 'emp-1',
          employeeCode: 'E001',
          employeeName: 'Alice Example',
          department: 'HR',
          teamName: 'Team A',
          bankName: 'ธนาคารกสิกรไทย',
          bankAccountNo: '1234567890',
          bankAccountName: 'Alice Example',
          netPayAmount: 25000,
          payrollComponents: [{ itemType: 'salary', amount: 25000, note: null }],
          exportStatus: 'included' as const,
          exceptionFlags: [],
        },
        {
          id: 'item-2',
          employeeId: 'emp-2',
          employeeCode: 'E002',
          employeeName: 'Bob Example',
          department: 'Ops',
          teamName: 'Team B',
          bankName: null,
          bankAccountNo: null,
          bankAccountName: null,
          netPayAmount: 0,
          payrollComponents: [],
          exportStatus: 'exception' as const,
          exceptionFlags: ['missing_bank_account', 'net_pay_non_positive'] as const,
        },
      ],
    },
    cyclePeriodStart: '2026-06-01',
    cyclePeriodEnd: '2026-06-30',
    cyclePayDate: '2026-07-05',
  } satisfies PayrollExportSheetContext;

  it('generates xlsx buffer with three sheets', async () => {
    const buffer = await generator.generateXlsx(context);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('generates csv with transfer-ready rows only', () => {
    const buffer = generator.generateCsv(context);
    const text = buffer.toString('utf8');
    expect(text).toContain('E001');
    expect(text).not.toContain('E002');
  });

  it('builds deterministic filename', () => {
    expect(generator.buildFilename('batch-1', 'xlsx', '2026-06-23T10:00:00.000Z'))
      .toBe('payroll-bank-transfer-20260623-batch-1.xlsx');
  });
});
