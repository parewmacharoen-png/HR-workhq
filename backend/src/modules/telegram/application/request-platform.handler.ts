import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import { RequestTypeService } from '../../request/application/request-type.service';
import { RequestInstanceService } from '../../request/application/request-instance.service';
import { RequestFormFieldService } from '../../request/application/request-form-field.service';
import { RequestApprovalService } from '../../request/application/request-approval.service';
import { EmployeeReferralService } from '../../request/application/employee-referral.service';
import { evaluateCondition, FieldCondition } from '../../request/application/request-condition.util';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { TelegramFormUxService } from './telegram-form-ux.service';
import {
  formatIsoDateAsDdMmYyyy,
  isThaiMultiDateInput,
  parseThaiDateInput,
  parseThaiMultiDateInput,
  THAI_DATE_INPUT_HINT,
  THAI_MULTI_DATE_INPUT_HINT,
  THAI_MULTI_DATE_VALIDATION_ERROR,
} from '../../../shared/time/thai-date-input.util';
import { normalizeThaiTimeInput } from '../../../shared/time/thai-time-input.util';
import { FormUxAuditService } from './form-ux-audit.service';
import { RequestTelegramNotifier } from './request.notifier';
import { RequestAttendanceGuardService } from '../../request/application/request-attendance-guard.service';
import { normalizeCallbackSourceMessage } from './telegram-callback-message.util';
import {
  QUICK_AMOUNT_FIELD_TYPES,
  QUICK_DATE_FIELD_TYPES,
  QUICK_TIME_FIELD_TYPES,
  TELEGRAM_SKIP_FIELD_TYPES,
} from './telegram-form-ux.constants';

function tgActor(userId: string, companyId: string | null): ActorContext {
  return { userId, companyId, impersonatorUserId: null };
}

const TELEGRAM_REQUEST_INTROS: Record<string, string> = {
  leave_request:
    '📅 <b>ขอวันลา</b>\nประเภท → วันที่ลา (หลายวันได้) → รูปแบบ → เหตุผล\n' +
    '💡 แจ้งล่วงหน้า 7 วัน (นับจากวันที่ส่งคำขอถึงวันลา) — ไม่ครบอาจถูกหักเงินเดือน\n' +
    '⏳ รอเจ้าของ/หัวหน้าอนุมัติ',
  ot_request:
    '⏰ <b>ขอ OT</b>\nวันที่ → เวลาเริ่ม-สิ้นสุด (หลังเลิกกะเท่านั้น) → เหตุผล\n⚠️ ต้องเช็กอินเข้างานวันนั้นก่อน\n⏳ รอเจ้าของอนุมัติ',
  no_break_report:
    '☕ <b>แจ้งไม่พักเบรก</b>\nเลือกวันที่ → หมายเหตุ (ถ้ามี)\n⚠️ ต้องเช็กอินและไม่มีการพักเบรกวันนั้น\n💰 คำนวณ OT ตามเวลาพักของบริษัท\n⏳ รอเจ้าของอนุมัติ',
  advance_pay:
    '💸 <b>ขอเบิกล่วงหน้า</b>\nจำนวนเงิน → เหตุผล → วันที่ต้องการรับ\n⏳ รอเจ้าของอนุมัติ',
  time_correction:
    '🕒 <b>แก้ไขเวลาเข้างาน</b>\nวันที่ → ประเภท → เวลา → เหตุผล\n⏳ รอหัวหน้าอนุมัติ',
  shift_change:
    '🔁 <b>เปลี่ยนกะ</b>\nกะที่ต้องการ → วันที่มีผล → เหตุผล\n⏳ รอหัวหน้าอนุมัติ',
  off_day_change:
    '🗓 <b>เปลี่ยนวันหยุด</b>\nวันหยุดเดิม → วันหยุดใหม่ → เหตุผล\n'
    + 'เมื่ออนุมัติจะยกเลิกวันเก่าและตั้งวันใหม่ (คิดแจ้งล่วงหน้าจากวันที่ยื่นคำขอเปลี่ยน)\n'
    + '⏳ รอหัวหน้าอนุมัติ',
  document_request:
    '📄 <b>ขอเอกสาร</b>\nประเภท → ภาษา → วัตถุประสงค์ → วิธีรับ\n⏳ รอเลขา/HR',
  generic_request:
    '📝 <b>คำร้องทั่วไป</b>\nหัวข้อ → รายละเอียด',
};

interface SessionLike {
  id: string;
  userId: string;
}

interface RequestDraft {
  requestId: string;
  typeId: string;
  typeKey?: string;
  companyId?: string;
  userId?: string;
  fieldIndex: number;
  values: Record<string, unknown>;
  manualInput?: boolean;
  /** Telegram message id reused for the whole form (edit-in-place). */
  uiMessageId?: number;
}

type FormField = {
  key: string;
  labelTh: string;
  helpText?: string | null;
  fieldType: string;
  required: boolean;
  optionsJson?: unknown;
  validationJson?: unknown;
  visibilityConditionJson?: unknown;
};

