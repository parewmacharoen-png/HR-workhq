import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import { HierarchyResolverService } from '../../hierarchy/application/hierarchy-resolver.service';
import { LeaveApprovalRoutingService } from '../../leave/application/leave-approval-routing.service';
import { loadEmployeeApprovalDisplayContext } from '../../../shared/employee/employee-approval-display.util';

export interface LeaveTeamNotifyInput {
  requestInstanceId: string;
  requesterEmployeeId: string;
  companyId: string;
  leaveType: string;
  dateSummary: string;
  status: 'submitted' | 'approved' | 'rejected';
  notifyBigLeaderAwareness?: boolean;
}

@Injectable()
export class LeaveTeamTelegramNotifier {
  private readonly logger = new Logger(LeaveTeamTelegramNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
    private readonly hierarchy: HierarchyResolverService,
    private readonly routing: LeaveApprovalRoutingService,
  ) {}

  async notifyTeam(input: LeaveTeamNotifyInput): Promise<void> {
    const typeLabel = this.routing.leaveTypeLabelTh(input.leaveType);
    const requester = await this.prisma.employee.findFirst({
      where: { id: input.requesterEmployeeId, deletedAt: null },
      select: { firstName: true, lastName: true, nickname: true },
    });
    const who = requester
      ? `${requester.firstName} ${requester.lastName}${requester.nickname ? ` (${requester.nickname})` : ''}`
      : 'พนักงาน';

    const org = await loadEmployeeApprovalDisplayContext(
      this.prisma,
      input.requesterEmployeeId,
      input.companyId,
    );

    const statusLine = input.status === 'submitted'
      ? '📋 <b>มีคำขอลาใหม่ในทีม</b>'
      : input.status === 'approved'
        ? '✅ <b>คำขอลาในทีมอนุมัติแล้ว</b>'
        : '❌ <b>คำขอลาในทีมไม่อนุมัติ</b>';

    const text = [
      statusLine,
      `ประเภท: ${esc(typeLabel)}`,
      `ผู้ขอ: ${esc(who)}`,
      org.teamName ? `ทีม: ${esc(org.teamName)}` : '',
      `วันที่: ${esc(input.dateSummary)}`,
      input.status === 'submitted' ? '⏳ รอการอนุมัติ — ดูในปฏิทิมทีมได้' : '',
    ].filter(Boolean).join('\n');

    const employeeIds = await this.teamMemberEmployeeIds(input.requesterEmployeeId, input.companyId);
    await this.notifyEmployees(employeeIds, text, 'leave_team_notice');

    if (input.notifyBigLeaderAwareness) {
      const leader = await this.hierarchy.getBigLeader(input.requesterEmployeeId, input.companyId);
      if (leader && !employeeIds.includes(leader.employeeId)) {
        const leaderText = [
          '🔔 <b>แจ้งเตือนลาฉุกเฉิน (รับทราบ)</b>',
          `ทีม: ${esc(org.teamName ?? '—')}`,
          `${esc(who)} ส่งคำขอ${esc(typeLabel)}`,
          `วันที่: ${esc(input.dateSummary)}`,
          'ส่งไปเจ้าของอนุมัติแล้ว',
        ].join('\n');
        await this.notifyEmployees([leader.employeeId], leaderText, 'leave_big_leader_awareness');
      }
    }
  }

  private async teamMemberEmployeeIds(employeeId: string, companyId: string): Promise<string[]> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, companyId, effectiveTo: null, deletedAt: null },
      orderBy: [{ isPrimaryTeam: 'desc' }],
      select: { teamId: true },
    });
    if (!assignment?.teamId) return [employeeId];

    const rows = await this.prisma.employeeAssignment.findMany({
      where: { teamId: assignment.teamId, companyId, effectiveTo: null, deletedAt: null },
      select: { employeeId: true },
    });
    return [...new Set(rows.map((r) => r.employeeId))];
  }

  private async notifyEmployees(
    employeeIds: string[],
    text: string,
    messageType: string,
  ): Promise<void> {
    const sent = new Set<number>();
    for (const employeeId of employeeIds) {
      const account = await this.prisma.telegramAccount.findFirst({
        where: {
          deletedAt: null,
          isActive: true,
          user: { employeeId, deletedAt: null, isActive: true },
        },
        orderBy: { linkedAt: 'desc' },
      });
      if (!account?.chatId) continue;
      const chatId = Number(account.chatId);
      if (sent.has(chatId)) continue;
      sent.add(chatId);
      try {
        await this.gateway.sendMessage({
          chatId,
          text,
          parseMode: 'HTML',
          messageType,
          telegramAccountId: account.id,
        });
      } catch (err) {
        this.logger.warn(`Leave team notify failed for employee ${employeeId}`, err);
      }
    }
  }
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
