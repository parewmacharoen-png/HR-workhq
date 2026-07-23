import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';

const STATUS_LABELS: Record<string, string> = {
  submitted: 'ส่งแล้ว',
  screening: 'กำลังคัดกรอง',
  interviewed: 'สัมภาษณ์แล้ว',
  hired: 'จ้างแล้ว',
  probation: 'ทดลองงาน',
  probation_passed: 'ผ่านทดลองงาน',
  bonus_eligible: 'มีสิทธิ์โบนัส',
  bonus_approved: 'อนุมัติโบนัสแล้ว',
  paid: 'จ่ายโบนัสแล้ว',
  rejected: 'ไม่อนุมัติ',
  cancelled: 'ยกเลิก',
};

@Injectable()
export class EmployeeReferralTelegramHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  async showMyReferrals(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: account.userId, deletedAt: null },
      select: { employeeId: true },
    });
    if (!user?.employeeId) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    const rows = await this.prisma.employeeReferral.findMany({
      where: { referrerEmployeeId: user.employeeId },
      include: { bonusPayouts: true, referralProgram: true },
      orderBy: { submittedAt: 'desc' },
      take: 15,
    });

    if (!rows.length) {
      await this.gateway.sendMessage({
        chatId,
        text: '👥 <b>คนที่ฉันแนะนำ</b>\n\nยังไม่มีรายการแนะนำ',
        parseMode: 'HTML',
      });
      return;
    }

    const lines = rows.map((r) => {
      const bonus = r.bonusPayouts[0];
      const bonusText = bonus
        ? `โบนัส: ฿${Number(bonus.amount).toLocaleString('th-TH')} (${bonus.status})`
        : 'โบนัส: —';
      const eligible = ['bonus_eligible', 'bonus_approved', 'probation_passed'].includes(r.status)
        ? '✅ มีสิทธิ์'
        : r.status === 'paid'
          ? '💵 จ่ายแล้ว'
          : '⏳ รอดำเนินการ';
      return [
        `• <b>${esc(r.candidateName)}</b>`,
        `  สถานะ: ${STATUS_LABELS[r.status] ?? r.status} (${eligible})`,
        `  ${bonusText}`,
      ].join('\n');
    });

    await this.gateway.sendMessage({
      chatId,
      text: ['👥 <b>คนที่ฉันแนะนำ</b>', '', ...lines].join('\n'),
      parseMode: 'HTML',
    });
  }

  async handleCallback(
    account: { id: string; userId: string },
    chatId: number,
    data: string,
  ): Promise<boolean> {
    if (data === 'referral:my:list') {
      await this.showMyReferrals(account, chatId);
      return true;
    }
    return false;
  }
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