@Injectable()
export class RequestPlatformTelegramHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
    private readonly types: RequestTypeService,
    private readonly instances: RequestInstanceService,
    private readonly fields: RequestFormFieldService,
    private readonly approval: RequestApprovalService,
    private readonly referrals: EmployeeReferralService,
    private readonly formUx: TelegramFormUxService,
    private readonly formUxAudit: FormUxAuditService,
    private readonly requestNotifier: RequestTelegramNotifier,
    private readonly attendanceGuard: RequestAttendanceGuardService,
  ) {}

  async showRequestMenu(chatId: number, sourceMessage?: unknown): Promise<void> {
    await this.upsertUiMessage(
      chatId,
      '📋 <b>ศูนย์คำร้อง</b>\nเลือกเมนูด้านล่าง',
      {
        inline_keyboard: [
          [{ text: '➕ สร้างคำร้องใหม่', callback_data: 'request:new' }],
          [{ text: '📂 คำร้องของฉัน', callback_data: 'request:mine' }],
          [{ text: '⏳ รออนุมัติ', callback_data: 'request:mine:pending' }],
          [{ text: '✅ อนุมัติแล้ว', callback_data: 'request:mine:approved' }],
          [{ text: '❌ ไม่อนุมัติ', callback_data: 'request:mine:rejected' }],
          [{ text: '🏠 เมนูหลัก', callback_data: 'home' }],
        ],
      },
      { sourceMessage },
    );
  }

  async handleCallback(
    account: SessionLike,
    chatId: number,
    data: string,
    actor: { userId: string; companyId?: string | null },
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
    context: Record<string, unknown> = {},
    sourceMessage?: unknown,
  ): Promise<boolean> {
    try {
      return await this.handleCallbackInner(
        account, chatId, data, actor, saveSession, context, sourceMessage,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      await this.upsertUiMessage(
        chatId,
        `❌ ${message}\n\nลองกดเมนูคำร้องใหม่`,
        {
          inline_keyboard: [
            [{ text: '📋 ศูนย์คำร้อง', callback_data: 'request:menu' }],
            [{ text: '🏠 เมนูหลัก', callback_data: 'home' }],
          ],
        },
        { sourceMessage, draft: context.draft as RequestDraft | undefined },
      );
      return true;
    }
  }

  private async handleCallbackInner(
    account: SessionLike,
    chatId: number,
    data: string,
    actor: { userId: string; companyId?: string | null },
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
    context: Record<string, unknown> = {},
    sourceMessage?: unknown,
  ): Promise<boolean> {
    if (data === 'request:menu') {
      await this.showRequestMenu(chatId, sourceMessage);
      return true;
    }
    if (data === 'request:new') {
      await this.showTypePicker(account, chatId, actor, sourceMessage);
      return true;
    }
    if (data === 'request:quick:no_break') {
      await this.startNoBreakReportRequest(account, chatId, actor, saveSession, sourceMessage);
      return true;
    }
    if (data.startsWith('request:type:')) {
      const typeId = data.replace('request:type:', '');
      await this.startRequestForm(account, chatId, typeId, actor, saveSession, sourceMessage);
      return true;
    }
    if (data === 'req:resume:continue') {
      await this.continueDraftForm(account, chatId, actor, context, saveSession, sourceMessage);
      return true;
    }
    if (data === 'req:resume:fresh') {
      await this.startFreshRequestForm(account, chatId, actor, context, saveSession, sourceMessage);
      return true;
    }
    if (data === 'request:mine' || data.startsWith('request:mine:')) {
      await this.showMyRequests(
        account,
        chatId,
        data.replace('request:mine', '').replace(/^:/, '') || undefined,
        sourceMessage,
      );
      return true;
    }
    if (data.startsWith('request:approve:')) {
      const id = data.replace('request:approve:', '');
      await this.approveFromTelegram(account, chatId, id, sourceMessage);
      return true;
    }
    if (data.startsWith('request:reject:')) {
      const id = data.replace('request:reject:', '');
      await saveSession('request:rejecting', { draft: { requestId: id, sourceMessage } });
      await this.gateway.sendMessage({ chatId, text: 'กรุณาระบุเหตุผลที่ไม่อนุมัติ' });
      return true;
    }
    if (data.startsWith('request:detail:')) {
      const id = data.replace('request:detail:', '');
      await this.showRequestDetail(account, chatId, id);
      return true;
    }

    if (data.startsWith('req:pick:')) {
      const encoded = data.slice('req:pick:'.length);
      await this.applyCallbackValue(account, chatId, actor, context, saveSession, encoded, false, sourceMessage);
      return true;
    }
    if (data.startsWith('req:date:')) {
      const preset = data.slice('req:date:'.length);
      if (preset === 'manual') {
        const draft = await this.resolveDraftContext(account, chatId, actor, context, saveSession);
        if (!draft) return true;
        await this.promptManualInput(account, chatId, context, saveSession, 'date', sourceMessage);
        return true;
      }
      const date = this.formUx.resolveQuickDate(preset);
      if (!date) {
        await this.upsertUiMessage(chatId, '❌ ไม่สามารถเลือกวันที่ได้ กรุณาลองใหม่', {
          inline_keyboard: this.formUx.navRows(),
        }, { sourceMessage, draft: context.draft as RequestDraft | undefined });
        return true;
      }
      await this.applyCallbackValue(account, chatId, actor, context, saveSession, date, false, sourceMessage);
      return true;
    }
    if (data.startsWith('req:time:')) {
      const part = data.slice('req:time:'.length);
      if (part === 'manual') {
        const draft = await this.resolveDraftContext(account, chatId, actor, context, saveSession);
        if (!draft) return true;
        await this.promptManualInput(account, chatId, context, saveSession, 'time', sourceMessage);
        return true;
      }
      const time = part.replace('-', ':');
      await this.applyCallbackValue(account, chatId, actor, context, saveSession, time, false, sourceMessage);
      return true;
    }
    if (data.startsWith('req:amt:')) {
      const part = data.slice('req:amt:'.length);
      if (part === 'manual') {
        const draft = await this.resolveDraftContext(account, chatId, actor, context, saveSession);
        if (!draft) return true;
        await this.promptManualInput(account, chatId, context, saveSession, 'amount', sourceMessage);
        return true;
      }
      await this.applyCallbackValue(account, chatId, actor, context, saveSession, part, false, sourceMessage);
      return true;
    }
    if (data === 'req:back') {
      await this.goBackField(account, chatId, actor, context, saveSession, sourceMessage);
      return true;
    }
    if (data === 'req:cancel') {
      const draft = context.draft as RequestDraft | undefined;
      const resume = context.resume as { requestId?: string } | undefined;
      const requestId = draft?.requestId ?? resume?.requestId;
      await this.formUxAudit.log(tgActor(account.userId, actor.companyId ?? null), 'form_cancelled', {
        requestId,
      });
      if (requestId && actor.companyId) {
        try {
          await this.instances.cancelDraft(tgActor(account.userId, actor.companyId), requestId);
        } catch {
          // draft may already be submitted or missing
        }
      }
      await saveSession('idle', {});
      await this.upsertUiMessage(chatId, '❌ ยกเลิกคำร้องแล้ว', { inline_keyboard: [] }, {
        sourceMessage,
        draft,
      });
      return true;
    }
    if (data === 'req:submit') {
      await this.submitFromConfirm(account, chatId, actor, context, saveSession, sourceMessage);
      return true;
    }
    if (data === 'req:edit') {
      const draft = context.draft as RequestDraft;
      if (draft) {
        draft.fieldIndex = 0;
        draft.manualInput = false;
        await saveSession('request:field:0', { draft });
        const version = await this.types.getPublishedVersion(draft.typeId);
        const visible = this.getVisibleFields(version?.formFields ?? [], draft.values);
        if (visible[0]) {
          await this.askField(chatId, visible[0], draft.fieldIndex, draft, actor, sourceMessage);
        }
      }
      return true;
    }

    if (data === 'referral:candidate:menu') {
      await saveSession('referral:candidate:name', { draft: {} });
      await this.gateway.sendMessage({ chatId, text: '👥 กรุณากรอกชื่อผู้สมัคร' });
      return true;
    }
    return false;
  }

  async handleTextState(
    account: SessionLike,
    chatId: number,
    text: string,
    state: string,
    context: Record<string, unknown>,
    actor: { userId: string; companyId?: string | null },
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
  ): Promise<boolean> {
    if (state.startsWith('request:field:')) {
      await this.onFieldInput(account, chatId, text, context, actor, saveSession);
      return true;
    }
    if (state === 'request:confirm') {
      if (text === 'ส่งคำร้อง' || text === 'ยืนยัน') {
        await this.submitFromConfirm(account, chatId, actor, context, saveSession);
      } else if (text === 'ยกเลิก') {
        await saveSession('idle', {});
        await this.gateway.sendMessage({ chatId, text: 'ยกเลิกคำร้องแล้ว' });
      }
      return true;
    }
    if (state === 'request:rejecting') {
      const draft = context.draft as { requestId?: string; sourceMessage?: unknown };
      if (draft?.requestId) {
        await this.approval.reject(
          tgActor(account.userId, actor.companyId ?? null),
          draft.requestId,
          { note: text },
        );
        await saveSession('idle', {});
        const source = normalizeCallbackSourceMessage(draft.sourceMessage, chatId);
        if (source) {
          const updated = await this.requestNotifier.editApproverOutcomeMessage(
            source.chat.id,
            source.message_id,
            draft.requestId,
            false,
            text,
          );
          if (!updated) {
            await this.sendApproverOutcomeFallback(chatId, draft.requestId, false, text);
          }
        } else {
          await this.sendApproverOutcomeFallback(chatId, draft.requestId, false, text);
        }
      }
      return true;
    }
    if (state === 'referral:candidate:name') {
      await saveSession('referral:candidate:phone', { draft: { ...(context.draft as object), candidateName: text } });
      await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกเบอร์โทรผู้สมัคร' });
      return true;
    }
    if (state === 'referral:candidate:phone') {
      const draft = { ...(context.draft as Record<string, unknown>), candidatePhone: text };
      await saveSession('referral:candidate:position', { draft });
      await this.gateway.sendMessage({ chatId, text: 'ตำแหน่งที่สมัคร (ถ้ามี)' });
      return true;
    }
    if (state === 'referral:candidate:position') {
      const draft = context.draft as Record<string, unknown>;
      const companyId = actor.companyId;
      if (!companyId) {
        await this.gateway.sendMessage({ chatId, text: 'ไม่พบบริษัท — ติดต่อ HR' });
        return true;
      }
      await this.referrals.create(
        tgActor(account.userId, companyId),
        {
          companyId,
          candidateName: String(draft.candidateName),
          candidatePhone: String(draft.candidatePhone),
          targetPosition: text || undefined,
        },
      );
      await saveSession('idle', {});
      await this.gateway.sendMessage({
        chatId,
        text: '👥 ส่งข้อมูลแนะนำคนเรียบร้อยแล้ว\n\nหากผู้สมัครผ่านทดลองงาน ระบบจะแจ้งสิทธิ์โบนัสให้อัตโนมัติ',
      });
      return true;
    }
    return false;
  }

  private async showTypePicker(
    account: SessionLike,
    chatId: number,
    actor: { userId: string; companyId?: string | null },
    sourceMessage?: unknown,
  ): Promise<void> {
    const access = await this.prisma.user.findUnique({
      where: { id: account.userId },
      select: { employeeId: true },
    });
    if (!access?.employeeId || !actor.companyId) {
      await this.upsertUiMessage(chatId, 'ไม่พบข้อมูลพนักงาน', { inline_keyboard: [] }, { sourceMessage });
      return;
    }
    const types = await this.types.listAvailableForTelegram(access.employeeId, actor.companyId);
    if (!types.length) {
      await this.upsertUiMessage(chatId, 'ยังไม่มีประเภทคำร้องที่เปิดใช้งาน', { inline_keyboard: [] }, { sourceMessage });
      return;
    }
    await this.upsertUiMessage(
      chatId,
      '📋 <b>เลือกประเภทคำร้อง</b>',
      {
        inline_keyboard: [
          ...types.map((t) => [{
            text: `${t.icon ?? '📝'} ${t.nameTh}`,
            callback_data: `request:type:${t.id}`,
          }]),
          [
            { text: '⬅️ ย้อนกลับ', callback_data: 'request:menu' },
            { text: '❌ ยกเลิก', callback_data: 'req:cancel' },
          ],
        ],
      },
      { sourceMessage },
    );
  }

  private async startRequestForm(
    account: SessionLike,
    chatId: number,
    typeId: string,
    actor: { userId: string; companyId?: string | null },
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
    sourceMessage?: unknown,
  ): Promise<void> {
    if (!actor.companyId) {
      await this.gateway.sendMessage({ chatId, text: 'ไม่พบบริษัท' });
      return;
    }

    const existing = await this.instances.findLatestDraftForType(
      tgActor(account.userId, actor.companyId),
      typeId,
      actor.companyId,
    );
    if (existing?.hasProgress) {
      await saveSession('request:resume_choice', {
        resume: { typeId, requestId: existing.id, values: existing.values },
      });
      await this.gateway.sendMessage({
        chatId,
        text: '📝 พบคำร้องที่กรอกค้างไว้\nต้องการทำต่อหรือเริ่มใหม่?',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '▶️ ทำต่อ', callback_data: 'req:resume:continue' }],
            [{ text: '🆕 เริ่มใหม่', callback_data: 'req:resume:fresh' }],
            [{ text: '❌ ยกเลิก', callback_data: 'req:cancel' }],
          ],
        },
      });
      return;
    }

    await this.beginRequestForm(account, chatId, typeId, actor, saveSession, sourceMessage);
  }

  private async continueDraftForm(
    account: SessionLike,
    chatId: number,
    actor: { userId: string; companyId?: string | null },
    context: Record<string, unknown>,
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
    sourceMessage?: unknown,
  ): Promise<void> {
    const resume = context.resume as { typeId?: string; requestId?: string; values?: Record<string, unknown> } | undefined;
    if (!resume?.typeId || !resume.requestId) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบแบบร่าง กรุณาเริ่มใหม่' });
      return;
    }
    const { draft, visible, needsConfirm } = await this.buildDraftState(
      resume.typeId,
      resume.requestId,
      resume.values ?? {},
      {
        companyId: actor.companyId ?? undefined,
        userId: account.userId,
      },
    );
    this.captureUiMessageId(draft, sourceMessage);
    context.draft = draft;
    if (needsConfirm) {
      await this.showConfirmSummary(chatId, visible, draft, saveSession, actor, sourceMessage);
      return;
    }
    const field = visible[draft.fieldIndex];
    if (!field) {
      await this.showConfirmSummary(chatId, visible, draft, saveSession, actor, sourceMessage);
      return;
    }
    await saveSession(`request:field:${draft.fieldIndex}`, { draft });
    await this.askField(chatId, field, draft.fieldIndex, draft, actor, sourceMessage);
  }

  private async startFreshRequestForm(
    account: SessionLike,
    chatId: number,
    actor: { userId: string; companyId?: string | null },
    context: Record<string, unknown>,
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
    sourceMessage?: unknown,
  ): Promise<void> {
    const resume = context.resume as { typeId?: string; requestId?: string } | undefined;
    if (resume?.requestId && actor.companyId) {
      try {
        await this.instances.cancelDraft(
          tgActor(account.userId, actor.companyId),
          resume.requestId,
          'เริ่มคำร้องใหม่',
        );
      } catch {
        // ignore stale draft
      }
    }
    if (!resume?.typeId) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบประเภทคำร้อง กรุณาเลือกใหม่' });
      return;
    }
    await this.beginRequestForm(account, chatId, resume.typeId, actor, saveSession, sourceMessage);
  }

  private async beginRequestForm(
    account: SessionLike,
    chatId: number,
    typeId: string,
    actor: { userId: string; companyId?: string | null },
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
    sourceMessage?: unknown,
  ): Promise<void> {
    if (!actor.companyId) return;

    const draftRow = await this.instances.createDraft(
      tgActor(account.userId, actor.companyId),
      typeId,
      actor.companyId,
    );
    const version = await this.types.getPublishedVersion(typeId);
    const fields = this.getVisibleFields(version?.formFields ?? [], {});
    const typeRow = await this.prisma.requestType.findUnique({
      where: { id: typeId },
      select: { key: true },
    });
    const draft: RequestDraft = {
      requestId: draftRow.id,
      typeId,
      typeKey: typeRow?.key,
      companyId: actor.companyId ?? undefined,
      userId: account.userId,
      fieldIndex: 0,
      values: {},
    };
    this.captureUiMessageId(draft, sourceMessage);
    await saveSession('request:field:0', { draft });

    if (!fields.length) {
      await this.showConfirmSummary(chatId, [], draft, saveSession, actor, sourceMessage);
      return;
    }
    await this.askField(chatId, fields[0], 0, draft, actor, sourceMessage);
  }

  private async buildDraftState(
    typeId: string,
    requestId: string,
    values: Record<string, unknown>,
    meta?: { typeKey?: string; companyId?: string; userId?: string },
  ): Promise<{ draft: RequestDraft; visible: FormField[]; needsConfirm: boolean }> {
    const version = await this.types.getPublishedVersion(typeId);
    const visible = this.getVisibleFields(version?.formFields ?? [], values);
    let fieldIndex = 0;
    let allFilled = visible.length > 0;
    for (let i = 0; i < visible.length; i++) {
      const val = values[visible[i].key];
      if (val === undefined || val === null || val === '') {
        fieldIndex = i;
        allFilled = false;
        break;
      }
    }
    if (allFilled) fieldIndex = visible.length;
    let typeKey = meta?.typeKey;
    if (!typeKey) {
      const typeRow = await this.prisma.requestType.findUnique({
        where: { id: typeId },
        select: { key: true },
      });
      typeKey = typeRow?.key;
    }
    return {
      draft: {
        requestId,
        typeId,
        typeKey,
        companyId: meta?.companyId,
        userId: meta?.userId,
        fieldIndex,
        values,
      },
      visible,
      needsConfirm: allFilled,
    };
  }

  private async resolveDraftContext(
    account: SessionLike,
    chatId: number,
    actor: { userId: string; companyId?: string | null },
    context: Record<string, unknown>,
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
  ): Promise<RequestDraft | null> {
    const existing = context.draft as RequestDraft | undefined;
    if (existing?.requestId && existing?.typeId) {
      existing.companyId = existing.companyId ?? actor.companyId ?? undefined;
      existing.userId = existing.userId ?? account.userId;
      if (!existing.typeKey) {
        const typeRow = await this.prisma.requestType.findUnique({
          where: { id: existing.typeId },
          select: { key: true },
        });
        existing.typeKey = typeRow?.key;
      }
      return existing;
    }

    if (!actor.companyId) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบบริษัท — กรุณาเริ่มคำร้องใหม่' });
      return null;
    }

    const access = await this.prisma.user.findUnique({
      where: { id: account.userId },
      select: { employeeId: true },
    });
    if (!access?.employeeId) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน — กรุณาเริ่มคำร้องใหม่' });
      return null;
    }

    const latest = await this.prisma.requestInstance.findFirst({
      where: {
        deletedAt: null,
        status: 'draft',
        companyId: actor.companyId,
        requesterEmployeeId: access.employeeId,
      },
      orderBy: { updatedAt: 'desc' },
      include: { values: true },
    });
    if (!latest) {
      await this.gateway.sendMessage({
        chatId,
        text: '⚠️ ไม่พบคำร้องที่กำลังกรอก\nกรุณาไปที่ 📋 ศูนย์คำร้อง → สร้างคำร้องใหม่',
      });
      return null;
    }

    const values: Record<string, unknown> = {};
    for (const row of latest.values) {
      values[row.fieldKey] = row.valueJson ?? row.valueText;
    }
    const { draft, visible, needsConfirm } = await this.buildDraftState(
      latest.requestTypeId,
      latest.id,
      values,
    );
    context.draft = draft;
    if (needsConfirm) {
      await saveSession('request:confirm', { draft });
    } else {
      await saveSession(`request:field:${draft.fieldIndex}`, { draft });
    }
    void visible;
    return draft;
  }

  private getVisibleFields(allFields: FormField[], values: Record<string, unknown>): FormField[] {
    return allFields
      .filter((f) => f.fieldType !== 'system_auto_fill')
      .filter((f) => !TELEGRAM_SKIP_FIELD_TYPES.has(f.fieldType))
      .filter((f) => evaluateCondition(f.visibilityConditionJson as FieldCondition | null, values));
  }

  private parseLeaveDatesInput(value: string): string[] | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (isThaiMultiDateInput(trimmed)) {
      return parseThaiMultiDateInput(trimmed);
    }
    const single = parseThaiDateInput(trimmed);
    if (single) return [single];
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return [trimmed];
    return null;
  }

  private applyLeaveDateValues(
    draft: RequestDraft,
    patchPayload: Record<string, unknown>,
    multiDates: string[],
  ): void {
    const startDate = multiDates[0];
    const endDate = multiDates[multiDates.length - 1];
    draft.values.startDate = startDate;
    draft.values.endDate = endDate;
    patchPayload.startDate = startDate;
    patchPayload.endDate = endDate;
    if (multiDates.length > 1) {
      const leaveDatesJson = JSON.stringify(multiDates);
      draft.values.leaveDates = leaveDatesJson;
      patchPayload.leaveDates = leaveDatesJson;
    } else {
      delete draft.values.leaveDates;
    }
  }

  private async onFieldInput(
    account: SessionLike,
    chatId: number,
    text: string,
    context: Record<string, unknown>,
    actor: { userId: string; companyId?: string | null },
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
  ): Promise<void> {
    const draft = context.draft as RequestDraft;
    const version = await this.types.getPublishedVersion(draft.typeId);
    if (!version) return;

    const visible = this.getVisibleFields(version.formFields as FormField[], draft.values);
    const field = visible[draft.fieldIndex];
    if (!field) return;

    const normalized = text.trim();
    const extraErr = this.extraValidate(field, normalized);
    if (extraErr) {
      await this.formUxAudit.log(tgActor(account.userId, actor.companyId ?? null), 'validation_failed', {
        requestId: draft.requestId,
        fieldKey: field.key,
        reason: extraErr,
      });
      await this.gateway.sendMessage({ chatId, text: `❌ ${extraErr}` });
      return;
    }

    await this.applyFieldValue(account, chatId, actor, draft, field, normalized, visible, saveSession, true);
  }


  private extraValidate(field: FormField, value: string): string | null {
    if (QUICK_DATE_FIELD_TYPES.has(field.fieldType)) {
      if (field.key === 'startDate') {
        return this.parseLeaveDatesInput(value) ? null : THAI_MULTI_DATE_VALIDATION_ERROR;
      }
      return this.formUx.validateDate(value);
    }
    if (QUICK_TIME_FIELD_TYPES.has(field.fieldType)) return this.formUx.validateTime(value);
    if (field.key.toLowerCase().includes('phone')) return this.formUx.validatePhone(value);
    if (field.key.toLowerCase().includes('bankaccount')) return this.formUx.validateBankAccount(value);
    return null;
  }

  private async applyCallbackValue(
    account: SessionLike,
    chatId: number,
    actor: { userId: string; companyId?: string | null },
    context: Record<string, unknown>,
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
    rawValue: string,
    fromManual: boolean,
    sourceMessage?: unknown,
  ): Promise<void> {
    const draft = await this.resolveDraftContext(account, chatId, actor, context, saveSession);
    if (!draft?.typeId) return;
    this.captureUiMessageId(draft, sourceMessage);

    const version = await this.types.getPublishedVersion(draft.typeId);
    if (!version) return;

    const visible = this.getVisibleFields(version.formFields as FormField[], draft.values);
    const field = visible[draft.fieldIndex];
    if (!field) {
      await this.showConfirmSummary(chatId, visible, draft, saveSession, actor, sourceMessage);
      return;
    }

    let value = rawValue;
    if (this.formUx.isButtonField(field.fieldType)) {
      const opts = this.formUx.resolveOptions(field.fieldType, field.optionsJson);
      const hit = opts.find(
        (o) => o.value === rawValue || this.formUx.encodeCallbackValue(o.value) === rawValue,
      );
      value = hit?.value ?? this.formUx.decodeCallbackValue(rawValue);
    }

    await this.applyFieldValue(
      account, chatId, actor, draft, field, value, visible, saveSession, fromManual, sourceMessage,
    );
  }

  private async applyFieldValue(
    account: SessionLike,
    chatId: number,
    actor: { userId: string; companyId?: string | null },
    draft: RequestDraft,
    field: FormField,
    value: string,
    visible: FormField[],
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
    fromManual: boolean,
    sourceMessage?: unknown,
  ): Promise<void> {
    let validationValue = value;
    if (field.key === 'startDate' && QUICK_DATE_FIELD_TYPES.has(field.fieldType)) {
      const multiDates = this.parseLeaveDatesInput(value);
      if (!multiDates?.length) {
        await this.upsertUiMessage(chatId, `❌ ${THAI_MULTI_DATE_VALIDATION_ERROR}`, {
          inline_keyboard: this.formUx.navRows(),
        }, { draft, sourceMessage });
        return;
      }
      validationValue = multiDates[0];
    }

    const err = this.fields.validateFieldValue(field, validationValue);
    if (err) {
      await this.formUxAudit.log(tgActor(account.userId, actor.companyId ?? null), 'validation_failed', {
        requestId: draft.requestId,
        fieldKey: field.key,
        reason: err,
      });
      await this.upsertUiMessage(chatId, `❌ ${err}`, {
        inline_keyboard: this.formUx.navRows(),
      }, { draft, sourceMessage });
      return;
    }

    let storedValue = QUICK_DATE_FIELD_TYPES.has(field.fieldType)
      ? (parseThaiDateInput(value) ?? value)
      : QUICK_TIME_FIELD_TYPES.has(field.fieldType)
        ? (normalizeThaiTimeInput(value) ?? value)
        : value;
    const patchPayload: Record<string, unknown> = { [field.key]: storedValue };

    if (field.key === 'startDate' && QUICK_DATE_FIELD_TYPES.has(field.fieldType)) {
      const multiDates = this.parseLeaveDatesInput(value);
      if (!multiDates?.length) {
        await this.upsertUiMessage(chatId, `❌ ${THAI_MULTI_DATE_VALIDATION_ERROR}`, {
          inline_keyboard: this.formUx.navRows(),
        }, { draft, sourceMessage });
        return;
      }
      storedValue = multiDates[0];
      this.applyLeaveDateValues(draft, patchPayload, multiDates);
    } else {
      draft.values[field.key] = storedValue;
    }

    draft.manualInput = false;
    try {
      await this.instances.patchValues(
        tgActor(account.userId, actor.companyId ?? null),
        draft.requestId,
        { values: patchPayload },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ';
      await this.upsertUiMessage(chatId, `❌ ${message}`, {
        inline_keyboard: this.formUx.navRows(),
      }, { draft, sourceMessage });
      return;
    }

    await this.formUxAudit.log(
      tgActor(account.userId, actor.companyId ?? null),
      fromManual ? 'manual_input_used' : 'form_option_selected',
      { requestId: draft.requestId, fieldKey: field.key, value: storedValue },
    );

    const versionAfter = await this.types.getPublishedVersion(draft.typeId);
    const updatedVisible = this.getVisibleFields(
      versionAfter?.formFields as FormField[] ?? [],
      draft.values,
    );
    const missing = this.getMissingRequiredFields(updatedVisible, draft.values);
    if (missing.length > 0) {
      draft.fieldIndex = updatedVisible.findIndex((f) => f.key === missing[0].key);
      await saveSession(`request:field:${draft.fieldIndex}`, { draft });
      await this.askField(chatId, missing[0], draft.fieldIndex, draft, actor, sourceMessage);
      return;
    }

    await this.showConfirmSummary(chatId, updatedVisible, draft, saveSession, actor, sourceMessage);
  }

  private getMissingRequiredFields(
    visible: FormField[],
    values: Record<string, unknown>,
  ): FormField[] {
    return visible.filter((field) => {
      if (!field.required) return false;
      const val = values[field.key];
      return val === undefined || val === null || val === '';
    });
  }

  /** OT time buttons: only after shift end (and after OT start for endTime). */
  private async resolveOtTimePickerOptions(
    fieldKey: string,
    draft: RequestDraft,
    actor?: { userId: string; companyId?: string | null },
  ): Promise<{
    picker: { notBeforeMinutes?: number; afterTime?: string };
    hint: string;
  } | null> {
    const typeKey = draft.typeKey
      ?? (await this.prisma.requestType.findUnique({
        where: { id: draft.typeId },
        select: { key: true },
      }))?.key;
    if (typeKey !== 'ot_request') return null;
    if (fieldKey !== 'startTime' && fieldKey !== 'endTime') return null;

    const companyId = draft.companyId ?? actor?.companyId ?? null;
    const userId = draft.userId ?? actor?.userId;
    if (!companyId || !userId) return null;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { employeeId: true },
    });
    if (!user?.employeeId) return null;

    const workDateIso = String(draft.values.otDate ?? this.formUx.todayString()).slice(0, 10);
    const snapshot = await this.attendanceGuard.loadDaySnapshot(
      user.employeeId,
      companyId,
      workDateIso,
    );
    if (!snapshot.shiftEndAt) {
      return {
        picker: { notBeforeMinutes: 18 * 60 },
        hint: 'เลือกเวลาหลังเลิกงาน (ไม่พบกะ — แสดงตั้งแต่ 18.00):',
      };
    }

    const shiftEndMinutes = this.bangkokMinutesFromDate(snapshot.shiftEndAt);
    const shiftLabel = this.formUx.formatMinutesAsThaiDot(shiftEndMinutes);
    const shiftName = snapshot.shiftName ? `กะ${snapshot.shiftName} ` : '';

    if (fieldKey === 'startTime') {
      return {
        picker: { notBeforeMinutes: shiftEndMinutes },
        hint: `เลือกเวลาเริ่ม OT หลังเลิกงาน (${shiftName}สิ้นสุด ${shiftLabel}):`,
      };
    }

    const startTime = draft.values.startTime
      ? String(draft.values.startTime)
      : undefined;
    return {
      picker: {
        notBeforeMinutes: shiftEndMinutes,
        afterTime: startTime,
      },
      hint: startTime
        ? `เลือกเวลาสิ้นสุด OT (หลัง ${this.formUx.labelForValue('quick_time', startTime)}):`
        : `เลือกเวลาสิ้นสุด OT หลังเลิกงาน (${shiftLabel}):`,
    };
  }

  private bangkokMinutesFromDate(value: Date): number {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(value);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const hours = Number(map.hour === '24' ? '0' : map.hour);
    const minutes = Number(map.minute);
    return hours * 60 + minutes;
  }

  private async askField(
    chatId: number,
    field: FormField,
    fieldIndex: number,
    draft: RequestDraft,
    actor?: { userId: string; companyId?: string | null },
    sourceMessage?: unknown,
  ): Promise<void> {
    const version = await this.types.getPublishedVersion(draft.typeId);
    const visible = this.getVisibleFields(version?.formFields as FormField[] ?? [], draft.values);
    const progress = visible.length > 1
      ? `📍 ขั้นที่ ${Math.min(fieldIndex + 1, visible.length)}/${visible.length}`
      : '';
    const filled = this.buildFilledSummary(draft, visible, field.key);
    const typeTitle = draft.typeKey && TELEGRAM_REQUEST_INTROS[draft.typeKey]
      ? TELEGRAM_REQUEST_INTROS[draft.typeKey].split('\n')[0]
      : '📋 <b>คำร้อง</b>';
    const blocks = [
      typeTitle,
      filled,
      progress,
      `<b>${field.labelTh}</b>${field.helpText ? `\n${field.helpText}` : ''}`,
    ].filter(Boolean);

    const ft = field.fieldType;
    let prompt = '';
    let optionRows: Array<Array<{ text: string; callback_data: string }>> = [];

    if (this.formUx.isButtonField(ft)) {
      const opts = this.formUx.resolveOptions(ft, field.optionsJson);
      prompt = 'เลือกจากตัวเลือกด้านล่าง:';
      optionRows = this.formUx.buildOptionRows('req:pick', opts);
    } else if (QUICK_DATE_FIELD_TYPES.has(ft)) {
      const includePayday = field.key.toLowerCase().includes('pay') || field.key === 'requestedPayDate';
      const includeYesterday = field.key === 'attendanceDate';
      prompt = field.key === 'startDate'
        ? `💡 ${THAI_MULTI_DATE_INPUT_HINT}\nเลือกวันที่:`
        : 'เลือกวันที่:';
      optionRows = this.formUx.buildQuickDateRows('req:date', { includePayday, includeYesterday });
    } else if (QUICK_TIME_FIELD_TYPES.has(ft)) {
      const otTimeOpts = await this.resolveOtTimePickerOptions(field.key, draft, actor);
      prompt = otTimeOpts?.hint ?? 'เลือกเวลา:';
      optionRows = this.formUx.buildQuickTimeRows('req:time', otTimeOpts?.picker);
    } else if (QUICK_AMOUNT_FIELD_TYPES.has(ft)) {
      prompt = 'เลือกจำนวนเงิน:';
      optionRows = this.formUx.buildQuickAmountRows('req:amt');
    } else {
      prompt = 'พิมพ์คำตอบของคุณ:';
    }

    await this.upsertUiMessage(
      chatId,
      [...blocks, prompt].join('\n\n'),
      {
        inline_keyboard: [
          ...optionRows,
          ...this.formUx.navRows(),
        ],
      },
      { draft, sourceMessage },
    );
  }

  private buildFilledSummary(
    draft: RequestDraft,
    visible: FormField[],
    currentFieldKey: string,
  ): string {
    const lines: string[] = [];
    for (const f of visible) {
      if (f.key === currentFieldKey) break;
      const val = draft.values[f.key];
      if (val === undefined || val === null || val === '') continue;
      lines.push(`✅ ${f.labelTh}: ${this.formUx.labelForValue(f.fieldType, val, f.optionsJson)}`);
    }
    return lines.join('\n');
  }

  private async promptManualInput(
    account: SessionLike,
    chatId: number,
    context: Record<string, unknown>,
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
    kind: 'date' | 'time' | 'amount',
    sourceMessage?: unknown,
  ): Promise<void> {
    const draft = context.draft as RequestDraft;
    draft.manualInput = true;
    let hint = kind === 'time' ? this.formUx.timeInputHint() : kind === 'amount' ? 'ตัวเลข' : THAI_DATE_INPUT_HINT;
    if (kind === 'date') {
      const version = await this.types.getPublishedVersion(draft.typeId);
      const visible = this.getVisibleFields(version?.formFields as FormField[] ?? [], draft.values);
      const field = visible[draft.fieldIndex];
      if (field?.key === 'startDate') {
        hint = THAI_MULTI_DATE_INPUT_HINT;
      }
    }
    await saveSession(`request:field:${draft.fieldIndex}`, { draft });
    await this.upsertUiMessage(
      chatId,
      `✏️ <b>กรอกเอง</b>\nพิมพ์แล้วส่งข้อความ (${hint})`,
      { inline_keyboard: this.formUx.navRows() },
      { draft, sourceMessage },
    );
    void account;
  }

  private parseLeaveDatesFromDraft(values: Record<string, unknown>): string[] {
    const raw = values.leaveDates;
    if (Array.isArray(raw)) {
      return raw.map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    }
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
        }
      } catch {
        // ignore
      }
    }
    return [];
  }

  private async showConfirmSummary(
    chatId: number,
    visible: FormField[],
    draft: RequestDraft,
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
    actor?: { userId: string; companyId?: string | null },
    sourceMessage?: unknown,
  ): Promise<void> {
    const missing = this.getMissingRequiredFields(visible, draft.values);
    if (missing.length > 0) {
      draft.fieldIndex = visible.findIndex((f) => f.key === missing[0].key);
      await saveSession(`request:field:${draft.fieldIndex}`, { draft });
      await this.askField(chatId, missing[0], draft.fieldIndex, draft, actor, sourceMessage);
      return;
    }

    const leaveDates = this.parseLeaveDatesFromDraft(draft.values);
    const lines = visible
      .filter((f) => !(leaveDates.length > 1 && f.key === 'endDate'))
      .map((f) => {
        if (f.key === 'startDate' && leaveDates.length > 1) {
          const labels = leaveDates.map((d) => formatIsoDateAsDdMmYyyy(d)).join(', ');
          return `✅ ${f.labelTh}: ${labels} (${leaveDates.length} วัน)`;
        }
        return `✅ ${f.labelTh}: ${this.formUx.labelForValue(f.fieldType, draft.values[f.key], f.optionsJson)}`;
      });
    await this.upsertUiMessage(
      chatId,
      `📋 <b>ตรวจสอบข้อมูลก่อนส่ง</b>\n\n${lines.join('\n') || '(ไม่มีข้อมูล)'}`,
      { inline_keyboard: this.formUx.summaryRows() },
      { draft, sourceMessage },
    );
    await saveSession('request:confirm', { draft });
  }

  private async submitFromConfirm(
    account: SessionLike,
    chatId: number,
    actor: { userId: string; companyId?: string | null },
    context: Record<string, unknown>,
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
    sourceMessage?: unknown,
  ): Promise<void> {
    const draft = context.draft as RequestDraft;
    if (!draft?.requestId) {
      await this.upsertUiMessage(chatId, '❌ ไม่พบข้อมูลคำร้อง กรุณาเริ่มใหม่จากเมนูคำร้อง', {
        inline_keyboard: [],
      }, { sourceMessage });
      return;
    }
    this.captureUiMessageId(draft, sourceMessage);

    try {
      await this.formUxAudit.log(tgActor(account.userId, actor.companyId ?? null), 'form_summary_confirmed', {
        requestId: draft.requestId,
      });
      await this.instances.submit(tgActor(account.userId, actor.companyId ?? null), draft.requestId);
      await this.formUxAudit.log(tgActor(account.userId, actor.companyId ?? null), 'form_submitted', {
        requestId: draft.requestId,
      });
      await saveSession('idle', {});
      const confirmation = await this.buildSubmitConfirmation(draft.requestId);
      await this.upsertUiMessage(
        chatId,
        confirmation,
        { inline_keyboard: [] },
        { draft, sourceMessage },
      );
      // Always send a fresh reply so the employee sees a clear receipt (not only an edited card).
      await this.gateway.sendMessage({
        chatId,
        text: confirmation,
        parseMode: 'HTML',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ส่งคำร้องไม่สำเร็จ';
      await this.upsertUiMessage(
        chatId,
        `❌ ${message}\n\nกดย้อนกลับเพื่อแก้ข้อมูล หรือยกเลิก`,
        { inline_keyboard: this.formUx.navRows() },
        { draft, sourceMessage },
      );

      if (!draft.typeId || !actor.companyId) return;
      const version = await this.types.getPublishedVersion(draft.typeId);
      if (!version) return;
      const visible = this.getVisibleFields(version.formFields as FormField[], draft.values);
      const missing = this.getMissingRequiredFields(visible, draft.values);
      if (missing.length > 0) {
        draft.fieldIndex = visible.findIndex((f) => f.key === missing[0].key);
        await saveSession(`request:field:${draft.fieldIndex}`, { draft });
        await this.askField(chatId, missing[0], draft.fieldIndex, draft, actor, sourceMessage);
      }
    }
  }

  private async goBackField(
    account: SessionLike,
    chatId: number,
    actor: { userId: string; companyId?: string | null },
    context: Record<string, unknown>,
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
    sourceMessage?: unknown,
  ): Promise<void> {
    const draft = context.draft as RequestDraft;
    if (!draft || draft.fieldIndex <= 0) {
      await this.showRequestMenu(chatId, sourceMessage);
      await saveSession('idle', {});
      return;
    }
    const version = await this.types.getPublishedVersion(draft.typeId);
    const visible = this.getVisibleFields(version?.formFields as FormField[] ?? [], draft.values);
    const current = visible[draft.fieldIndex];
    if (current) delete draft.values[current.key];
    draft.fieldIndex -= 1;
    draft.manualInput = false;
    const field = visible[draft.fieldIndex];
    if (!field) return;
    if (field.key === 'startDate') {
      delete draft.values.endDate;
      delete draft.values.leaveDates;
    }
    delete draft.values[field.key];
    await saveSession(`request:field:${draft.fieldIndex}`, { draft });
    await this.askField(chatId, field, draft.fieldIndex, draft, actor, sourceMessage);
    void account;
  }

  private async showMyRequests(
    account: SessionLike,
    chatId: number,
    statusFilter?: string,
    sourceMessage?: unknown,
  ): Promise<void> {
    const rows = await this.instances.listMy(tgActor(account.userId, null));
    const filtered = statusFilter
      ? rows.filter((r) => r.status === statusFilter || (statusFilter === 'pending' && r.status === 'in_review'))
      : rows;
    if (!filtered.length) {
      await this.upsertUiMessage(chatId, 'ไม่มีคำร้อง', {
        inline_keyboard: [
          [
            { text: '⬅️ ย้อนกลับ', callback_data: 'request:menu' },
            { text: '🏠 เมนูหลัก', callback_data: 'home' },
          ],
        ],
      }, { sourceMessage });
      return;
    }
    const lines = filtered.slice(0, 10).map((r) =>
      `• ${r.title} — ${r.status} (${r.submittedAt?.toISOString().slice(0, 10) ?? 'draft'})`,
    );
    await this.upsertUiMessage(chatId, `📂 <b>คำร้องของฉัน</b>\n\n${lines.join('\n')}`, {
      inline_keyboard: [
        [
          { text: '⬅️ ย้อนกลับ', callback_data: 'request:menu' },
          { text: '🏠 เมนูหลัก', callback_data: 'home' },
        ],
      ],
    }, { sourceMessage });
  }

  private async showRequestDetail(account: SessionLike, chatId: number, id: string): Promise<void> {
    const req = await this.instances.get(tgActor(account.userId, null), id);
    const vals = req.values.map((v) => `${v.fieldLabelSnapshot}: ${v.valueText ?? JSON.stringify(v.valueJson)}`).join('\n');
    await this.gateway.sendMessage({
      chatId,
      text: `📋 ${req.title}\nสถานะ: ${req.status}\n\n${vals}`,
    });
  }

  private async buildSubmitConfirmation(requestId: string): Promise<string> {
    try {
      const row = await this.prisma.requestInstance.findFirst({
        where: { id: requestId, deletedAt: null },
        include: {
          requestType: { select: { key: true, nameTh: true } },
          values: true,
        },
      });
      if (!row) {
        return '✅ ส่งคำร้องเรียบร้อยแล้ว\n\n⏳ รออนุมัติ — จะแจ้งผลทาง Telegram';
      }

      const values = Object.fromEntries(
        row.values.map((v) => [v.fieldKey, v.valueText ?? String(v.valueJson ?? '')]),
      );

      if (row.requestType.key === 'off_day_change') {
        const current = String(values.currentOffDay ?? '').slice(0, 10);
        const requested = String(values.requestedOffDay ?? '').slice(0, 10);
        const reason = String(values.reason ?? '').trim();
        return [
          '✅ <b>ส่งคำขอเปลี่ยนวันหยุดแล้ว</b>',
          '',
          `วันหยุดเดิมที่จะยกเลิก: <b>${current}</b>`,
          `วันหยุดใหม่ที่ขอ: <b>${requested}</b>`,
          reason ? `เหตุผล: ${reason}` : '',
          '',
          'เมื่ออนุมัติ ระบบจะ:',
          `• ยกเลิกวันหยุด ${current}`,
          `• ตั้งวันหยุดใหม่ ${requested}`,
          '• คิดแจ้งล่วงหน้าจากวันนี้ (วันที่ยื่นคำขอเปลี่ยน)',
          '',
          '⏳ รออนุมัติ — จะแจ้งผลทาง Telegram',
        ].filter(Boolean).join('\n');
      }

      return [
        '✅ <b>ส่งคำร้องเรียบร้อยแล้ว</b>',
        '',
        `ประเภท: ${row.requestType.nameTh}`,
        '',
        '⏳ รออนุมัติ — จะแจ้งผลทาง Telegram',
      ].join('\n');
    } catch {
      return '✅ ส่งคำร้องเรียบร้อยแล้ว\n\n⏳ รออนุมัติ — จะแจ้งผลทาง Telegram';
    }
  }

  private async approveFromTelegram(
    account: SessionLike,
    chatId: number,
    id: string,
    sourceMessage?: unknown,
  ): Promise<void> {
    try {
      await this.approval.approve(tgActor(account.userId, null), id, {});
      const source = normalizeCallbackSourceMessage(sourceMessage, chatId);
      if (source) {
        const updated = await this.requestNotifier.editApproverOutcomeMessage(
          source.chat.id,
          source.message_id,
          id,
          true,
        );
        if (!updated) await this.sendApproverOutcomeFallback(chatId, id, true);
      } else {
        await this.sendApproverOutcomeFallback(chatId, id, true);
      }
    } catch (err) {
      const msg = (err as Error).message ?? 'อนุมัติไม่สำเร็จ';
      const friendly = msg.includes('not awaiting approval')
        ? '❌ คำร้องนี้อนุมัติ/ปฏิเสธไปแล้ว'
        : `❌ ${msg}`;
      await this.gateway.sendMessage({ chatId, text: friendly });
    }
  }

  private async sendApproverOutcomeFallback(
    chatId: number,
    requestId: string,
    approved: boolean,
    comment?: string,
  ): Promise<void> {
    const text = await this.requestNotifier.buildApproverOutcomeMessage(requestId, approved, comment);
    await this.gateway.sendMessage({ chatId, text, parseMode: 'HTML' });
  }

  async startTimeCorrectionRequest(
    account: SessionLike,
    chatId: number,
    actor: { userId: string; companyId?: string | null },
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
  ): Promise<void> {
    if (!actor.companyId) {
      await this.gateway.sendMessage({ chatId, text: 'ไม่พบบริษัท' });
      return;
    }

    const requestType = await this.prisma.requestType.findFirst({
      where: {
        key: 'time_correction',
        deletedAt: null,
        isActive: true,
        status: 'published',
        OR: [{ companyId: actor.companyId }, { companyId: null }],
      },
      orderBy: { companyId: 'desc' },
    });

    if (!requestType) {
      await this.gateway.sendMessage({ chatId, text: 'ยังไม่เปิดใช้งานคำร้องแก้ไขเวลา' });
      return;
    }

    await this.startRequestForm(account, chatId, requestType.id, actor, saveSession);
  }

  async startNoBreakReportRequest(
    account: SessionLike,
    chatId: number,
    actor: { userId: string; companyId?: string | null },
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
    sourceMessage?: unknown,
  ): Promise<void> {
    if (!actor.companyId) {
      await this.upsertUiMessage(chatId, 'ไม่พบบริษัท', { inline_keyboard: [] }, { sourceMessage });
      return;
    }

    const requestType = await this.prisma.requestType.findFirst({
      where: {
        key: 'no_break_report',
        deletedAt: null,
        isActive: true,
        status: 'published',
        OR: [{ companyId: actor.companyId }, { companyId: null }],
      },
      orderBy: { companyId: 'desc' },
    });

    if (!requestType) {
      await this.upsertUiMessage(
        chatId,
        '☕ แจ้งไม่พักเบรกยังไม่พร้อม — ใช้ 📝 คำร้อง → สร้างคำร้องใหม่',
        { inline_keyboard: [[{ text: '⬅️ ย้อนกลับ', callback_data: 'request:menu' }]] },
        { sourceMessage },
      );
      return;
    }

    const access = await this.prisma.user.findUnique({
      where: { id: account.userId },
      select: { employeeId: true },
    });
    if (!access?.employeeId) {
      await this.upsertUiMessage(chatId, 'ไม่พบข้อมูลพนักงาน', { inline_keyboard: [] }, { sourceMessage });
      return;
    }

    const today = this.formUx.todayString();
    try {
      await this.attendanceGuard.assertAttendanceLinkedRequest(
        'no_break_report',
        access.employeeId,
        actor.companyId,
        { workDate: today },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ไม่สามารถแจ้งไม่พักเบรกได้';
      await this.upsertUiMessage(chatId, `❌ ${message}`, {
        inline_keyboard: [[{ text: '⬅️ ย้อนกลับ', callback_data: 'request:menu' }]],
      }, { sourceMessage });
      return;
    }

    const draftRow = await this.instances.createDraft(
      tgActor(account.userId, actor.companyId),
      requestType.id,
      actor.companyId,
    );
    await this.instances.patchValues(
      tgActor(account.userId, actor.companyId),
      draftRow.id,
      { values: { workDate: today } },
    );

    const draft: RequestDraft = {
      requestId: draftRow.id,
      typeId: requestType.id,
      typeKey: 'no_break_report',
      companyId: actor.companyId,
      userId: account.userId,
      fieldIndex: 99,
      values: { workDate: today },
    };
    this.captureUiMessageId(draft, sourceMessage);

    const version = await this.types.getPublishedVersion(requestType.id);
    const visible = this.getVisibleFields(version?.formFields ?? [], draft.values);
    await this.showConfirmSummary(chatId, visible, draft, saveSession, actor, sourceMessage);
  }

  /** Edit the same Telegram message in-place so chat stays short and old buttons die. */
  private async upsertUiMessage(
    chatId: number,
    text: string,
    replyMarkup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> },
    opts?: { draft?: RequestDraft | null; sourceMessage?: unknown },
  ): Promise<number | null> {
    const safeText = (text ?? '').trim() || '📋 กำลังโหลด…';
    const source = normalizeCallbackSourceMessage(opts?.sourceMessage, chatId);
    const messageId = opts?.draft?.uiMessageId ?? source?.message_id ?? null;
    const targetChatId = source?.chat.id ?? chatId;

    if (messageId != null) {
      const edited = await this.gateway.editMessageText(
        targetChatId,
        messageId,
        safeText,
        replyMarkup,
      );
      if (edited) {
        if (opts?.draft) opts.draft.uiMessageId = messageId;
        return messageId;
      }
      // Edit failed — still strip old buttons so they cannot be re-clicked.
      await this.gateway.editMessageReplyMarkup(targetChatId, messageId, { inline_keyboard: [] });
    }

    const sentId = await this.gateway.sendMessage({
      chatId,
      text: safeText,
      parseMode: 'HTML',
      replyMarkup,
    });
    if (opts?.draft && sentId != null) opts.draft.uiMessageId = sentId;
    return sentId;
  }

  private captureUiMessageId(draft: RequestDraft, sourceMessage?: unknown): void {
    if (draft.uiMessageId != null) return;
    const source = normalizeCallbackSourceMessage(sourceMessage);
    if (source) draft.uiMessageId = source.message_id;
  }
}
