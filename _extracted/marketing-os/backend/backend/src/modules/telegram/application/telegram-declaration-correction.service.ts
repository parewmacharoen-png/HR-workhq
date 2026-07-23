// ============================================================================
// Telegram flow for correcting rejected commission declarations.
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CommissionDeclarationService } from '../../commission/application/commission-declaration.service';
import { DeclarationAssignmentInput } from '../../commission/domain/commission-declaration.types';
import { CompanyCodeCacheService } from './company-code-cache.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import { TelegramState, SessionContext } from '../domain/entities/telegram-session.types';
import {
  OnboardingAssignmentDraft,
  OnboardingDraft,
} from './telegram-onboarding.service';

type SaveSessionFn = (accountId: string, state: TelegramState, context: SessionContext) => Promise<void>;
type ShowMainMenuFn = (chatId: number, userId: string) => Promise<void>;

const PREFIX = 'declaration';

@Injectable()
export class TelegramDeclarationCorrectionService {
  private readonly logger = new Logger(TelegramDeclarationCorrectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
    private readonly companyCache: CompanyCodeCacheService,
    private readonly commissionDeclarations: CommissionDeclarationService,
  ) {}

  getDraft(context: SessionContext): OnboardingDraft {
    return (context.draft ?? {}) as OnboardingDraft;
  }

