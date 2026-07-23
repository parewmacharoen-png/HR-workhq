// ============================================================================
// Payroll PDF export — summary and payslip documents (Thai-capable Sarabun font)
// ============================================================================

import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { PayrollCycleNotFoundError } from '../domain/errors/payroll.errors';
import {
  humanizePayrollNoteTh,
  payrollItemTypeLabelTh,
} from '../domain/payroll-item-labels';
import {
  registerPayrollPdfFonts,
  usePayrollPdfFont,
} from '../domain/payroll-pdf-fonts';
import { SalaryVisibilityService } from '../../permission/application/salary-visibility.service';
import { PayrollOverviewAccessService } from './payroll-overview-access.service';
import { PayrollOverviewAssemblerService } from './payroll-overview-assembler.service';

export interface PayrollPdfResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
  net?: number;
  periodStart?: string;
  periodEnd?: string;
  companyName?: string;
  isConsolidated?: boolean;
}

interface PayslipLine {
  label: string;
  detail: string;
  amount: number;
}

@Injectable()
export class PayrollPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PayrollOverviewAccessService,
    private readonly assembler: PayrollOverviewAssemblerService,
    private readonly salaryVisibility: SalaryVisibilityService,
  ) {}

  async generateSummaryPdf(actor: ActorContext, cycleId: string): Promise<PayrollPdfResult> {
    const cycle = await this.loadCycle(cycleId);
    await this.access.assertCanViewCompanyOverview(actor, cycle.companyId);

    const company = await this.prisma.company.findFirst({
      where: { id: cycle.companyId, deletedAt: null },
      select: { name: true },
    });

    const { summary, employees } = await this.assembler.buildOverview(
      cycle,
      company?.name ?? '',
      { companyId: cycle.companyId },
    );

    const periodLabel = `${formatDate(cycle.periodStart)} – ${formatDate(cycle.periodEnd)}`;
    const headers = [
      'รหัส', 'ชื่อ', 'เงินเดือน', 'อาหาร', 'OT', 'คอม', 'โบนัส', 'หัก', 'สุทธิ',
    ];
    const rows = employees.map((row) => [
      row.employeeCode,
      row.employeeName,
      formatMoney(row.baseSalary),
      formatMoney(row.mealAllowance),
      formatMoney(row.otAmount),
      formatMoney(row.commissionAmount),
      formatMoney(row.bonusAmount),
      formatMoney(row.totalDeduction),
      formatMoney(row.netPayAmount),
    ]);

    const buffer = await renderTablePdf({
      title: `สรุปเงินเดือน — ${company?.name ?? ''}`,
      subtitle: `รอบ ${periodLabel} · จ่าย ${formatDate(cycle.payDate)} · สถานะ ${cycle.status}`,
      footerLines: [
        `พนักงาน ${summary.totalEmployees} คน`,
        `ยอดสุทธิรวม ${formatMoney(summary.totalNetPayAmount)} บาท`,
        `สร้างเมื่อ ${new Date().toLocaleString('th-TH')}`,
      ],
      headers,
      rows,
      landscape: true,
    });

    return {
      buffer,
      filename: `payroll-summary-${cycleId.slice(0, 8)}.pdf`,
      contentType: 'application/pdf',
    };
  }

  async generatePayslipPdf(
    actor: ActorContext,
    cycleId: string,
    employeeId: string,
  ): Promise<PayrollPdfResult> {
    const cycle = await this.loadCycle(cycleId);
    await this.access.assertCanViewCompanyOverview(actor, cycle.companyId);
    return this.buildPayslipPdf(cycleId, employeeId);
  }

  /** Employee self-service (Telegram / own profile) — salary visibility only. */
  async generateEmployeePayslipPdf(
    userId: string,
    cycleId: string,
    employeeId: string,
  ): Promise<PayrollPdfResult> {
    await this.salaryVisibility.assertCanViewSalary(userId, employeeId);
    const cycle = await this.loadCycle(cycleId);
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId,
        companyId: cycle.companyId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!assignment) throw new PayrollCycleNotFoundError(cycleId);
    return this.buildPayslipPdf(cycleId, employeeId);
  }

  private async buildPayslipPdf(cycleId: string, employeeId: string): Promise<PayrollPdfResult> {
    const cycle = await this.loadCycle(cycleId);

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        deletedAt: null,
        assignments: { some: { companyId: cycle.companyId, deletedAt: null } },
      },
      select: { globalId: true, firstName: true, lastName: true },
    });
    if (!employee) throw new PayrollCycleNotFoundError(cycleId);

    const payslip = await this.prisma.payslip.findFirst({
      where: { payrollCycleId: cycleId, employeeId, deletedAt: null },
    });

    const items = await this.prisma.payrollItem.findMany({
      where: { payrollCycleId: cycleId, employeeId, deletedAt: null },
      orderBy: [{ amount: 'desc' }, { itemType: 'asc' }],
    });

    const company = await this.prisma.company.findFirst({
      where: { id: cycle.companyId, deletedAt: null },
      select: { name: true },
    });

    const earnings: PayslipLine[] = [];
    const deductions: PayslipLine[] = [];
    let gross = 0;
    let deductionTotal = 0;

    for (const item of items) {
      const amount = Number(item.amount);
      const line: PayslipLine = {
        label: payrollItemTypeLabelTh(item.itemType),
        detail: humanizePayrollNoteTh(item.note),
        amount,
      };
      if (amount >= 0) {
        earnings.push(line);
        gross += amount;
      } else {
        deductions.push(line);
        deductionTotal += Math.abs(amount);
      }
    }

    if (payslip) {
      gross = Number(payslip.gross);
      deductionTotal = Number(payslip.deductions);
    }

    const net = payslip ? Number(payslip.net) : gross - deductionTotal;
    const employeeName = [employee.firstName, employee.lastName].filter(Boolean).join(' ');

    const buffer = await renderPayslipPdf({
      companyName: company?.name ?? '',
      employeeCode: employee.globalId,
      employeeName,
      periodLabel: `${formatDate(cycle.periodStart)} – ${formatDate(cycle.periodEnd)}`,
      payDate: formatDate(cycle.payDate),
      cycleStatus: cycleStatusLabel(cycle.status),
      earnings,
      deductions,
      gross,
      deductionTotal,
      net,
    });

    return {
      buffer,
      filename: `payslip-${employee.globalId}-${formatDate(cycle.periodStart)}.pdf`,
      contentType: 'application/pdf',
      net,
      periodStart: cycle.periodStart.toISOString().slice(0, 10),
      periodEnd: cycle.periodEnd.toISOString().slice(0, 10),
      companyName: company?.name ?? '',
    };
  }

  async generateConsolidatedPayslipPdf(
    actor: ActorContext,
    employeeId: string,
    referenceCycleId: string,
  ): Promise<PayrollPdfResult> {
    await this.salaryVisibility.assertCanViewSalary(actor.userId, employeeId);
    return this.buildConsolidatedPayslipPdf(employeeId, referenceCycleId);
  }

  /** Employee self-service (Telegram) — consolidated slip across assigned companies. */
  async generateEmployeeConsolidatedPayslipPdf(
    userId: string,
    employeeId: string,
    referenceCycleId: string,
  ): Promise<PayrollPdfResult> {
    await this.salaryVisibility.assertCanViewSalary(userId, employeeId);
    const refCycle = await this.loadCycle(referenceCycleId);
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, companyId: refCycle.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!assignment) throw new PayrollCycleNotFoundError(referenceCycleId);
    return this.buildConsolidatedPayslipPdf(employeeId, referenceCycleId);
  }

  /** One PDF per assigned company for the same pay period (Telegram separate delivery). */
  async generateEmployeeSeparatePayslipPdfsForPeriod(
    userId: string,
    employeeId: string,
    referenceCycleId: string,
  ): Promise<PayrollPdfResult[]> {
    await this.salaryVisibility.assertCanViewSalary(userId, employeeId);
    const refCycle = await this.loadCycle(referenceCycleId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { payrollAllocationMode: true },
    });
    const companyIds = employee?.payrollAllocationMode === 'shared_across_companies'
      ? (await this.prisma.company.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true },
        orderBy: { code: 'asc' },
      })).map((row) => row.id)
      : await this.listEmployeePayrollCompanyIds(employeeId);
    const pdfs: PayrollPdfResult[] = [];

    for (const companyId of companyIds) {
      const cycle = await this.prisma.payrollCycle.findFirst({
        where: {
          companyId,
          deletedAt: null,
          periodStart: refCycle.periodStart,
          periodEnd: refCycle.periodEnd,
        },
      });
      if (!cycle) continue;

      const hasData = await this.prisma.payrollItem.count({
        where: { payrollCycleId: cycle.id, employeeId, deletedAt: null },
      });
      const hasPayslip = await this.prisma.payslip.count({
        where: { payrollCycleId: cycle.id, employeeId, deletedAt: null },
      });
      if (hasData === 0 && hasPayslip === 0) continue;

      pdfs.push(await this.buildPayslipPdf(cycle.id, employeeId));
    }

    return pdfs;
  }

  async countEmployeePayrollCompanies(employeeId: string): Promise<number> {
    return this.listEmployeePayrollCompanyIds(employeeId).then((ids) => ids.length);
  }

  /** Latest cycle with payroll items — works even before payslip record is generated. */
  async resolveLatestEmployeePayrollCycleId(
    employeeId: string,
    options?: { companyId?: string; multiCompany?: boolean },
  ): Promise<string | null> {
    const rows = await this.prisma.payrollItem.findMany({
      where: {
        employeeId,
        deletedAt: null,
        payrollCycle: {
          deletedAt: null,
          ...(options?.multiCompany || !options?.companyId
            ? {}
            : { companyId: options.companyId }),
        },
      },
      select: {
        payrollCycleId: true,
        payrollCycle: { select: { periodEnd: true, payDate: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    if (rows.length === 0) return null;
    rows.sort((a, b) => {
      const endDiff = b.payrollCycle.periodEnd.getTime() - a.payrollCycle.periodEnd.getTime();
      if (endDiff !== 0) return endDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    return rows[0]?.payrollCycleId ?? null;
  }

  /** Distinct pay periods that have payroll items (for Telegram history). */
  async listEmployeePayrollPeriodCycleIds(
    employeeId: string,
    options?: { companyId?: string; multiCompany?: boolean; limit?: number },
  ): Promise<string[]> {
    const limit = options?.limit ?? 6;
    const rows = await this.prisma.payrollItem.findMany({
      where: {
        employeeId,
        deletedAt: null,
        payrollCycle: {
          deletedAt: null,
          ...(options?.multiCompany || !options?.companyId
            ? {}
            : { companyId: options.companyId }),
        },
      },
      select: {
        payrollCycleId: true,
        payrollCycle: {
          select: { periodStart: true, periodEnd: true, payDate: true },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const byPeriod = new Map<string, { cycleId: string; periodEnd: Date; createdAt: Date }>();
    for (const row of rows) {
      const key = `${row.payrollCycle.periodStart.toISOString()}:${row.payrollCycle.periodEnd.toISOString()}`;
      const existing = byPeriod.get(key);
      if (!existing || row.payrollCycle.periodEnd > existing.periodEnd) {
        byPeriod.set(key, {
          cycleId: row.payrollCycleId,
          periodEnd: row.payrollCycle.periodEnd,
          createdAt: row.createdAt,
        });
      }
    }
    return [...byPeriod.values()]
      .sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime())
      .slice(0, limit)
      .map((row) => row.cycleId);
  }

  private async listEmployeePayrollCompanyIds(employeeId: string): Promise<string[]> {
    const rows = await this.prisma.employeeAssignment.findMany({
      where: { employeeId, deletedAt: null, effectiveTo: null },
      select: { companyId: true },
      orderBy: [{ isPrimaryCompany: 'desc' }, { effectiveFrom: 'asc' }],
    });
    return [...new Set(rows.map((row) => row.companyId))];
  }

  private async buildConsolidatedPayslipPdf(
    employeeId: string,
    referenceCycleId: string,
  ): Promise<PayrollPdfResult> {
    const refCycle = await this.loadCycle(referenceCycleId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        globalId: true,
        firstName: true,
        lastName: true,
        payrollAllocationMode: true,
        masterMonthlySalary: true,
      },
    });
    if (!employee) throw new PayrollCycleNotFoundError(referenceCycleId);

    const assignmentCompanyIds = employee.payrollAllocationMode === 'shared_across_companies'
      ? (await this.prisma.company.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true },
        orderBy: { code: 'asc' },
      })).map((row) => row.id)
      : await this.listEmployeePayrollCompanyIds(employeeId);
    if (assignmentCompanyIds.length === 0) {
      throw new PayrollCycleNotFoundError(referenceCycleId);
    }
    const companies = await this.prisma.company.findMany({
      where: {
        id: { in: assignmentCompanyIds },
        deletedAt: null,
        isActive: true,
      },
      select: { id: true, name: true },
      orderBy: { code: 'asc' },
    });

    const earnings: PayslipLine[] = [];
    const deductions: PayslipLine[] = [];
    let gross = 0;
    let deductionTotal = 0;
    let companiesWithItems = 0;

    for (const company of companies) {
      const cycle = await this.prisma.payrollCycle.findFirst({
        where: {
          companyId: company.id,
          deletedAt: null,
          periodStart: refCycle.periodStart,
          periodEnd: refCycle.periodEnd,
        },
      });
      if (!cycle) continue;

      const items = await this.prisma.payrollItem.findMany({
        where: { payrollCycleId: cycle.id, employeeId, deletedAt: null },
      });
      if (items.length === 0) continue;
      companiesWithItems += 1;
      for (const item of items) {
        const amount = Number(item.amount);
        const line: PayslipLine = {
          label: `${company.name} — ${payrollItemTypeLabelTh(item.itemType)}`,
          detail: humanizePayrollNoteTh(item.note),
          amount,
        };
        if (amount >= 0) earnings.push(line);
        else deductions.push(line);
        if (amount >= 0) gross += amount;
        else deductionTotal += Math.abs(amount);
      }
    }

    const net = gross - deductionTotal;
    const masterNote = employee.masterMonthlySalary != null
      ? `เงินเดือนรวม ${formatMoney(Number(employee.masterMonthlySalary))} บาท`
      : '';
    const missingCompanies = companies.length - companiesWithItems;
    const incompleteNote = missingCompanies > 0 && companiesWithItems > 0
      ? ` (ยังไม่ได้คำนวณครบ ${missingCompanies} บริษัท — กดคำนวณเงินเดือนในรอบที่เปิดอยู่)`
      : '';
    const consolidatedLabel = companiesWithItems > 1
      ? `รวม ${companiesWithItems} บริษัท${incompleteNote}`
      : companiesWithItems === 1
        ? 'สรุปรายการ'
        : 'รวมทุกบริษัท';
    const buffer = await renderPayslipPdf({
      companyName: consolidatedLabel,
      employeeCode: employee.globalId,
      employeeName: [employee.firstName, employee.lastName].filter(Boolean).join(' '),
      periodLabel: `${formatDate(refCycle.periodStart)} – ${formatDate(refCycle.periodEnd)}`,
      payDate: formatDate(refCycle.payDate),
      cycleStatus: masterNote || 'consolidated',
      earnings,
      deductions,
      gross,
      deductionTotal,
      net,
    });

    return {
      buffer,
      filename: `payslip-consolidated-${employee.globalId}-${formatDate(refCycle.periodStart)}.pdf`,
      contentType: 'application/pdf',
      net,
      periodStart: refCycle.periodStart.toISOString().slice(0, 10),
      periodEnd: refCycle.periodEnd.toISOString().slice(0, 10),
      isConsolidated: true,
    };
  }

  private async loadCycle(cycleId: string) {
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { id: cycleId, deletedAt: null },
    });
    if (!cycle) throw new PayrollCycleNotFoundError(cycleId);
    return cycle;
  }
}

function cycleStatusLabel(status: string): string {
  if (status === 'open') return 'เปิดอยู่';
  if (status === 'locked') return 'ล็อคแล้ว';
  if (status === 'paid') return 'จ่ายแล้ว';
  return status;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function createPdfDocument(options: ConstructorParameters<typeof PDFDocument>[0]): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument(options);
  registerPayrollPdfFonts(doc);
  return doc;
}

async function renderTablePdf(input: {
  title: string;
  subtitle: string;
  footerLines: string[];
  headers: string[];
  rows: string[][];
  landscape: boolean;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument({
      margin: 40,
      size: 'A4',
      layout: input.landscape ? 'landscape' : 'portrait',
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    usePayrollPdfFont(doc, 'bold');
    doc.fontSize(16).text(input.title, { align: 'center' });
    doc.moveDown(0.3);
    usePayrollPdfFont(doc, 'regular');
    doc.fontSize(10).text(input.subtitle, { align: 'center' });
    doc.moveDown();

    const colCount = input.headers.length;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = pageWidth / Math.max(colCount, 1);

    usePayrollPdfFont(doc, 'bold');
    doc.fontSize(8);
    input.headers.forEach((h, i) => {
      doc.text(h, doc.page.margins.left + i * colWidth, doc.y, {
        width: colWidth - 4,
        continued: i < colCount - 1,
      });
    });
    doc.moveDown(0.4);
    usePayrollPdfFont(doc, 'regular');

    for (const row of input.rows) {
      if (doc.y > doc.page.height - 80) doc.addPage();
      row.forEach((cell, i) => {
        doc.text(cell, doc.page.margins.left + i * colWidth, doc.y, {
          width: colWidth - 4,
          continued: i < colCount - 1,
        });
      });
      doc.moveDown(0.3);
    }

    doc.moveDown();
    usePayrollPdfFont(doc, 'regular');
    doc.fontSize(9);
    for (const line of input.footerLines) {
      doc.text(line);
    }

    doc.end();
  });
}

async function renderPayslipPdf(input: {
  companyName: string;
  employeeCode: string;
  employeeName: string;
  periodLabel: string;
  payDate: string;
  cycleStatus: string;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  gross: number;
  deductionTotal: number;
  net: number;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const amountWidth = 110;
    const labelWidth = contentWidth - amountWidth;

    const drawSectionTitle = (title: string) => {
      if (doc.y > doc.page.height - 120) doc.addPage();
      usePayrollPdfFont(doc, 'bold');
      doc.fontSize(12).fillColor('#111').text(title);
      doc.moveDown(0.25);
      doc
        .moveTo(left, doc.y)
        .lineTo(left + contentWidth, doc.y)
        .strokeColor('#cccccc')
        .lineWidth(0.5)
        .stroke();
      doc.moveDown(0.35);
    };

    const drawLine = (line: PayslipLine) => {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const y = doc.y;
      usePayrollPdfFont(doc, 'regular');
      doc.fontSize(10).fillColor('#111');
      doc.text(line.label, left, y, { width: labelWidth - 8 });
      doc.text(formatMoney(line.amount), left + labelWidth, y, {
        width: amountWidth,
        align: 'right',
      });
      let nextY = Math.max(doc.y, y + 14);
      if (line.detail) {
        usePayrollPdfFont(doc, 'regular');
        doc.fontSize(8).fillColor('#555');
        doc.text(line.detail, left, nextY, { width: labelWidth - 8 });
        nextY = doc.y + 4;
      } else {
        nextY += 4;
      }
      doc.y = nextY;
      doc.fillColor('#111');
    };

    usePayrollPdfFont(doc, 'bold');
    doc.fontSize(18).fillColor('#111').text('สลิปเงินเดือน', { align: 'center' });
    doc.moveDown(0.35);
    usePayrollPdfFont(doc, 'regular');
    doc.fontSize(12).text(input.companyName || 'WorkHQ', { align: 'center' });
    doc.moveDown(0.8);

    doc.fontSize(10);
    doc.text(`พนักงาน: ${input.employeeName}`);
    doc.text(`รหัส: ${input.employeeCode}`);
    doc.text(`รอบเงินเดือน: ${input.periodLabel}`);
    doc.text(`วันจ่าย: ${input.payDate}`);
    doc.text(`สถานะรอบ: ${input.cycleStatus}`);
    doc.moveDown(0.6);

    drawSectionTitle('รายได้');
    if (input.earnings.length === 0) {
      usePayrollPdfFont(doc, 'regular');
      doc.fontSize(10).fillColor('#555').text('ไม่มีรายได้ในรอบนี้');
      doc.moveDown(0.4);
      doc.fillColor('#111');
    } else {
      for (const line of input.earnings) drawLine(line);
    }

    doc.moveDown(0.3);
    drawSectionTitle('รายการหัก');
    if (input.deductions.length === 0) {
      usePayrollPdfFont(doc, 'regular');
      doc.fontSize(10).fillColor('#555').text('ไม่มีรายการหักในรอบนี้');
      doc.moveDown(0.4);
      doc.fillColor('#111');
    } else {
      for (const line of input.deductions) drawLine(line);
    }

    doc.moveDown(0.5);
    if (doc.y > doc.page.height - 100) doc.addPage();
    doc
      .moveTo(left, doc.y)
      .lineTo(left + contentWidth, doc.y)
      .strokeColor('#333333')
      .lineWidth(1)
      .stroke();
    doc.moveDown(0.4);

    usePayrollPdfFont(doc, 'regular');
    doc.fontSize(11);
    const summaryY = doc.y;
    doc.text('รายได้รวม', left, summaryY, { width: labelWidth - 8 });
    doc.text(formatMoney(input.gross), left + labelWidth, summaryY, {
      width: amountWidth,
      align: 'right',
    });
    doc.moveDown(0.25);
    const dedY = doc.y;
    doc.text('หักรวม', left, dedY, { width: labelWidth - 8 });
    doc.text(formatMoney(input.deductionTotal), left + labelWidth, dedY, {
      width: amountWidth,
      align: 'right',
    });
    doc.moveDown(0.35);

    usePayrollPdfFont(doc, 'bold');
    doc.fontSize(13);
    const netY = doc.y;
    doc.text('ยอดสุทธิ', left, netY, { width: labelWidth - 8 });
    doc.text(formatMoney(input.net), left + labelWidth, netY, {
      width: amountWidth,
      align: 'right',
    });

    doc.moveDown(1.2);
    usePayrollPdfFont(doc, 'regular');
    doc.fontSize(8).fillColor('#777');
    doc.text(`สร้างเมื่อ ${new Date().toLocaleString('th-TH')}`, { align: 'center' });
    doc.text('เอกสารนี้ออกจากระบบ WorkHQ สำหรับพนักงาน', { align: 'center' });

    doc.end();
  });
}
