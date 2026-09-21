// ============================================================================
// modules/attendance/application/attendance-alert.notifier.ts
// ATT-010 — Telegram notifications for attendance alerts.
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import type { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';

export type AttendanceAlertKind =
  | 'checkin_pre_reminder'
  | 'break_return_pre_reminder'
  | 'missing_checkin'
  | 'missing_checkin_escalated'
  | 'missing_checkout'
  | 'missing_checkout_escalated'
  | 'missing_break_return'
  | 'missing_break_return_escalated'
  | 'location_anomaly';

/** ATT-LOC — owner/HR roles that receive location-mismatch alerts. */
const LOCATION_ALERT_ROLES: BusinessRoleCode[] = ['owner', 'secretary'];

export interface LocationAnomalyAlertInput {
  employeeId: string;
  companyId: string;
  employeeName: string;
  teamName: string | null;
  companyName: string;
  event: 'check_in' | 'check_out';
  distanceMeters: number;
  thresholdMeters: number;
  latitude: number;
  longitude: number;
}

@Injectable()
export class AttendanceAlertNotifier {
  private readonly logger = new Logger(AttendanceAlertNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  /** ATT-LOC — alert owner/HR that a check-in/out was far from the employee's WFH home baseline. */
  async notifyLocationAnomaly(input: LocationAnomalyAlertInput): Promise<void> {
    const eventLabel = input.event === 'check_in' ? 'เช็กอิน' : 'เช็กเอาต์';
    const mapsUrl = `https://maps.google.com/?q=${input.latitude},${input.longitude}`;
    const text = [
      '🚨 <b>ตรวจพบตำแหน่งผิดปกติ</b>',
      '',
      `<b>ชื่อ:</b> ${escapeHtml(input.employeeName)}`,
      `<b>ทีม:</b> ${escapeHtml(input.teamName ?? '—')}`,
      `<b>บริษัท:</b> ${escapeHtml(input.companyName)}`,
      `<b>เหตุการณ์:</b> ${eventLabel}`,
      `<b>ระยะห่างจากบ้าน:</b> ${Math.round(input.distanceMeters).toLocaleString('th-TH')} เมตร (เกิน ${input.thresholdMeters.toLocaleString('th-TH')} เมตร)`,
      `<a href="${mapsUrl}">📍 ดูตำแหน่งบนแผนที่</a>`,
    ].join('\n');
    await this.sendToRoles(input.companyId, LOCATION_ALERT_ROLES, text);
  }

  private async sendToRoles(
    companyId: string,
    roles: BusinessRoleCode[],
    text: string,
  ): Promise<void> {
    const assignments = await this.prisma.businessRoleAssignment.findMany({
      where: { role: { in: roles }, isActive: true, deletedAt: null },
      select: { userId: true, role: true },
    });

    const userIds = new Set<string>();
    for (const assignment of assignments) {
      const user = await this.prisma.user.findFirst({
        where: { id: assignment.userId, deletedAt: null, isActive: true },
        include: { scopeGrants: { where: { deletedAt: null } } },
      });
      if (!user) continue;
      const matchesScope = assignment.role === 'owner'
        || user.scopeGrants.some(
          (grant) => grant.scopeType === 'all' || (grant.scopeType === 'company' && grant.companyId === companyId),
        );
      if (matchesScope) userIds.add(user.id);
    }
    if (!userIds.size) return;

    const accounts = await this.prisma.telegramAccount.findMany({
      where: { deletedAt: null, isActive: true, userId: { in: [...userIds] } },
    });
    const sentChatIds = new Set<number>();
    for (const account of accounts) {
      if (!account.chatId) continue;
      const chatId = Number(account.chatId);
      if (sentChatIds.has(chatId)) continue;
      sentChatIds.add(chatId);
      try {
        await this.gateway.sendMessage({
          chatId,
          text,
          parseMode: 'HTML',
          telegramAccountId: account.id,
          messageType: 'attendance_alert',
        });
      } catch (err) {
        this.logger.warn(`Failed location anomaly alert to user ${account.userId}`, err);
      }
    }
  }

  async notifyEmployee(
    employeeId: string,
    kind: AttendanceAlertKind,
    extra?: {
      employeeName?: string;
      teamName?: string | null;
      companyName?: string;
      shiftName?: string;
      shiftStartMinutes?: number;
      lateMinutes?: number;
      minutesRemaining?: number;
      breakMinutes?: number;
    },
  ): Promise<void> {
    const text = this.messageFor(kind, 'employee', extra);
    const keyboard = this.keyboardFor(kind);
    await this.sendToEmployee(employeeId, text, keyboard);
  }

  async notifyBigLeader(
    companyId: string,
    employeeId: string,
    kind: AttendanceAlertKind,
    extra: { employeeName: string; teamName: string | null; companyName: string },
  ): Promise<void> {
    const text = this.messageFor(kind, 'leader', extra);
    await this.sendToBigLeaders(companyId, employeeId, text);
  }

  private messageFor(
    kind: AttendanceAlertKind,
    audience: 'employee' | 'leader',
    extra?: {
      employeeName?: string;
      teamName?: string | null;
      companyName?: string;
      shiftName?: string;
      shiftStartMinutes?: number;
      lateMinutes?: number;
      minutesRemaining?: number;
      breakMinutes?: number;
    },
  ): string {
    if (audience === 'employee') {
      switch (kind) {
        case 'checkin_pre_reminder': {
          const shiftLabel = extra?.shiftName ?? 'งาน';
          const timeLabel = extra?.shiftStartMinutes !== undefined
            ? formatMinutes(extra.shiftStartMinutes)
            : '—';
          return [
            '⏰ <b>ใกล้ถึงเวลาเข้างาน</b>',
            '',
            `กะ<b>${escapeHtml(shiftLabel)}</b> เริ่มเวลา <b>${timeLabel}</b>`,
            'กรุณาเช็กอินเมื่อเริ่มงาน',
          ].join('\n');
        }
        case 'missing_checkin': {
          const late = extra?.lateMinutes ?? 30;
          return [
            '⏰ <b>ยังไม่ได้เช็กอินเข้างาน</b>',
            '',
            `เลยเวลาเข้างานแล้ว ${late} นาที`,
            'กรุณาเช็กอินหากเริ่มงานแล้ว',
            'หากสายเกิน 15 นาทีจะมีการหักเงินเดือน',
          ].join('\n');
        }
        case 'missing_checkout':
          return [
            '⏰ <b>ยังไม่ได้เช็กเอาต์</b>',
            '',
            'กรุณาเช็กเอาต์เมื่อเลิกงาน',
          ].join('\n');
        case 'missing_break_return':
          return [
            '⏰ <b>ครบเวลาพักแล้ว</b>',
            '',
            extra?.breakMinutes
              ? `พักครบ ${extra.breakMinutes} นาทีแล้ว`
              : 'พักครบเวลาที่กำหนดแล้ว',
            'กรุณากลับจากพักและกด «กลับจากพัก»',
          ].join('\n');
        case 'break_return_pre_reminder': {
          const remaining = extra?.minutesRemaining ?? 5;
          return [
            '⏰ <b>ใกล้ครบเวลาพัก</b>',
            '',
            `อีก ${remaining} นาทีจะครบเวลาพักที่กำหนด`,
            'กรุณาเตรียมกลับเข้าทำงาน',
          ].join('\n');
        }
        default:
          return '';
      }
    }

    const name = extra?.employeeName ?? '—';
    const team = extra?.teamName ?? '—';
    const company = extra?.companyName ?? '—';
    switch (kind) {
      case 'missing_checkin_escalated':
        return [
          '⚠️ <b>พนักงานยังไม่ได้เช็กอิน</b>',
          '',
          `<b>ชื่อ:</b> ${escapeHtml(name)}`,
          `<b>ทีม:</b> ${escapeHtml(team)}`,
          `<b>บริษัท:</b> ${escapeHtml(company)}`,
        ].join('\n');
      case 'missing_checkout_escalated':
        return [
          '⚠️ <b>พนักงานยังไม่ได้เช็กเอาต์</b>',
          '',
          `<b>ชื่อ:</b> ${escapeHtml(name)}`,
          `<b>ทีม:</b> ${escapeHtml(team)}`,
          `<b>บริษัท:</b> ${escapeHtml(company)}`,
        ].join('\n');
      case 'missing_break_return_escalated':
        return [
          '⚠️ <b>พนักงานยังไม่กลับจากพัก</b>',
          '',
          `<b>ชื่อ:</b> ${escapeHtml(name)}`,
          `<b>ทีม:</b> ${escapeHtml(team)}`,
          `<b>บริษัท:</b> ${escapeHtml(company)}`,
        ].join('\n');
      default:
        return '';
    }
  }

  private keyboardFor(kind: AttendanceAlertKind) {
    switch (kind) {
      case 'checkin_pre_reminder':
      case 'missing_checkin':
        return {
          inline_keyboard: [
            [{ text: '📍 เช็กอินตอนนี้', callback_data: 'checkin:pick' }],
            [{ text: '📝 ขอแก้ไขเวลา', callback_data: 'attendance:time_correction' }],
          ],
        };
      case 'missing_checkout':
        return {
          inline_keyboard: [[{ text: '🏁 เช็กเอาต์', callback_data: 'do:checkout' }]],
        };
      case 'missing_break_return':
      case 'break_return_pre_reminder':
        return {
          inline_keyboard: [[{ text: '🔙 กลับจากพัก', callback_data: 'do:break_end' }]],
        };
      default:
        return undefined;
    }
  }

  private async sendToEmployee(
    employeeId: string,
    text: string,
    replyMarkup?: unknown,
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
    try {
      await this.gateway.sendMessage({
        chatId: Number(account.chatId),
        text,
        parseMode: 'HTML',
        replyMarkup,
        telegramAccountId: account.id,
        messageType: 'attendance_alert',
      });
    } catch (err) {
      this.logger.warn(`Failed attendance alert to employee ${employeeId}`, err);
    }
  }

  private async sendToBigLeaders(
    companyId: string,
    subjectEmployeeId: string,
    text: string,
  ): Promise<void> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId: subjectEmployeeId, teamId: { not: null }, effectiveTo: null, deletedAt: null },
      select: { teamId: true },
    });
    if (!assignment?.teamId) return;

    const team = await this.prisma.team.findFirst({
      where: { id: assignment.teamId, deletedAt: null },
      select: { bigLeaderEmployeeId: true },
    });
    const leaderIds = new Set<string>();
    if (team?.bigLeaderEmployeeId) leaderIds.add(team.bigLeaderEmployeeId);

    const bigLeaderAssignments = await this.prisma.employeeAssignment.findMany({
      where: { teamId: assignment.teamId, roleLevel: 'big_leader', effectiveTo: null, deletedAt: null },
      select: { employeeId: true },
    });
    bigLeaderAssignments.forEach((a) => leaderIds.add(a.employeeId));

    for (const leaderEmployeeId of leaderIds) {
      await this.sendToEmployee(leaderEmployeeId, text);
    }
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