  async start(
    accountId: string,
    chatId: number,
    userId: string,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { employeeId: true },
    });
    if (!user?.employeeId) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    const rejected = await this.commissionDeclarations.getLatestRejectedDeclaration(user.employeeId);
    if (!rejected) {
      await this.gateway.sendMessage({ chatId, text: 'ไม่พบประกาศค่าคอมที่ต้องแก้ไข' });
      return;
    }

    const draft: OnboardingDraft = {
      flow: 'correct',
      declarationId: rejected.id,
      rejectReason: rejected.rejectReason ?? undefined,
      assignments: [],
    };

    await this.gateway.sendMessage({
      chatId,
      text:
        '✏️ <b>แก้ไขประกาศค่าคอม</b>\n'
        + (rejected.rejectReason ? `เหตุผลที่ถูกปฏิเสธ: ${rejected.rejectReason}\n\n` : '\n')
        + 'กรุณาเลือกบริษัทหลัก (PRIMARY) ใหม่:',
      parseMode: 'HTML',
    });
    await this.showCompanyPicker(accountId, chatId, draft, saveSession);
  }

  async handleText(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    state: TelegramState,
    context: SessionContext,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    const draft = this.getDraft(context);

    if (state === 'declaration_assign_split_leader') {
      const pct = Number(text.replace(',', '.').trim());
      if (Number.isNaN(pct) || pct < 0 || pct > 100) {
        await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกเปอร์เซ็นต์ Big Leader (0-100):' });
        return;
      }
      draft.pendingBigLeaderPercent = pct;
      await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกเปอร์เซ็นต์ของคุณ (0-100):' });
      await saveSession(account.id, 'declaration_assign_split_employee', { draft });
      return;
    }

    if (state === 'declaration_assign_split_employee') {
      const pct = Number(text.replace(',', '.').trim());
      if (Number.isNaN(pct) || pct < 0 || pct > 100) {
        await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกเปอร์เซ็นต์ของคุณ (0-100):' });
        return;
      }
      if (draft.pendingBigLeaderPercent != null
        && Math.round((draft.pendingBigLeaderPercent + pct) * 100) / 100 !== 100) {
        await this.gateway.sendMessage({
          chatId,
          text: `⚠️ เปอร์เซ็นต์รวมได้ ${draft.pendingBigLeaderPercent + pct}% (ควรรวม 100%) — กรุณากรอกเปอร์เซ็นต์ของคุณอีกครั้ง:`,
        });
        return;
      }
      await this.commitPendingAssignment(account.id, chatId, draft, saveSession, pct);
    }
  }

  async handleCallback(
    account: { id: string; userId: string },
    chatId: number,
    data: string,
    state: TelegramState,
    context: SessionContext,
    saveSession: SaveSessionFn,
    showMainMenu: ShowMainMenuFn,
  ): Promise<void> {
    const draft = this.getDraft(context);
    draft.assignments = draft.assignments ?? [];

    if (data.startsWith(`${PREFIX}:assign:company:`)) {
      const code = data.replace(`${PREFIX}:assign:company:`, '');
      if (!this.companyCache.isKnownCode(code)) return;
      draft.pendingCompanyCode = code;
      draft.pendingCompanyId = this.companyCache.getIdByCode(code);
      await this.showTeamPicker(account.id, chatId, draft, saveSession);
      return;
    }

    if (data.startsWith(`${PREFIX}:assign:team:`)) {
      const teamId = data.replace(`${PREFIX}:assign:team:`, '');
      const team = await this.prisma.marketingTeam.findFirst({
        where: { id: teamId, deletedAt: null, isActive: true },
        select: { id: true, name: true, companyId: true },
      });
      if (!team || team.companyId !== draft.pendingCompanyId) return;
      draft.pendingTeamId = team.id;
      draft.pendingTeamName = team.name;
      await this.showTypePicker(account.id, chatId, draft, saveSession);
      return;
    }

    if (data.startsWith(`${PREFIX}:assign:type:`)) {
      const type = data.replace(`${PREFIX}:assign:type:`, '') as 'primary' | 'secondary';
      const hasPrimary = draft.assignments.some((a) => a.assignmentType === 'primary');
      if (type === 'primary' && hasPrimary) {
        await this.gateway.sendMessage({ chatId, text: 'มี PRIMARY แล้ว — เลือก SECONDARY' });
        return;
      }
      if (type === 'secondary' && !hasPrimary && draft.assignments.length === 0) {
        await this.gateway.sendMessage({ chatId, text: 'การมอบหมายแรกต้องเป็น PRIMARY' });
        return;
      }
      draft.pendingAssignmentType = type;
      await this.showMethodPicker(account.id, chatId, draft, saveSession);
      return;
    }

    if (data.startsWith(`${PREFIX}:assign:method:`)) {
      const method = data.replace(`${PREFIX}:assign:method:`, '') as OnboardingAssignmentDraft['commissionMethod'];
      draft.pendingCommissionMethod = method;
      if (method === 'big_leader_split') {
        await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกเปอร์เซ็นต์ Big Leader (0-100):' });
        await saveSession(account.id, 'declaration_assign_split_leader', { draft });
        return;
      }
      await this.commitPendingAssignment(account.id, chatId, draft, saveSession);
      return;
    }

    switch (data) {
      case `${PREFIX}:assign:more`:
        await this.showCompanyPicker(account.id, chatId, draft, saveSession);
        break;
      case `${PREFIX}:assign:done`:
        await this.showFinalSummary(account.id, chatId, draft, saveSession);
        break;
      case `${PREFIX}:confirm`:
        await this.complete(account, chatId, draft, saveSession, showMainMenu);
        break;
      case `${PREFIX}:edit`:
        draft.assignments = [];
        await this.showCompanyPicker(account.id, chatId, draft, saveSession);
        break;
      case 'declaration:correct':
        await this.start(account.id, chatId, account.userId, saveSession);
        break;
      default:
        if (state.startsWith('declaration_')) {
          await this.gateway.sendMessage({ chatId, text: 'กรุณาเลือกจากปุ่มด้านล่าง' });
        }
    }
  }

  private async showCompanyPicker(
    accountId: string,
    chatId: number,
    draft: OnboardingDraft,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: draft.assignments?.length
        ? 'เลือกบริษัทสำหรับการมอบหมายถัดไป:'
        : 'เลือกบริษัทหลัก (PRIMARY):',
      replyMarkup: {
        inline_keyboard: this.companyCache.getActiveCodes().map((code) => [
          { text: code, callback_data: `${PREFIX}:assign:company:${code}` },
        ]),
      },
    });
    await saveSession(accountId, 'declaration_assign_company', { draft });
  }

  private async showTeamPicker(
    accountId: string,
    chatId: number,
    draft: OnboardingDraft,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    const companyId = draft.pendingCompanyId;
    if (!companyId) return;
    const teams = await this.prisma.marketingTeam.findMany({
      where: { companyId, isActive: true, deletedAt: null },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
    if (teams.length === 0) {
      await this.gateway.sendMessage({ chatId, text: 'ไม่พบทีมการตลาด กรุณาเลือกบริษัทอื่น' });
      await this.showCompanyPicker(accountId, chatId, draft, saveSession);
      return;
    }
    await this.gateway.sendMessage({
      chatId,
      text: `เลือกทีม (${draft.pendingCompanyCode}):`,
      replyMarkup: {
        inline_keyboard: teams.map((t) => [
          { text: `${t.name} (${t.code})`, callback_data: `${PREFIX}:assign:team:${t.id}` },
        ]),
      },
    });
    await saveSession(accountId, 'declaration_assign_team', { draft });
  }

  private async showTypePicker(
    accountId: string,
    chatId: number,
    draft: OnboardingDraft,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    const hasPrimary = (draft.assignments ?? []).some((a) => a.assignmentType === 'primary');
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    if (!hasPrimary) {
      rows.push([{ text: 'PRIMARY (หลัก)', callback_data: `${PREFIX}:assign:type:primary` }]);
    }
    rows.push([{ text: 'SECONDARY (รอง)', callback_data: `${PREFIX}:assign:type:secondary` }]);
    await this.gateway.sendMessage({
      chatId,
      text: 'เลือกประเภทการมอบหมาย:',
      replyMarkup: { inline_keyboard: rows },
    });
    await saveSession(accountId, 'declaration_assign_type', { draft });
  }

  private async showMethodPicker(
    accountId: string,
    chatId: number,
    draft: OnboardingDraft,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: 'เลือกวิธีคิดค่าคอมมิชชั่น:',
      replyMarkup: {
        inline_keyboard: [
          [{ text: 'TEAM POOL', callback_data: `${PREFIX}:assign:method:team_pool` }],
          [{ text: 'BIG LEADER SPLIT', callback_data: `${PREFIX}:assign:method:big_leader_split` }],
          [{ text: 'NONE', callback_data: `${PREFIX}:assign:method:none` }],
          [{ text: 'UNSURE', callback_data: `${PREFIX}:assign:method:unsure` }],
        ],
      },
    });
    await saveSession(accountId, 'declaration_assign_method', { draft });
  }

  private async commitPendingAssignment(
    accountId: string,
    chatId: number,
    draft: OnboardingDraft,
    saveSession: SaveSessionFn,
    employeePercent?: number,
  ): Promise<void> {
    if (!draft.pendingCompanyId || !draft.pendingCompanyCode || !draft.pendingTeamId
      || !draft.pendingTeamName || !draft.pendingAssignmentType || !draft.pendingCommissionMethod) {
      await this.gateway.sendMessage({ chatId, text: '❌ ข้อมูลไม่ครบ เริ่มใหม่' });
      await this.showCompanyPicker(accountId, chatId, draft, saveSession);
      return;
    }

    const assignment: OnboardingAssignmentDraft = {
      companyCode: draft.pendingCompanyCode,
      companyId: draft.pendingCompanyId,
      teamId: draft.pendingTeamId,
      teamName: draft.pendingTeamName,
      assignmentType: draft.pendingAssignmentType,
      commissionMethod: draft.pendingCommissionMethod,
    };
    if (draft.pendingCommissionMethod === 'big_leader_split') {
      assignment.bigLeaderPercent = draft.pendingBigLeaderPercent;
      assignment.employeePercent = employeePercent;
    }

    draft.assignments = [...(draft.assignments ?? []), assignment];
    draft.pendingCompanyCode = undefined;
    draft.pendingCompanyId = undefined;
    draft.pendingTeamId = undefined;
    draft.pendingTeamName = undefined;
    draft.pendingAssignmentType = undefined;
    draft.pendingCommissionMethod = undefined;
    draft.pendingBigLeaderPercent = undefined;

    const lines = (draft.assignments ?? []).map((a, i) => (
      `${i + 1}. ${a.companyCode} / ${a.teamName} — ${a.assignmentType.toUpperCase()} — ${a.commissionMethod.toUpperCase()}`
      + (a.commissionMethod === 'big_leader_split' ? ` (${a.bigLeaderPercent}% / ${a.employeePercent}%)` : '')
    ));
    await this.gateway.sendMessage({
      chatId,
      text: `✅ บันทึกแล้ว\n\n${lines.join('\n')}\n\nเพิ่มการมอบหมายหรือดำเนินการต่อ?`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '➕ เพิ่มการมอบหมาย', callback_data: `${PREFIX}:assign:more` }],
          [{ text: '➡️ ดำเนินการต่อ', callback_data: `${PREFIX}:assign:done` }],
        ],
      },
    });
    await saveSession(accountId, 'declaration_assign_review', { draft });
  }

  private async showFinalSummary(
    accountId: string,
    chatId: number,
    draft: OnboardingDraft,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    const assignments = draft.assignments ?? [];
    if (assignments.length === 0 || assignments.filter((a) => a.assignmentType === 'primary').length !== 1) {
      await this.gateway.sendMessage({ chatId, text: '❌ ต้องมี PRIMARY 1 รายการ' });
      await saveSession(accountId, 'declaration_assign_review', { draft });
      return;
    }

    const lines = assignments.map((a, i) => (
      `${i + 1}. 🏢 ${a.companyCode} | 👥 ${a.teamName}\n`
      + `   ${a.assignmentType.toUpperCase()} | ${a.commissionMethod.toUpperCase()}`
      + (a.commissionMethod === 'big_leader_split'
        ? ` (${a.bigLeaderPercent}% BL / ${a.employeePercent}%)`
        : '')
    )).join('\n');

    await this.gateway.sendMessage({
      chatId,
      text: `ยืนยันการส่งประกาศค่าคอมใหม่?\n\n${lines}`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '✅ ยืนยันส่งใหม่', callback_data: `${PREFIX}:confirm` }],
          [{ text: '❌ แก้ไข', callback_data: `${PREFIX}:edit` }],
        ],
      },
    });
    await saveSession(accountId, 'declaration_confirm', { draft });
  }

  private async complete(
    account: { id: string; userId: string },
    chatId: number,
    draft: OnboardingDraft,
    saveSession: SaveSessionFn,
    showMainMenu: ShowMainMenuFn,
  ): Promise<void> {
    const assignments = draft.assignments ?? [];
    const primary = assignments.find((a) => a.assignmentType === 'primary');
    const declarationId = draft.declarationId;
    if (!primary || !declarationId) {
      await this.gateway.sendMessage({ chatId, text: '❌ ข้อมูลไม่ครบ เริ่มใหม่' });
      return;
    }

    const user = await this.prisma.user.findFirst({
      where: { id: account.userId, deletedAt: null },
      select: { employeeId: true },
    });
    if (!user?.employeeId) return;

    const declarationAssignments: DeclarationAssignmentInput[] = assignments.map((a) => ({
      companyId: a.companyId,
      teamId: a.teamId,
      assignmentType: a.assignmentType,
      commissionMethod: a.commissionMethod,
      bigLeaderPercent: a.bigLeaderPercent ?? null,
      employeePercent: a.employeePercent ?? null,
    }));

    try {
      await this.commissionDeclarations.resubmitDeclaration(
        account.userId,
        user.employeeId,
        declarationId,
        declarationAssignments,
      );
      await this.gateway.sendMessage({
        chatId,
        text: '📋 ส่งประกาศค่าคอมที่แก้ไขแล้ว — รอ HR/Owner ตรวจสอบ',
      });
      await saveSession(account.id, 'idle', {});
      await showMainMenu(chatId, account.userId);
    } catch (err: unknown) {
      this.logger.error('Declaration correction failed', err);
      await this.gateway.sendMessage({
        chatId,
        text: `❌ ส่งไม่สำเร็จ: ${(err as Error).message}`,
      });
    }
  }
}
