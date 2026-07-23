// ============================================================================
// Telegram onboarding with multi-assignment commission declarations
// ============================================================================

import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuthService } from '../../../auth/auth.service';
import { CommissionDeclarationService } from '../../commission/application/commission-declaration.service';
import { DeclarationAssignmentInput } from '../../commission/domain/commission-declaration.types';
import { EmployeeGlobalId } from '../../employee/domain/value-objects/employee-global-id.vo';
import {
  GLOBAL_ID_SEQUENCE,
  GlobalIdSequence,
} from '../../employee/domain/services/global-id.service';
import { CompanyCodeCacheService } from './company-code-cache.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import { TelegramState, SessionContext } from '../domain/entities/telegram-session.types';

export interface OnboardingAssignmentDraft {
  companyCode: string;
  companyId: string;
  teamId: string;
  teamName: string;
  assignmentType: 'primary' | 'secondary';
  commissionMethod: 'team_pool' | 'big_leader_split' | 'none' | 'unsure';
  bigLeaderPercent?: number;
  employeePercent?: number;
}

export interface OnboardingDraft extends Record<string, unknown> {
  firstName?: string;
  lastName?: string;
  phone?: string;
  assignments?: OnboardingAssignmentDraft[];
  pendingCompanyCode?: string;
  pendingCompanyId?: string;
  pendingTeamId?: string;
  pendingTeamName?: string;
  pendingAssignmentType?: 'primary' | 'secondary';
  pendingCommissionMethod?: OnboardingAssignmentDraft['commissionMethod'];
  pendingBigLeaderPercent?: number;
  flow?: 'register' | 'correct';
  declarationId?: string;
  rejectReason?: string;
}

type SaveSessionFn = (accountId: string, state: TelegramState, context: SessionContext) => Promise<void>;
type AssignRoleFn = (userId: string, companyId: string) => Promise<void>;
type ShowMainMenuFn = (chatId: number, userId: string) => Promise<void>;

@Injectable()
export class TelegramOnboardingService {
  private readonly logger = new Logger(TelegramOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
    private readonly companyCache: CompanyCodeCacheService,
    private readonly auth: AuthService,
    private readonly commissionDeclarations: CommissionDeclarationService,
    @Inject(GLOBAL_ID_SEQUENCE) private readonly globalIdSequence: GlobalIdSequence,
  ) {}

  getDraft(context: SessionContext): OnboardingDraft {
    return (context.draft ?? {}) as OnboardingDraft;
  }

