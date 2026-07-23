// ============================================================================
// modules/payroll/application/payroll-export-sheet.generator.ts
// PAY-006 — XLSX (3 sheets) and CSV generators.
// ============================================================================

import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { PayrollExportBatchResponse, PayrollExportItemResponse } from './dto/payroll-export.dto';

export interface PayrollExportSheetContext {
  batch: PayrollExportBatchResponse;
  cyclePeriodStart: string;
  cyclePeriodEnd: string;
  cyclePayDate: string;
  companyName?: string | null;
}

const EXCEPTION_LABELS: Record<string, string> = {
  missing_bank_account: 'Missing bank account',
  net_pay_non_positive: 'Net pay <= 0',
  pending_adjustment: 'Pending adjustment',
};

@Injectable()
export class PayrollExportSheetGenerator {
  async generateXlsx(context: PayrollExportSheetContext): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'WorkHQ';
    workbook.created = new Date();

    this.addBankTransferSheet(workbook, context);
    this.addPayrollSummarySheet(workbook, context);
    this.addExceptionsSheet(workbook, context);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  generateCsv(context: PayrollExportSheetContext): Buffer {
    const transferRows = context.batch.items.filter((row) => row.exportStatus === 'included');
    const headers = [
      'Employee Code',
      'Employee Name',
      'Department',
      'Team',
      'Bank Name',
      'Account No',
      'Account Name',
      'Net Pay',
    ];
    const lines = [headers.join(',')];
    for (const row of transferRows) {
      lines.push([
        csvEscape(row.employeeCode),
        csvEscape(row.employeeName),
        csvEscape(row.department ?? ''),
        csvEscape(row.teamName ?? ''),
        csvEscape(row.bankName ?? ''),
        csvEscape(row.bankAccountNo ?? ''),
        csvEscape(row.bankAccountName ?? ''),
        row.netPayAmount.toFixed(2),
      ].join(','));
    }
    return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
  }

  buildFilename(batchId: string, format: 'xlsx' | 'csv', exportedAt: string): string {
    const stamp = exportedAt.slice(0, 10).replace(/-/g, '');
    return `payroll-bank-transfer-${stamp}-${batchId.slice(0, 8)}.${format}`;
  }

  private addBankTransferSheet(workbook: ExcelJS.Workbook, context: PayrollExportSheetContext): void {
    const sheet = workbook.addWorksheet('Bank Transfer');
    sheet.addRow(['Payroll Bank Transfer Sheet']);
    sheet.addRow(['Period', `${context.cyclePeriodStart} → ${context.cyclePeriodEnd}`]);
    sheet.addRow(['Pay Date', context.cyclePayDate]);
    sheet.addRow(['Exported At', context.batch.exportedAt]);
    sheet.addRow([]);

    const headers = [
      'Employee Code', 'Employee Name', 'Department', 'Team',
      'Bank Name', 'Account No', 'Account Name', 'Net Pay (THB)',
    ];
    sheet.addRow(headers);
    this.styleHeaderRow(sheet.getRow(sheet.rowCount));

    for (const row of context.batch.items.filter((item) => item.exportStatus === 'included')) {
      sheet.addRow([
        row.employeeCode,
        row.employeeName,
        row.department ?? '',
        row.teamName ?? '',
        row.bankName ?? '',
        row.bankAccountNo ?? '',
        row.bankAccountName ?? '',
        row.netPayAmount,
      ]);
    }

    sheet.columns = [
      { width: 14 }, { width: 28 }, { width: 18 }, { width: 18 },
      { width: 24 }, { width: 18 }, { width: 28 }, { width: 14 },
    ];
  }

  private addPayrollSummarySheet(workbook: ExcelJS.Workbook, context: PayrollExportSheetContext): void {
    const sheet = workbook.addWorksheet('Payroll Summary');
    sheet.addRow(['Payroll Summary']);
    sheet.addRow(['Period', `${context.cyclePeriodStart} → ${context.cyclePeriodEnd}`]);
    sheet.addRow(['Included Employees', context.batch.includedCount]);
    sheet.addRow(['Exceptions', context.batch.exceptionCount]);
    sheet.addRow(['Total Net Pay (included)', context.batch.totalNetPayAmount]);
    sheet.addRow([]);

    const headers = [
      'Employee Code', 'Employee Name', 'Department', 'Team', 'Net Pay',
      'Salary', 'Meal', 'OT', 'Commission', 'Bonus/Adj', 'Deductions', 'Deposit', 'Status',
    ];
    sheet.addRow(headers);
    this.styleHeaderRow(sheet.getRow(sheet.rowCount));

    for (const row of context.batch.items) {
      sheet.addRow([
        row.employeeCode,
        row.employeeName,
        row.department ?? '',
        row.teamName ?? '',
        row.netPayAmount,
        sumComponents(row, ['salary']),
        sumComponents(row, ['meal_allowance']),
        sumComponents(row, ['ot']),
        sumComponents(row, ['commission', 'commission_adjustment', 'referral']),
        sumComponents(row, ['bonus', 'manual_adjustment', 'leave_bonus']),
        sumComponents(row, ['late_deduction', 'absence_deduction', 'excess_off_deduction', 'break_deduction', 'consecutive_leave_deduction']),
        sumComponents(row, ['deposit']),
        row.exportStatus,
      ]);
    }

    sheet.columns = [
      { width: 14 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 12 },
      { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
      { width: 12 }, { width: 12 }, { width: 12 },
    ];
  }

  private addExceptionsSheet(workbook: ExcelJS.Workbook, context: PayrollExportSheetContext): void {
    const sheet = workbook.addWorksheet('Exceptions');
    sheet.addRow(['Payroll Export Exceptions']);
    sheet.addRow(['Period', `${context.cyclePeriodStart} → ${context.cyclePeriodEnd}`]);
    sheet.addRow([]);

    const headers = [
      'Employee Code', 'Employee Name', 'Department', 'Team', 'Net Pay',
      'Exception Flags', 'Bank Name', 'Account No',
    ];
    sheet.addRow(headers);
    this.styleHeaderRow(sheet.getRow(sheet.rowCount));

    const exceptions = context.batch.items.filter((row) => row.exportStatus === 'exception');
    if (exceptions.length === 0) {
      sheet.addRow(['No exceptions']);
      return;
    }

    for (const row of exceptions) {
      sheet.addRow([
        row.employeeCode,
        row.employeeName,
        row.department ?? '',
        row.teamName ?? '',
        row.netPayAmount,
        row.exceptionFlags.map((flag) => EXCEPTION_LABELS[flag] ?? flag).join('; '),
        row.bankName ?? '',
        row.bankAccountNo ?? '',
      ]);
    }

    sheet.columns = [
      { width: 14 }, { width: 28 }, { width: 18 }, { width: 18 },
      { width: 12 }, { width: 36 }, { width: 24 }, { width: 18 },
    ];
  }

  private styleHeaderRow(row: ExcelJS.Row): void {
    row.font = { bold: true };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EEF7' },
    };
  }
}

function sumComponents(row: PayrollExportItemResponse, types: string[]): number {
  return row.payrollComponents
    .filter((component) => types.includes(component.itemType))
    .reduce((sum, component) => sum + component.amount, 0);
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
