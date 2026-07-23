// ============================================================================
// modules/telegram/application/employee-recognition.notifier.ts
// EMP-006 / EMP-007 / HR-013c — birthday, anniversary, gift & broadcast messages.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import { formatDateDdMmYyyy } from '../../employee/domain/services/employee-date-events.service';
import type {
  RecognitionEmployeeRow,
  TodayAnniversaryEvent,
  TodayBirthdayEvent,
} from '../../employee/application/employee-events.service';
import type { EmployeeRecognitionType } from '../../employee/application/dto/employee-recognition.dto';

const LEADER_ROLES = ['owner', 'secretary', 'big_leader'] as const;

export interface GiftRecordedEvent {
  companyId: string;
  employeeId: string;
  recognitionType: 'BIRTHDAY_GIFT' | 'WORK_ANNIVERSARY_GIFT';
  recognitionDate: Date;
  notes: string | null;
}

export interface AwardGivenEvent {
  companyId: string;
  employeeId: string;
  recognitionType: EmployeeRecognitionType;
  recognitionDate: Date;
  giftOrReward: string | null;
  notes: string | null;
  announceCompanyWide?: boolean;
}

const AWARD_TYPE_LABELS: Record<string, string> = {
  EMPLOYEE_OF_MONTH: 'พนักงานดีเด่นประจำเดือน',
  BEST_ATTENDANCE: 'การเข้างานดีเด่น',
  BEST_PERFORMANCE: 'ผลงานดีเด่น',
  TOP_RECRUITER: 'Top Recruiter',
  TOP_MARKETING: 'Top Marketing',
  SPECIAL_REWARD: 'รางวัลพิเศษ',
  SERVICE_AWARD_1_YEAR: 'รางวัลครบ 1 ปี',
  SERVICE_AWARD_3_YEAR: 'รางวัลครบ 3 ปี',
  SERVICE_AWARD_5_YEAR: 'รางวัลครบ 5 ปี',
  SERVICE_AWARD_10_YEAR: 'รางวัลครบ 10 ปี',
};

@Injectable()
export class EmployeeRecognitionNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  async notifyBirthday(companyId: string, event: TodayBirthdayEvent): Promise<void> {
    const { employee } = event;
    await this.notifyEmployee(employee.id, [
      '🎂 <b>สุขสันต์วันเกิด</b>',
      '',
      'ขอให้มีความสุข สุขภาพแข็งแรง',
      'และประสบความสำเร็จในทุกเรื่อง 🎉',
    ].join('\n'));