  async start(accountId: string, chatId: number, saveSession: SaveSessionFn): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: 'สวัสดีค่ะ 👋 ยังไม่พบข้อมูลของคุณในระบบ\nกรุณากรอกชื่อจริง:',
    });
    await saveSession(accountId, 'onboarding_name', { draft: {} });
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

    switch (state) {
      case 'onboarding_name':
        if (!text) {
          await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกชื่อจริง:' });
          return;
        }
        draft.firstName = text;
        await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกนามสกุล:' });
        await saveSession(account.id, 'onboarding_lastname', { draft });
        break;

      case 'onboarding_lastname':
        if (!text) {
          await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกนามสกุล:' });
          return;
        }
        draft.lastName = text;
        await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกเบอร์โทรศัพท์:' });
        await saveSession(account.id, 'onboarding_phone', { draft });
        break;

      case 'onboarding_phone': {
        const phone = text.replace(/\s/g, '');
        if (!/^\d{9,12}$/.test(phone)) {
          await this.gateway.sendMessage({ chatId, text: 'เบอร์โทรไม่ถูกต้อง กรุณากรอกเบอร์โทรศัพท์อีกครั้ง:' });
          return;
        }
        draft.phone = phone;
        draft.assignments = draft.assignments ?? [];
        await this.showAssignmentCompanyPicker(account.id, chatId, draft, saveSession);
        break;
      }

      case 'onboarding_assign_split_leader': {
        const pct = Number(text.replace(',', '.').trim());
        if (Number.isNaN(pct) || pct < 0 || pct > 100) {
          await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกเปอร์เซ็นต์ Big Leader (0-100):' });
          return;
        }
        draft.pendingBigLeaderPercent = pct;
        await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกเปอร์เซ็นต์ของคุณ (0-100):' });
        await saveSession(account.id, 'onboarding_assign_split_employee', { draft });
        break;
      }

      case 'onboarding_assign_split_employee': {
        const pct = Number(text.replace(',', '.').trim());
        if (Number.isNaN(pct) || pct < 0 || pct > 100) {
          await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกเปอร์เซ็นต์ของคุณ (0-100):' });
          return;
        }
        if (draft.pendingBigLeaderPercent != null && Math.round((draft.pendingBigLeaderPercent + pct) * 100) / 100 !== 100) {
          await this.gateway.sendMessage({
            chatId,
            text: `⚠️ เปอร์เซ็นต์รวมได้ ${draft.pendingBigLeaderPercent + pct}% (ควรรวม 100%) — กรุณากรอกเปอร์เซ็นต์ของคุณอีกครั้ง:`,
          });
          return;
        }
        await this.commitPendingAssignment(account.id, chatId, draft, saveSession, pct);
        break;
      }

      default:
        await this.gateway.sendMessage({ chatId, text: 'กรุณาเลือกจากปุ่มด้านล่าง หรือพิมพ์ /start เพื่อเริ่มใหม่' });
    }
  }

  async handleCallback(
    account: { id: string; userId: string },
    chatId: number,
    data: string,
    state: TelegramState,
    context: SessionContext,
    saveSession: SaveSessionFn,
    completeHooks: {
      assignDefaultEmployeeRole: AssignRoleFn;
      showMainMenu: ShowMainMenuFn;
    },
  ): Promise<void> {
    const draft = this.getDraft(context);
    draft.assignments = draft.assignments ?? [];

    if (data.startsWith('onboarding:assign:company:')) {
      const code = data.replace('onboarding:assign:company:', '');
      if (!this.companyCache.isKnownCode(code)) return;
      draft.pendingCompanyCode = code;
      draft.pendingCompanyId = this.companyCache.getIdByCode(code);
      await this.showAssignmentTeamPicker(account.id, chatId, draft, saveSession);
      return;
    }

    if (data.startsWith('onboarding:assign:team:')) {
      const teamId = data.replace('onboarding:assign:team:', '');
      const team = await this.prisma.marketingTeam.findFirst({
        where: { id: teamId, deletedAt: null, isActive: true },
        select: { id: true, name: true, companyId: true },
      });
      if (!team || team.companyId !== draft.pendingCompanyId) return;
      draft.pendingTeamId = team.id;
      draft.pendingTeamName = team.name;
      await this.showAssignmentTypePicker(account.id, chatId, draft, saveSession);
      return;
    }

    if (data.startsWith('onboarding:assign:type:')) {
      const type = data.replace('onboarding:assign:type:', '') as 'primary' | 'secondary';
      if (type !== 'primary' && type !== 'secondary') return;
      const hasPrimary = draft.assignments.some((a) => a.assignmentType === 'primary');
      if (type === 'primary' && hasPrimary) {
        await this.gateway.sendMessage({ chatId, text: 'มี PRIMARY แล้ว — เลือก SECONDARY สำหรับการมอบหมายเพิ่ม' });
        return;
      }
      if (type === 'secondary' && !hasPrimary && draft.assignments.length === 0) {
        await this.gateway.sendMessage({ chatId, text: 'การมอบหมายแรกต้องเป็น PRIMARY' });
        return;
      }
      draft.pendingAssignmentType = type;
      await this.showCommissionMethodPicker(account.id, chatId, draft, saveSession);
      return;
    }

    if (data.startsWith('onboarding:assign:method:')) {
      const method = data.replace('onboarding:assign:method:', '') as OnboardingAssignmentDraft['commissionMethod'];
      draft.pendingCommissionMethod = method;
      if (method === 'big_leader_split') {
        await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกเปอร์เซ็นต์ Big Leader (0-100):' });
        await saveSession(account.id, 'onboarding_assign_split_leader', { draft });
        return;
      }
      await this.commitPendingAssignment(account.id, chatId, draft, saveSession);
      return;
    }

    switch (data) {
      case 'onboarding:assign:more':
        await this.showAssignmentCompanyPicker(account.id, chatId, draft, saveSession);
        break;
      case 'onboarding:assign:done':
        await this.showFinalSummary(account.id, chatId, draft, saveSession);
        break;
      case 'onboarding:confirm':
        await this.complete(account, chatId, draft, saveSession, completeHooks);
        break;
      case 'onboarding:edit':
        await this.start(account.id, chatId, saveSession);
        break;
      default:
        if (state.startsWith('onboarding_')) {
          await this.gateway.sendMessage({ chatId, text: 'กรุณาเลือกจากปุ่มด้านล่าง' });
        }
    }
  }

  private async showAssignmentCompanyPicker(
    accountId: string,
    chatId: number,
    draft: OnboardingDraft,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: draft.assignments?.length
        ? 'เลือกบริษัทสำหรับการมอบหมายถัดไป:'
        : 'เลือกบริษัทหลัก (PRIMARY) ของคุณ:',
      replyMarkup: {
        inline_keyboard: this.companyCache.getActiveCodes().map((code) => [
          { text: code, callback_data: `onboarding:assign:company:${code}` },
        ]),
      },
    });
    await saveSession(accountId, 'onboarding_assign_company', { draft });
  }

  private async showAssignmentTeamPicker(
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
      await this.gateway.sendMessage({ chatId, text: 'ไม่พบทีมการตลาดในบริษัทนี้ กรุณาเลือกบริษัทอื่น' });
      await this.showAssignmentCompanyPicker(accountId, chatId, draft, saveSession);
      return;
    }
    await this.gateway.sendMessage({
      chatId,
      text: `เลือกทีม (${draft.pendingCompanyCode}):`,
      replyMarkup: {
        inline_keyboard: teams.map((t) => [
          { text: `${t.name} (${t.code})`, callback_data: `onboarding:assign:team:${t.id}` },
        ]),
      },
    });
    await saveSession(accountId, 'onboarding_assign_team', { draft });
  }

  private async showAssignmentTypePicker(
    accountId: string,
    chatId: number,
    draft: OnboardingDraft,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    const hasPrimary = (draft.assignments ?? []).some((a) => a.assignmentType === 'primary');
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    if (!hasPrimary) {
      rows.push([{ text: 'PRIMARY (หลัก)', callback_data: 'onboarding:assign:type:primary' }]);
    }
    rows.push([{ text: 'SECONDARY (รอง)', callback_data: 'onboarding:assign:type:secondary' }]);
    await this.gateway.sendMessage({
      chatId,
      text: 'เลือกประเภทการมอบหมาย:',
      replyMarkup: { inline_keyboard: rows },
    });
    await saveSession(accountId, 'onboarding_assign_type', { draft });
  }

  private async showCommissionMethodPicker(
    accountId: string,
    chatId: number,
    draft: OnboardingDraft,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: 'เลือกวิธีคิดค่าคอมมิชชั่นสำหรับการมอบหมายนี้:',
      replyMarkup: {
        inline_keyboard: [
          [{ text: 'TEAM POOL', callback_data: 'onboarding:assign:method:team_pool' }],
          [{ text: 'BIG LEADER SPLIT', callback_data: 'onboarding:assign:method:big_leader_split' }],
          [{ text: 'NONE', callback_data: 'onboarding:assign:method:none' }],
          [{ text: 'UNSURE', callback_data: 'onboarding:assign:method:unsure' }],
        ],
      },
    });
    await saveSession(accountId, 'onboarding_assign_method', { draft });
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
      await this.gateway.sendMessage({ chatId, text: '❌ ข้อมูลการมอบหมายไม่ครบ เริ่มใหม่' });
      await this.showAssignmentCompanyPicker(accountId, chatId, draft, saveSession);
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

    await this.showAddAssignmentMenu(accountId, chatId, draft, saveSession);
  }

  private async showAddAssignmentMenu(
    accountId: string,
    chatId: number,
    draft: OnboardingDraft,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    const lines = (draft.assignments ?? []).map((a, i) => (
      `${i + 1}. ${a.companyCode} / ${a.teamName} — ${a.assignmentType.toUpperCase()} — ${a.commissionMethod.toUpperCase()}`
      + (a.commissionMethod === 'big_leader_split'
        ? ` (${a.bigLeaderPercent}% / ${a.employeePercent}%)`
        : '')
    ));
    await this.gateway.sendMessage({
      chatId,
      text: `✅ บันทึกการมอบหมายแล้ว\n\n${lines.join('\n')}\n\nเพิ่มการมอบหมายอื่นหรือดำเนินการต่อ?`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '➕ เพิ่มการมอบหมาย', callback_data: 'onboarding:assign:more' }],
          [{ text: '➡️ ดำเนินการต่อ', callback_data: 'onboarding:assign:done' }],
        ],
      },
    });
    await saveSession(accountId, 'onboarding_assign_review', { draft });
  }

  private async showFinalSummary(
    accountId: string,
    chatId: number,
    draft: OnboardingDraft,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    const assignments = draft.assignments ?? [];
    const primaryCount = assignments.filter((a) => a.assignmentType === 'primary').length;
    if (assignments.length === 0 || primaryCount !== 1) {
      await this.gateway.sendMessage({
        chatId,
        text: '❌ ต้องมีอย่างน้อย 1 การมอบหมาย และมี PRIMARY ได้เพียง 1 รายการ',
      });
      await this.showAddAssignmentMenu(accountId, chatId, draft, saveSession);
      return;
    }

    const assignmentLines = assignments.map((a, i) => (
      `${i + 1}. 🏢 ${a.companyCode} | 👥 ${a.teamName}\n`
      + `   ${a.assignmentType.toUpperCase()} | ${a.commissionMethod.toUpperCase()}`
      + (a.commissionMethod === 'big_leader_split'
        ? ` (${a.bigLeaderPercent}% BL / ${a.employeePercent}% คุณ)`
        : '')
    )).join('\n');

    await this.gateway.sendMessage({
      chatId,
      text:
        `ยืนยันข้อมูล?\n\n`
        + `👤 ${draft.firstName ?? ''} ${draft.lastName ?? ''}\n`
        + `📱 ${draft.phone ?? ''}\n\n`
        + `📋 การมอบหมาย & ค่าคอม:\n${assignmentLines}`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '✅ ยืนยัน', callback_data: 'onboarding:confirm' }],
          [{ text: '❌ แก้ไข', callback_data: 'onboarding:edit' }],
        ],
      },
    });
    await saveSession(accountId, 'onboarding_confirm', { draft });
  }

  private async complete(
    account: { id: string; userId: string },
    chatId: number,
    draft: OnboardingDraft,
    saveSession: SaveSessionFn,
    hooks: { assignDefaultEmployeeRole: AssignRoleFn; showMainMenu: ShowMainMenuFn },
  ): Promise<void> {
    const firstName = draft.firstName?.trim();
    const lastName = draft.lastName?.trim();
    const phone = draft.phone?.trim();
    const assignments = draft.assignments ?? [];
    const primary = assignments.find((a) => a.assignmentType === 'primary');

    if (!firstName || !lastName || !phone || !primary) {
      await this.gateway.sendMessage({ chatId, text: '❌ ข้อมูลไม่ครบ กรุณาเริ่มใหม่ด้วย /start' });
      await this.start(account.id, chatId, saveSession);
      return;
    }

    const existingPhoneUser = await this.prisma.user.findFirst({
      where: { username: phone, deletedAt: null, id: { not: account.userId } },
    });
    if (existingPhoneUser) {
      await this.gateway.sendMessage({
        chatId,
        text: '❌ เบอร์โทรนี้มีในระบบแล้ว กรุณาติดต่อ HR หรือกรอกเบอร์อื่น',
      });
      await saveSession(account.id, 'onboarding_phone', { draft: { firstName, lastName } });
      await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกเบอร์โทรศัพท์:' });
      return;
    }

    const hireDate = new Date();
    const globalSeq = await this.globalIdSequence.next();
    const globalId = EmployeeGlobalId.fromSequence(globalSeq).value;
    const tempPassword = this.auth.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    let employeeId = '';

    try {
      await this.prisma.$transaction(async (tx) => {
        const employee = await tx.employee.create({
          data: {
            id: randomUUID(),
            globalId,
            firstName,
            lastName,
            phone,
            hireDate,
            employmentStatus: 'probation',
          },
        });
        employeeId = employee.id;

        for (const a of assignments) {
          await tx.employeeAssignment.create({
            data: {
              id: randomUUID(),
              employeeId: employee.id,
              companyId: a.companyId,
              roleLevel: 'employee',
              isPrimaryCompany: a.assignmentType === 'primary',
              isPrimaryTeam: false,
              effectiveFrom: hireDate,
            },
          });
        }

        await tx.user.update({
          where: { id: account.userId },
          data: {
            username: phone,
            passwordHash,
            employeeId: employee.id,
            isActive: true,
            mustChangePassword: true,
          },
        });

        await tx.telegramAccount.update({
          where: { id: account.id },
          data: { chatId: BigInt(chatId), isActive: true },
        });
      });

      const declarationAssignments: DeclarationAssignmentInput[] = assignments.map((a) => ({
        companyId: a.companyId,
        teamId: a.teamId,
        assignmentType: a.assignmentType,
        commissionMethod: a.commissionMethod,
        bigLeaderPercent: a.bigLeaderPercent ?? null,
        employeePercent: a.employeePercent ?? null,
      }));

      await this.commissionDeclarations.createSubmittedDeclaration(
        account.userId,
        employeeId,
        primary.companyId,
        declarationAssignments,
      );

      await hooks.assignDefaultEmployeeRole(account.userId, primary.companyId);

      await this.gateway.sendMessage({
        chatId,
        text:
          `🎉 ลงทะเบียนสำเร็จ! ยินดีต้อนรับ ${firstName}\n`
          + `รหัสผ่านชั่วคราว: ${tempPassword}\n`
          + `📋 ประกาศค่าคอมของคุณถูกส่งให้ HR ตรวจสอบแล้ว\n`
          + `กรุณาเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรกค่ะ`,
      });
      await saveSession(account.id, 'idle', {});
      await hooks.showMainMenu(chatId, account.userId);
    } catch (err: unknown) {
      this.logger.error('Onboarding registration failed', err);
      await this.gateway.sendMessage({
        chatId,
        text: `❌ ลงทะเบียนไม่สำเร็จ: ${(err as Error).message}`,
      });
    }
  }
}
