import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';

@Injectable()
export class EmployeeReferralTelegramNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  async notifySubmitted(referralId: string): Promise<void> {
    const r = await this.load(referralId);
    if (!r) return;
    await this.notify(r.referrerEmployeeId, [
      '👥 <b>ส่งข้อมูลแนะนำคนเรียบร้อยแล้ว</b>',
      `ชื่อผู้สมัคร: ${esc(r.candidateName)}`,
      '',
      'หากผู้สมัครผ่านทดลองงาน ระบบจะแจ้งสิทธิ์โบนัสให้อัตโนมัติ',
    ].join('\n'));
  }

  async notifyHired(referralId: string): Promise<void> {
    const r = await this.load(referralId);
    if (!r) return;
    await this.notify(r.referrerEmployeeId, `🎉 ผู้สมัคร <b>${esc(r.candidateName)}</b> ได้รับการจ้างแล้ว`);
  }

  async notifyProbationPassed(referralId: string): Promise<void> {
    const r = await this.load(referralId);
    if (!r) return;
    await this.notify(r.referrerEmployeeId, `✅ ผู้สมัคร <b>${esc(r.candidateName)}</b> ผ่านทดลองงานแล้ว`);
  }

  async notifyBonusEligible(referralId: string): Promise<void> {
    const r = await this.load(referralId);
    if (!r) return;
    await this.notify(r.referrerEmployeeId, '💰 คุณมีสิทธิ์ได้รับโบนัสแนะนำคน — รอ HR อนุมัติ');
  }

  async notifyBonusApproved(referralId: string): Promise<void> {
    const r = await this.load(referralId);
    if (!r) return;
    await this.notify(r.referrerEmployeeId, '✅ โบนัสแนะนำคนได้รับการอนุมัติแล้ว');
  }

  async notifyBonusPaid(referralId: string): Promise<void> {
    const r = await this.load(referralId);
    if (!r) return;
    await this.notify(r.referrerEmployeeId, '💵 โบนัสแนะนำคนถูกจ่ายแล้ว');
  }

  async notifyBonusRejected(referralId: string, reason: string): Promise<void> {
    const r = await this.load(referralId);
    if (!r) return;
    await this.notify(r.referrerEmployeeId, [
      '❌ <b>โบนัสแนะนำคนไม่ได้รับการอนุมัติ</b>',
      reason ? esc(reason) : '',
    ].filter(Boolean).join('\n'));
  }

  private async load(referralId: string) {
    return this.prisma.employeeReferral.findUnique({ where: { id: referralId } });
  }

  private async notify(employeeId: string, text: string): Promise<void> {
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
      messageType: 'referral_notice',
      telegramAccountId: account.id,
    }).catch(() => undefined);
  }
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