    const leaderText = this.buildBirthdayLeaderText(employee);
    await this.notifyLeaders(companyId, leaderText);
  }

  /** HR-013c — company-wide birthday announcement to all linked Telegram accounts in company. */
  async broadcastCompanyBirthdayAnnouncement(companyId: string, employeeId: string): Promise<void> {
    const employee = await this.loadEmployeeRow(employeeId);
    if (!employee) return;

    const text = [
      '🎂 <b>ประกาศวันเกิด</b>',
      '',
      `วันนี้เป็นวันเกิดของ <b>${escapeHtml(fullName(employee))}</b>`,
      '',
      'ตำแหน่ง:',
      escapeHtml(employee.position ?? '—'),
      '',
      'แผนก:',
      escapeHtml(employee.department ?? '—'),
      '',
      'ร่วมอวยพรวันเกิดกันนะคะ 🎉',
    ].join('\n');

    await this.broadcastToCompany(companyId, text, 'employee_recognition_broadcast');
  }

  async notifyGiftRecorded(event: GiftRecordedEvent): Promise<void> {
    const employee = await this.loadEmployeeRow(event.employeeId);
    if (!employee) return;

    const isBirthday = event.recognitionType === 'BIRTHDAY_GIFT';
    const dateLabel = formatDateDdMmYyyy(event.recognitionDate);
    const giftLabel = isBirthday ? 'ของขวัญวันเกิด' : 'ของขวัญครบรอบการทำงาน';

    await this.notifyEmployee(event.employeeId, [
      isBirthday ? '🎁 <b>บันทึกของขวัญวันเกิดแล้ว</b>' : '🎁 <b>บันทึกของขวัญครบรอบแล้ว</b>',
      '',
      `HR บันทึก${giftLabel}ให้คุณแล้ว`,
      `วันที่: ${dateLabel}`,
      ...(event.notes ? ['', escapeHtml(event.notes)] : []),
    ].join('\n'));

    const leaderText = [
      '🎁 <b>บันทึกของขวัญแล้ว</b>',
      '',
      `<b>${escapeHtml(fullName(employee))}</b>`,
      '',
      `ประเภท: ${giftLabel}`,
      `วันที่: ${dateLabel}`,
      ...(event.notes ? ['', escapeHtml(event.notes)] : []),
    ].join('\n');
    await this.notifyLeaders(event.companyId, leaderText);
  }

  /** EMP-011 — notify employee and leaders when an award is given. */
  async notifyAwardGiven(event: AwardGivenEvent): Promise<void> {
    const employee = await this.loadEmployeeRow(event.employeeId);
    if (!employee) return;

    const awardLabel = AWARD_TYPE_LABELS[event.recognitionType] ?? event.recognitionType;
    const dateLabel = formatDateDdMmYyyy(event.recognitionDate);

    await this.notifyEmployee(event.employeeId, [
      '🏅 <b>ได้รับรางวัล / การยกย่อง</b>',
      '',
      `<b>${escapeHtml(awardLabel)}</b>`,
      `วันที่: ${dateLabel}`,
      ...(event.giftOrReward ? ['', `ของรางวัล: ${escapeHtml(event.giftOrReward)}`] : []),
      ...(event.notes ? ['', escapeHtml(event.notes)] : []),
      '',
      'ขอแสดงความยินดีด้วยค่ะ 🎉',
    ].join('\n'));

    const leaderText = [
      '🏅 <b>มอบรางวัล / การยกย่องแล้ว</b>',
      '',
      `<b>${escapeHtml(fullName(employee))}</b>`,
      '',
      `ประเภท: ${escapeHtml(awardLabel)}`,
      `วันที่: ${dateLabel}`,
      ...(event.giftOrReward ? [`ของรางวัล: ${escapeHtml(event.giftOrReward)}`] : []),
      ...(event.notes ? ['', escapeHtml(event.notes)] : []),
    ].join('\n');
    await this.notifyLeaders(event.companyId, leaderText);

    if (event.announceCompanyWide) {
      await this.broadcastToCompany(event.companyId, [
        '🏅 <b>ประกาศมอบรางวัล</b>',
        '',
        `<b>${escapeHtml(fullName(employee))}</b>`,
        '',
        `ได้รับ: ${escapeHtml(awardLabel)}`,
        ...(event.giftOrReward ? [`ของรางวัล: ${escapeHtml(event.giftOrReward)}`] : []),
        '',
        'ขอแสดงความยินดีด้วยค่ะ 🎉',
      ].join('\n'), 'employee_award_broadcast');
    }
  }

  async notifyAnniversary(companyId: string, event: TodayAnniversaryEvent): Promise<void> {
    const { employee, anniversaryYears } = event;
    await this.notifyEmployee(employee.id, [
      '🏆 <b>วันนี้เป็นวันครบรอบการทำงาน</b>',
      '',
      `ครบ <b>${anniversaryYears}</b> ปี`,
      '',
      'ขอบคุณที่เป็นส่วนหนึ่งของบริษัท ❤️',
    ].join('\n'));

    const leaderText = [
      '🏆 วันนี้เป็นวันครบรอบการทำงานของ',
      '',
      `<b>${escapeHtml(fullName(employee))}</b>`,
      '',
      `ครบ <b>${anniversaryYears}</b> ปี`,
      '',
      'ตำแหน่ง:',
      escapeHtml(employee.position ?? '—'),
      '',
      'แผนก:',
      escapeHtml(employee.department ?? '—'),
    ].join('\n');
    await this.notifyLeaders(companyId, leaderText);
  }

  private buildBirthdayLeaderText(employee: RecognitionEmployeeRow): string {
    return [
      '🎂 วันนี้เป็นวันเกิดของ',
      '',
      `<b>${escapeHtml(fullName(employee))}</b>`,
      '',
      'ตำแหน่ง:',
      escapeHtml(employee.position ?? '—'),
      '',
      'แผนก:',
      escapeHtml(employee.department ?? '—'),
      '',
      'อย่าลืมอวยพรวันเกิดน้องด้วยนะ 🎉',
    ].join('\n');
  }

  private async loadEmployeeRow(employeeId: string): Promise<RecognitionEmployeeRow | null> {
    return this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        department: true,
        position: true,
        dateOfBirth: true,
        hireDate: true,
      },
    });
  }

  private async broadcastToCompany(
    companyId: string,
    text: string,
    messageType: string,
  ): Promise<void> {
    const accounts = await this.prisma.telegramAccount.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        chatId: { not: null },
        user: {
          isActive: true,
          deletedAt: null,
          employeeId: { not: null },
        },
      },
      include: { user: { select: { employeeId: true } } },
    });

    const sent = new Set<number>();
    for (const account of accounts) {
      if (!account.chatId || !account.user.employeeId) continue;

      const assignment = await this.prisma.employeeAssignment.findFirst({
        where: {
          employeeId: account.user.employeeId,
          companyId,
          effectiveTo: null,
          deletedAt: null,
        },
      });
      if (!assignment) continue;

      const chatId = Number(account.chatId);
      if (sent.has(chatId)) continue;
      sent.add(chatId);

      await this.gateway.sendMessage({
        chatId,
        text,
        parseMode: 'HTML',
        messageType,
        telegramAccountId: account.id,
      });
    }
  }

  private async notifyEmployee(employeeId: string, text: string): Promise<void> {
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
      messageType: 'employee_recognition',
      telegramAccountId: account.id,
    });
  }

  private async notifyLeaders(companyId: string, text: string): Promise<void> {
    const userIds = await this.resolveLeaderUserIds(companyId);
    if (!userIds.length) return;

    const accounts = await this.prisma.telegramAccount.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        userId: { in: userIds },
      },
    });

    const sent = new Set<number>();
    for (const account of accounts) {
      if (!account.chatId) continue;
      const chatId = Number(account.chatId);
      if (sent.has(chatId)) continue;
      sent.add(chatId);
      await this.gateway.sendMessage({
        chatId,
        text,
        parseMode: 'HTML',
        messageType: 'employee_recognition_leader',
        telegramAccountId: account.id,
      });
    }
  }

  private async resolveLeaderUserIds(companyId: string): Promise<string[]> {
    const assignments = await this.prisma.businessRoleAssignment.findMany({
      where: {
        role: { in: [...LEADER_ROLES] },
        isActive: true,
        deletedAt: null,
      },
      select: { userId: true, role: true },
    });

    const ids = new Set<string>();
    for (const assignment of assignments) {
      const user = await this.prisma.user.findFirst({
        where: { id: assignment.userId, deletedAt: null, isActive: true },
        include: { scopeGrants: { where: { deletedAt: null } } },
      });
      if (!user) continue;
      if (assignment.role === 'owner' || this.userMatchesCompanyScope(user.scopeGrants, companyId)) {
        ids.add(user.id);
      }
    }
    return [...ids];
  }

  private userMatchesCompanyScope(
    grants: Array<{ scopeType: string; companyId: string | null }>,
    companyId: string,
  ): boolean {
    return grants.some(
      (g) => g.scopeType === 'all' || (g.scopeType === 'company' && g.companyId === companyId),
    );
  }
}

function fullName(employee: RecognitionEmployeeRow): string {
  return `${employee.firstName} ${employee.lastName}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
