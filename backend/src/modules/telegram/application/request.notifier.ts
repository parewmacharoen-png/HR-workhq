import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import { RequestApproverResolverService } from '../../request/application/request-approver-resolver.service';
import { valuesMapFromRows } from '../../request/application/request-condition.util';
import { loadEmployeeApprovalDisplayContext } from '../../../shared/employee/employee-approval-display.util';
import { buildRequestSummaryLines } from '../../request/application/request-summary.util';
import { RequestAttendanceGuardService } from '../../request/application/request-attendance-guard.service';

@Injectable()
export class RequestTelegramNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
    private readonly approverResolver: RequestApproverResolverService,
    private readonly attendanceGuard: RequestAttendanceGuardService,
  ) {}

  async notifyApproverNewRequest(requestId: string, prefixNote?: string): Promise<void> {
    const req = await this.loadRequest(requestId);
    if (!req) return;

    const step = req.approvalSteps.find((s) => s.status === 'pending');
    if (!step) return;

    const org = await loadEmployeeApprovalDisplayContext(
      this.prisma,
      req.requesterEmployeeId,
      req.companyId,
    );
    const values = valuesMapFromRows(req.values);
    const typeKey = req.requestType?.key ?? 'generic_request';
    const summary = buildRequestSummaryLines(
      typeKey,
      values,
      { submittedAt: req.submittedAt ?? req.createdAt },
    ).join('\n');
    const attendanceLines = await this.attendanceGuard.buildApproverAttendanceLines(
      typeKey,
      req.requesterEmployeeId,
      req.companyId,
      values,
    );
    const attendanceBlock = attendanceLines.length ? `\n${attendanceLines.join('\n')}` : '';
    const prefix = prefixNote ? `${prefixNote}\n\n` : '';
    const text = [
      prefix,
      '📋 <b>มีคำร้องใหม่รออนุมัติ</b>',
      `ประเภท: ${esc(req.requestTypeVersion.nameSnapshot)}`,
      `ผู้ขอ: ${esc(req.requesterEmployee.nickname ?? req.requesterEmployee.firstName)}`,
      `บริษัท: ${esc(org.companyName ?? '—')}`,
      `ทีม: ${esc(org.teamName ?? '—')}`,
      `ตำแหน่ง: ${esc(org.position ?? '—')}`,
      summary,
      attendanceBlock,
    ].filter(Boolean).join('\n');

    const replyMarkup = {
      inline_keyboard: [[
        { text: '✅ อนุมัติ', callback_data: `request:approve:${requestId}` },
        { text: '❌ ไม่อนุมัติ', callback_data: `request:reject:${requestId}` },
      ], [
        { text: '🔎 ดูรายละเอียด', callback_data: `request:detail:${requestId}` },
      ]],
    };

    const approverIds = new Set<string>();

    if (step.approverEmployeeId) {
      approverIds.add(step.approverEmployeeId);
    }

    if (!approverIds.size) {
      const resolved = await this.approverResolver.resolve(
        step.approverTypeSnapshot as never,
        req.requesterEmployeeId,
        req.companyId,
        values,
        {
          approverRole: step.approverRoleSnapshot,
          approverEmployeeId: step.approverEmployeeId,
        },
      );
      for (const a of resolved) approverIds.add(a.employeeId);
    }

    if (!approverIds.size) {
      const owners = await this.approverResolver.resolve(
        'owner',
        req.requesterEmployeeId,
        req.companyId,
        values,
      );
      for (const a of owners) approverIds.add(a.employeeId);
    }

    await Promise.all(
      [...approverIds].map((employeeId) =>
        this.notifyEmployee(employeeId, text, replyMarkup),
      ),
    );
  }

  async notifyRequesterOutcome(requestId: string): Promise<void> {
    const req = await this.loadRequest(requestId);
    if (!req) return;
    const approved = req.status === 'approved';
    const rejected = req.status === 'rejected';
    if (!approved && !rejected) return;

    const org = await loadEmployeeApprovalDisplayContext(
      this.prisma,
      req.requesterEmployeeId,
      req.companyId,
    );
    const text = this.formatRequesterOutcomeMessage(req, org, approved);
    await this.notifyEmployee(req.requesterEmployeeId, text);
  }

  async buildApproverOutcomeMessage(
    requestId: string,
    approved: boolean,
    comment?: string | null,
  ): Promise<string> {
    const req = await this.loadRequest(requestId);
    if (!req) {
      return approved ? '✅ อนุมัติคำร้องแล้ว' : '❌ ไม่อนุมัติคำร้องแล้ว';
    }
    const org = await loadEmployeeApprovalDisplayContext(
      this.prisma,
      req.requesterEmployeeId,
      req.companyId,
    );
    return this.formatApproverOutcomeMessage(req, org, approved, comment);
  }

  async editApproverOutcomeMessage(
    chatId: number,
    messageId: number,
    requestId: string,
    approved: boolean,
    comment?: string | null,
  ): Promise<boolean> {
    const req = await this.loadRequest(requestId);
    if (!req) return false;

    const org = await loadEmployeeApprovalDisplayContext(
      this.prisma,
      req.requesterEmployeeId,
      req.companyId,
    );
    const text = this.formatApproverOutcomeMessage(req, org, approved, comment);
    const edited = await this.gateway.editMessageText(chatId, messageId, text);
    if (!edited) return false;
    await this.gateway.editMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] });
    return true;
  }

  private formatApproverOutcomeMessage(
    req: NonNullable<Awaited<ReturnType<RequestTelegramNotifier['loadRequest']>>>,
    org: Awaited<ReturnType<typeof loadEmployeeApprovalDisplayContext>>,
    approved: boolean,
    comment?: string | null,
  ): string {
    const typeKey = req.requestType?.key ?? 'generic_request';
    const values = valuesMapFromRows(req.values);
    const summaryLines = buildRequestSummaryLines(
      typeKey,
      values,
      { submittedAt: req.submittedAt ?? req.createdAt },
    );
    const submittedWhen = (req.submittedAt ?? req.createdAt).toLocaleString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const icon = approved ? '✅' : '❌';
    const status = approved ? 'อนุมัติแล้ว' : 'ไม่อนุมัติแล้ว';

    const lines = [
      `${icon} <b>คำร้อง${status}</b>`,
      '',
      `<b>ประเภท</b>\n${esc(req.requestTypeVersion.nameSnapshot)}`,
      `<b>ผู้ขอ</b>\n${esc(req.requesterEmployee.nickname ?? req.requesterEmployee.firstName)}`,
      `<b>บริษัท</b>\n${esc(org.companyName ?? '—')}`,
      `<b>ทีม</b>\n${esc(org.teamName ?? '—')}`,
      `<b>ส่งเมื่อ</b>\n${esc(submittedWhen)}`,
      summaryLines.length ? `<b>รายละเอียด</b>\n${summaryLines.map(esc).join('\n')}` : '',
    ].filter(Boolean);

    if (!approved && comment) {
      lines.push(`<b>เหตุผล</b>\n${esc(comment)}`);
    } else if (!approved && req.finalDecisionNote) {
      lines.push(`<b>เหตุผล</b>\n${esc(req.finalDecisionNote)}`);
    }

    return lines.join('\n');
  }

  private formatRequesterOutcomeMessage(
    req: NonNullable<Awaited<ReturnType<RequestTelegramNotifier['loadRequest']>>>,
    org: Awaited<ReturnType<typeof loadEmployeeApprovalDisplayContext>>,
    approved: boolean,
  ): string {
    const typeKey = req.requestType?.key ?? 'generic_request';
    const values = valuesMapFromRows(req.values);
    const summaryLines = buildRequestSummaryLines(
      typeKey,
      values,
      { submittedAt: req.submittedAt ?? req.createdAt },
    );
    const submittedWhen = (req.submittedAt ?? req.createdAt).toLocaleString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const icon = approved ? '✅' : '❌';
    const status = approved ? 'อนุมัติแล้ว' : 'ไม่อนุมัติแล้ว';

    const lines = [
      `${icon} <b>คำร้อง${status}</b>`,
      '',
      `<b>ประเภท</b>\n${esc(req.requestTypeVersion.nameSnapshot)}`,
      req.title ? `<b>หัวข้อ</b>\n${esc(req.title)}` : '',
      `<b>ทีม</b>\n${esc(org.teamName ?? '—')}`,
      `<b>ส่งเมื่อ</b>\n${esc(submittedWhen)}`,
      summaryLines.length ? `<b>รายละเอียด</b>\n${summaryLines.map(esc).join('\n')}` : '',
    ].filter(Boolean);

    if (typeKey === 'off_day_change' && approved) {
      const current = String(values.currentOffDay ?? '').slice(0, 10);
      const requested = String(values.requestedOffDay ?? '').slice(0, 10);
      lines.push(
        '',
        '<b>ผลในระบบ</b>',
        `• ยกเลิกวันหยุดเดิม: ${esc(current)}`,
        `• ตั้งวันหยุดใหม่: ${esc(requested)}`,
        '• คิดแจ้งล่วงหน้าจากวันที่ยื่นคำขอเปลี่ยน (ไม่ใช้วันของคำขอเดิม)',
      );
    }

    if (!approved && req.finalDecisionNote) {
      lines.push(`<b>เหตุผล</b>\n${esc(req.finalDecisionNote)}`);
    } else if (approved && req.finalDecisionNote) {
      lines.push(`<b>หมายเหตุ</b>\n${esc(req.finalDecisionNote)}`);
    }

    return lines.join('\n');
  }

  private async loadRequest(requestId: string) {
    return this.prisma.requestInstance.findUnique({
      where: { id: requestId },
      include: {
        requestType: { select: { key: true } },
        requestTypeVersion: true,
        requesterEmployee: true,
        values: true,
        approvalSteps: { orderBy: { stepOrder: 'asc' } },
      },
    });
  }

  private formatSummary(req: {
    values: Array<{ fieldLabelSnapshot: string; valueText: string | null; valueJson: unknown }>;
  }): string {
    return req.values.slice(0, 6).map((v) => {
      const val = v.valueText ?? JSON.stringify(v.valueJson);
      return `${esc(v.fieldLabelSnapshot)}: ${esc(String(val))}`;
    }).join('\n');
  }

  private async notifyEmployee(
    employeeId: string,
    text: string,
    replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> },
  ): Promise<void> {
    const account = await this.prisma.telegramAccount.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        user: { employeeId, deletedAt: null, isActive: true },
      },
      orderBy: { linkedAt: 'desc' },
    });
    if (!account?.chatId) return;
    await this.gateway.sendMessage({
      chatId: Number(account.chatId),
      text,
      parseMode: 'HTML',
      messageType: 'request_notice',
      telegramAccountId: account.id,
      replyMarkup,
    }).catch(() => undefined);
  }
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
