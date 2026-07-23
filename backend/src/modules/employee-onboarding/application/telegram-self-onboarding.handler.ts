// ============================================================================
// EMP-001c — Telegram self-onboarding multi-step form
// ============================================================================

import { Injectable } from '@nestjs/common';
import { SelfOnboardingDocumentType } from '@prisma/client';
import { EmployeeSelfOnboardingService } from './employee-self-onboarding.service';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import {
  TelegramSelfOnboardingEmploymentWizard,
  type SelfOnboardingDraftWithEmployment,
} from './telegram-self-onboarding-employment.wizard';
import {
  SELF_ONBOARDING_FORM_STEPS,
  SelfOnboardingSubmittedData,
} from '../domain/self-onboarding.types';
import { TelegramState, SessionContext } from '../../telegram/domain/entities/telegram-session.types';
import {
  formatIsoDateAsDdMmYyyy,
  parseDateDdMmYyyyInput,
} from '../../employee/domain/services/employee-date-events.service';
import {
  normalizeThaiPhoneInput,
  validateSelfOnboardingFullName,
  validateSelfOnboardingPhone,
  SELF_ONBOARDING_FIELD_HINTS,
} from '../domain/self-onboarding-validation';
import {
  bankDisplayLabel,
  hasValidSelfOnboardingBank,
  resolveSelfOnboardingBank,
  SELF_ONBOARDING_BANK_OPTIONS,
} from '../domain/thai-bank-options';

type SaveSessionFn = (accountId: string, state: TelegramState, context: SessionContext) => Promise<void>;

interface SelfOnboardingDraft extends SelfOnboardingDraftWithEmployment, Record<string, unknown> {
  data: SelfOnboardingSubmittedData;
}

function isPhotoStep(step: (typeof SELF_ONBOARDING_FORM_STEPS)[number]): step is typeof SELF_ONBOARDING_FORM_STEPS[number] & { type: 'photo' } {
  return 'type' in step && step.type === 'photo';
}

function isBankPickerStep(step: (typeof SELF_ONBOARDING_FORM_STEPS)[number]): step is typeof SELF_ONBOARDING_FORM_STEPS[number] & { type: 'bank_picker' } {
  return 'type' in step && step.type === 'bank_picker';
}

const PHOTO_STEP_PROMPTS: Record<string, string> = {
  id_card: [
    '📸 <b>รูปบัตรประชาชน</b>',
    '',
    'ถ่ายรูปบัตรประชาชนให้เห็นตัวอักษรและรูปบนบัตรชัดเจน',
    '(ถ่ายเฉพาะบัตร — ไม่ต้องถือ)',
    '',
    '📎 ส่งเป็นรูปภาพ (ถ่ายหรือเลือกจากแกลเลอรี — ไม่ใช่ PDF)',
  ].join('\n'),
  id_card_holding: [
    '📸 <b>รูปถือบัตรประชาชน</b>',
    '',
    'ถ่ายรูปตัวเองถือบัตรประชาชนข้างใบหน้า',
    'ให้เห็นหน้าและตัวอักษรบนบัตรชัดเจน',
    '',
    '📎 ส่งเป็นรูปภาพ (ถ่ายหรือเลือกจากแกลเลอรี — ไม่ใช่ PDF)',
  ].join('\n'),
  profile_photo: [
    '📸 <b>รูปโปรไฟล์</b> (ไม่บังคับ)',
    '',
    'ส่งรูปใบหน้าของคุณสำหรับโปรไฟล์ในระบบ HR',
    '(ไม่ต้องถือบัตร — รูปหน้าตรงพอ)',
    '',
    '📎 ส่งเป็นรูปภาพ หรือกด "ข้าม" ได้',
  ].join('\n'),
};

@Injectable()
export class TelegramSelfOnboardingHandler {
  constructor(
    private readonly onboarding: EmployeeSelfOnboardingService,
    private readonly gateway: TelegramGatewayService,
    private readonly employmentWizard: TelegramSelfOnboardingEmploymentWizard,
  ) {}

  async start(
    account: { id: string; userId: string },
    chatId: number,
    employeeId: string,
    companyId: string,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    await this.onboarding.getOrCreateDraft(employeeId, companyId);
    const draft: SelfOnboardingDraft = { employeeId, companyId, stepIndex: 0, data: {}, phase: 'personal' };
    await saveSession(account.id, 'self_onboarding_active', { draft });
    await this.promptStep(chatId, draft);
  }

  async tryResumeSession(
    account: { userId: string },
  ): Promise<SessionContext | null> {
    const telegramUserId = await this.onboarding.resolveTelegramUserIdForUser(account.userId);
    const draft = await this.onboarding.getResumeDraftForUser(account.userId, telegramUserId);
    if (!draft) return null;
    return { draft };
  }

  private async ensureDraft(
    account: { id: string; userId: string },
    context: SessionContext,
    saveSession: SaveSessionFn,
    syncFromDb = true,
  ): Promise<SelfOnboardingDraft | null> {
    const resumed = await this.tryResumeSession(account);
    if (!resumed?.draft) {
      const draft = context.draft as SelfOnboardingDraft | undefined;
      return draft?.employeeId ? draft : null;
    }

    const draft = resumed.draft as SelfOnboardingDraft;
    if (syncFromDb) {
      await saveSession(account.id, 'self_onboarding_active', { draft });
    }
    return draft;
  }

  private bankPickerStepIndex(): number {
    return SELF_ONBOARDING_FORM_STEPS.findIndex((s) => s.key === 'bankCode');
  }

  private isPersonalComplete(draft: SelfOnboardingDraft): boolean {
    return draft.stepIndex >= SELF_ONBOARDING_FORM_STEPS.length;
  }

  private async continueAfterPersonalStep(
    chatId: number,
    draft: SelfOnboardingDraft,
    account: { id: string; userId: string },
    saveSession: SaveSessionFn,
  ): Promise<void> {
    if (!this.isPersonalComplete(draft)) {
      await this.promptStep(chatId, draft);
      return;
    }
    draft.phase = 'employment';
    await this.employmentWizard.ensureEmploymentLoaded(draft);
    await saveSession(account.id, 'self_onboarding_active', { draft });
    if (this.employmentWizard.isEmploymentComplete(draft)) {
      await this.showSummary(chatId, draft);
      return;
    }
    await this.employmentWizard.promptStep(chatId, draft);
  }

  private async continueAfterEmploymentStep(
    chatId: number,
    draft: SelfOnboardingDraft,
    account: { id: string; userId: string },
    saveSession: SaveSessionFn,
  ): Promise<void> {
    await saveSession(account.id, 'self_onboarding_active', { draft });
    if (this.employmentWizard.isEmploymentComplete(draft)) {
      await this.showSummary(chatId, draft);
      return;
    }
    await this.employmentWizard.promptStep(chatId, draft);
  }

  private async requireBankPickerOrContinue(
    chatId: number,
    draft: SelfOnboardingDraft,
    account: { id: string; userId: string },
    saveSession: SaveSessionFn,
  ): Promise<boolean> {
    if (hasValidSelfOnboardingBank(draft.data)) return true;
    const bankIdx = this.bankPickerStepIndex();
    if (bankIdx < 0) return true;
    draft.stepIndex = bankIdx;
    await saveSession(account.id, 'self_onboarding_active', { draft });
    await this.gateway.sendMessage({
      chatId,
      text: '🏦 กรุณาเลือกธนาคารก่อนกรอกเลขบัญชี',
    });
    await this.promptStep(chatId, draft);
    return false;
  }

  async handleText(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    context: SessionContext,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    const draft = await this.ensureDraft(account, context, saveSession);
    if (!draft) return;

    if (draft.phase === 'employment' && this.isPersonalComplete(draft)) {
      await this.gateway.sendMessage({
        chatId,
        text: '👔 ขั้นตอนนี้กรุณาเลือกจากปุ่มด้านล่าง',
      });
      await this.employmentWizard.promptStep(chatId, draft);
      return;
    }

    const step = SELF_ONBOARDING_FORM_STEPS[draft.stepIndex];
    if (!step || isPhotoStep(step)) {
      const hint = step ? PHOTO_STEP_PROMPTS[step.key] : null;
      await this.gateway.sendMessage({
        chatId,
        text: hint ?? (
          '📎 ขั้นตอนนี้ต้องส่งเป็น <b>รูปภาพ</b> เท่านั้น\n' +
          'กดไอคอน 📎 แล้วเลือก "รูป" หรือถ่ายจากกล้อง'
        ),
        parseMode: 'HTML',
      });
      return;
    }
    if (isBankPickerStep(step)) {
      await this.gateway.sendMessage({ chatId, text: 'กรุณาเลือกธนาคารจากปุ่มด้านล่าง' });
      return;
    }

    let value = text.trim();
    if (step.key === 'fullName') {
      const nameError = validateSelfOnboardingFullName(value);
      if (nameError) {
        await this.gateway.sendMessage({ chatId, text: nameError, parseMode: 'HTML' });
        return;
      }
      value = value.replace(/\s+/g, ' ');
    }
    if (step.key === 'phone' || step.key === 'emergencyContactPhone') {
      const phoneError = validateSelfOnboardingPhone(value);
      if (phoneError) {
        await this.gateway.sendMessage({ chatId, text: phoneError, parseMode: 'HTML' });
        return;
      }
      value = normalizeThaiPhoneInput(value);
    }
    if (step.key === 'dateOfBirth') {
      const parsed = parseDateDdMmYyyyInput(text);
      if (!parsed) {
        await this.gateway.sendMessage({
          chatId,
          text: '❌ รูปแบบวันที่ไม่ถูกต้อง\nกรุณากรอก <b>วัน/เดือน/ปี</b> เช่น <code>15/06/2017</code>',
          parseMode: 'HTML',
        });
        return;
      }
      value = parsed;
    }
    if (step.key === 'bankAccountNumber') {
      if (!(await this.requireBankPickerOrContinue(chatId, draft, account, saveSession))) {
        return;
      }
      const digits = text.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) {
        await this.gateway.sendMessage({
          chatId,
          text: '❌ เลขบัญชีไม่ถูกต้อง\nกรุณากรอกตัวเลข 10–15 หลัก',
        });
        return;
      }
      value = digits;
    }
    (draft.data as Record<string, unknown>)[step.key] = value;
    await this.onboarding.saveDraftData(draft.employeeId, draft.data as Record<string, unknown>);
    draft.stepIndex += 1;
    await saveSession(account.id, 'self_onboarding_active', { draft });

    await this.continueAfterPersonalStep(chatId, draft, account, saveSession);
  }

  async handlePhoto(
    account: { id: string; userId: string },
    chatId: number,
    fileId: string,
    fileName: string,
    mimeType: string,
    context: SessionContext,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    try {
      const draft = await this.ensureDraft(account, context, saveSession);
      if (!draft) {
        await this.gateway.sendMessage({
          chatId,
          text: '❌ ไม่พบข้อมูลการลงทะเบียน กรุณากด /start จากลิงก์เชิญอีกครั้ง',
        });
        return;
      }

      if (this.isPersonalComplete(draft)) {
        await this.gateway.sendMessage({ chatId, text: '👔 ขั้นตอนนี้กรุณาเลือกจากปุ่มด้านล่าง' });
        if (draft.phase !== 'employment') draft.phase = 'employment';
        await this.employmentWizard.promptStep(chatId, draft);
        return;
      }

      const step = SELF_ONBOARDING_FORM_STEPS[draft.stepIndex];
      if (!step || !isPhotoStep(step)) {
        await this.gateway.sendMessage({ chatId, text: 'ขั้นตอนนี้ไม่รองรับการอัปโหลดรูป' });
        return;
      }

      if (!(await this.requireBankPickerOrContinue(chatId, draft, account, saveSession))) {
        return;
      }

      const fileInfo = await this.gateway.getFile(fileId);
      if (!fileInfo?.file_path) {
        await this.gateway.sendMessage({ chatId, text: 'ไม่สามารถดาวน์โหลดไฟล์ได้ กรุณาลองใหม่' });
        return;
      }
      const buffer = await this.gateway.downloadFile(fileInfo.file_path);
      if (!buffer) {
        await this.gateway.sendMessage({ chatId, text: 'ไม่สามารถดาวน์โหลดไฟล์ได้ กรุณาลองใหม่' });
        return;
      }

      await this.onboarding.attachDocument(
        draft.employeeId,
        step.key as SelfOnboardingDocumentType,
        buffer,
        fileName || `${step.key}.jpg`,
        mimeType || 'image/jpeg',
      );

      await this.gateway.sendMessage({
        chatId,
        text: `✅ รับ${step.label}แล้ว`,
      });

      draft.stepIndex += 1;
      await saveSession(account.id, 'self_onboarding_active', { draft });

      await this.continueAfterPersonalStep(chatId, draft, account, saveSession);
    } catch (err: unknown) {
      await this.gateway.sendMessage({
        chatId,
        text: `❌ อัปโหลดรูปไม่สำเร็จ: ${(err as Error).message}`,
      });
    }
  }

  async handleNonTextInput(chatId: number, context: SessionContext): Promise<void> {
    const draft = context.draft as SelfOnboardingDraft | undefined;
    if (!draft?.employeeId) return;

    if (draft.phase === 'employment' && draft.stepIndex >= SELF_ONBOARDING_FORM_STEPS.length) {
      await this.gateway.sendMessage({ chatId, text: '👔 กรุณาเลือกจากปุ่มด้านล่าง' });
      return;
    }

    const step = SELF_ONBOARDING_FORM_STEPS[draft.stepIndex];
    if (!step) return;

    if (isPhotoStep(step)) {
      await this.gateway.sendMessage({
        chatId,
        text: PHOTO_STEP_PROMPTS[step.key] ?? '📎 กรุณาส่งรูปภาพ',
        parseMode: 'HTML',
      });
      return;
    }
    if (isBankPickerStep(step)) {
      await this.gateway.sendMessage({ chatId, text: 'กรุณาเลือกธนาคารจากปุ่มด้านล่าง' });
      return;
    }
    await this.gateway.sendMessage({ chatId, text: `✏️ กรุณาพิมพ์${step.label}` });
  }

  async canResume(account: { userId: string }): Promise<boolean> {
    const telegramUserId = await this.onboarding.resolveTelegramUserIdForUser(account.userId);
    const draft = await this.onboarding.getResumeDraftForUser(account.userId, telegramUserId);
    return draft !== null;
  }

  async restartFlow(
    account: { id: string; userId: string },
    chatId: number,
    saveSession: SaveSessionFn,
  ): Promise<boolean> {
    const telegramUserId = await this.onboarding.resolveTelegramUserIdForUser(account.userId);
    if (telegramUserId != null && await this.onboarding.hasActiveTelegramIdentityForUser(telegramUserId)) {
      return false;
    }

    const employeeId = await this.onboarding.resolveEmployeeIdForOnboarding(
      account.userId,
      telegramUserId,
    );
    if (employeeId && await this.onboarding.hasActiveTelegramIdentity(employeeId)) {
      return false;
    }

    const resumed = await this.tryResumeSession(account);
    if (!resumed?.draft) return false;

    const draft = resumed.draft as SelfOnboardingDraft;
    await saveSession(account.id, 'self_onboarding_active', { draft });
    await this.gateway.sendMessage({
      chatId,
      text: '▶️ เริ่มกรอกข้อมูล — ข้อมูลที่บันทึกไว้แล้วยังอยู่',
    });
    if (draft.stepIndex >= SELF_ONBOARDING_FORM_STEPS.length) {
      await this.employmentWizard.ensureEmploymentLoaded(draft);
      if (draft.phase === 'employment' && !this.employmentWizard.isEmploymentComplete(draft)) {
        await this.employmentWizard.promptStep(chatId, draft);
      } else {
        await this.showSummary(chatId, draft);
      }
    } else {
      await this.promptStep(chatId, draft);
    }
    return true;
  }

  async handleCallback(
    account: { id: string; userId: string },
    chatId: number,
    data: string,
    context: SessionContext,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    const draft = await this.ensureDraft(account, context, saveSession);
    if (!draft) return;

    if (data.startsWith('so:emp:')) {
      const handled = await this.employmentWizard.handleCallback(data, draft, chatId);
      if (handled) {
        await this.continueAfterEmploymentStep(chatId, draft, account, saveSession);
      }
      return;
    }

    if (data === 'so:skip') {
      draft.stepIndex += 1;
      await saveSession(account.id, 'self_onboarding_active', { draft });
      await this.continueAfterPersonalStep(chatId, draft, account, saveSession);
      return;
    }

    if (data === 'so:back') {
      draft.stepIndex = Math.max(0, draft.stepIndex - 1);
      await saveSession(account.id, 'self_onboarding_active', { draft });
      await this.promptStep(chatId, draft);
      return;
    }

    if (data === 'so:cancel') {
      await saveSession(account.id, 'idle', {});
      await this.gateway.sendMessage({
        chatId,
        text: 'ยกเลิกการกรอกข้อมูลแล้ว\n\nพิมพ์ /start เพื่อเริ่มกรอกใหม่',
      });
      return;
    }

    if (data.startsWith('so:bank:')) {
      const bankValue = data.slice('so:bank:'.length);
      const bank = resolveSelfOnboardingBank(bankValue);
      if (!bank) return;
      draft.data.bankCode = bank.code;
      draft.data.bankName = bank.label;
      await this.onboarding.saveDraftData(draft.employeeId, draft.data as Record<string, unknown>);
      draft.stepIndex += 1;
      await saveSession(account.id, 'self_onboarding_active', { draft });
      await this.continueAfterPersonalStep(chatId, draft, account, saveSession);
      return;
    }

    if (data === 'so:edit') {
      draft.stepIndex = 0;
      draft.phase = 'personal';
      delete draft.employmentStepIndex;
      await saveSession(account.id, 'self_onboarding_active', { draft });
      await this.promptStep(chatId, draft);
      return;
    }

    if (data === 'so:submit') {
      await this.employmentWizard.ensureEmploymentLoaded(draft);
      const personalError = this.validatePersonalDraft(draft.data);
      if (personalError) {
        await this.gateway.sendMessage({ chatId, text: personalError, parseMode: 'HTML' });
        draft.phase = 'personal';
        draft.stepIndex = 0;
        await saveSession(account.id, 'self_onboarding_active', { draft });
        await this.promptStep(chatId, draft);
        return;
      }
      const employmentError = this.employmentWizard.validateForSubmit(draft);
      if (employmentError) {
        await this.gateway.sendMessage({ chatId, text: employmentError, parseMode: 'HTML' });
        draft.phase = 'employment';
        await saveSession(account.id, 'self_onboarding_active', { draft });
        await this.employmentWizard.promptStep(chatId, draft);
        return;
      }
      if (!this.employmentWizard.isEmploymentComplete(draft)) {
        draft.phase = 'employment';
        await saveSession(account.id, 'self_onboarding_active', { draft });
        await this.gateway.sendMessage({
          chatId,
          text: '👔 กรุณากรอกข้อมูลการทำงานให้ครบก่อนส่ง',
        });
        await this.employmentWizard.promptStep(chatId, draft);
        return;
      }
      await this.onboarding.submit(draft.employeeId, account.userId);
      await saveSession(account.id, 'idle', {});
      await this.gateway.sendMessage({
        chatId,
        text:
          '📨 <b>ส่งข้อมูลให้ HR ตรวจสอบแล้ว</b>\n\n' +
          'หลังจาก HR ตรวจสอบ ระบบจะแจ้งผลให้ทราบอีกครั้ง',
        parseMode: 'HTML',
      });
    }
  }

  private async promptStep(chatId: number, draft: SelfOnboardingDraft): Promise<void> {
    const step = SELF_ONBOARDING_FORM_STEPS[draft.stepIndex];
    if (!step) return;

    const skippable = 'skippable' in step && step.skippable;
    const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

    if (isBankPickerStep(step)) {
      for (let i = 0; i < SELF_ONBOARDING_BANK_OPTIONS.length; i += 2) {
        keyboard.push(
          SELF_ONBOARDING_BANK_OPTIONS.slice(i, i + 2).map((bank) => ({
            text: bank.label,
            callback_data: `so:bank:${bank.value}`,
          })),
        );
      }
    }

    const navRow: Array<{ text: string; callback_data: string }> = [];
    if (draft.stepIndex > 0) navRow.push({ text: '⬅️ ย้อนกลับ', callback_data: 'so:back' });
    if (skippable) navRow.push({ text: 'ข้าม', callback_data: 'so:skip' });
    navRow.push({ text: '❌ ยกเลิก', callback_data: 'so:cancel' });
    if (navRow.length) keyboard.push(navRow);

    const prefix = isPhotoStep(step)
      ? PHOTO_STEP_PROMPTS[step.key] ?? '📎 กรุณาส่งรูปภาพ'
      : isBankPickerStep(step)
        ? '🏦 กรุณาเลือก'
        : '✏️ กรุณากรอก';

    const stepLine = isPhotoStep(step)
      ? `\n\n<i>ขั้นที่ ${draft.stepIndex + 1}/${SELF_ONBOARDING_FORM_STEPS.length}</i>`
      : ` <b>${step.label}</b> (${draft.stepIndex + 1}/${SELF_ONBOARDING_FORM_STEPS.length})`;
    const hint = SELF_ONBOARDING_FIELD_HINTS[step.key];
    const hintLine = hint ? `\n<i>${hint}</i>` : '';

    await this.gateway.sendMessage({
      chatId,
      text: `${prefix}${stepLine}${hintLine}`,
      parseMode: 'HTML',
      replyMarkup: keyboard.length ? { inline_keyboard: keyboard } : undefined,
    });
  }

  private async showSummary(chatId: number, draft: SelfOnboardingDraft): Promise<void> {
    const d = draft.data;
    await this.employmentWizard.ensureEmploymentLoaded(draft);
    const lines = [
      '📋 <b>ตรวจสอบข้อมูล</b>',
      '',
      '<b>ข้อมูลส่วนตัว</b>',
      `ชื่อ: ${d.fullName ?? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim()}`,
      `ชื่อเล่น: ${d.nickname ?? '—'}`,
      `เบอร์: ${d.phone ?? '—'}`,
      `วันเกิด: ${d.dateOfBirth ? formatIsoDateAsDdMmYyyy(d.dateOfBirth) : '—'}`,
      `บัญชีธนาคาร: ${bankDisplayLabel(d)} / ${d.bankAccountNumber ?? '—'}`,
      `ผู้ติดต่อฉุกเฉิน: ${d.emergencyContactName ?? '—'} (${d.emergencyContactPhone ?? '—'})`,
      ...this.employmentWizard.formatSummaryLines(draft.employment),
      '',
      'หากถูกต้อง กดส่งข้อมูลให้ HR ตรวจสอบ',
    ];

    await this.gateway.sendMessage({
      chatId,
      text: lines.join('\n'),
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '✅ ส่งข้อมูล', callback_data: 'so:submit' },
            { text: '✏️ แก้ไข', callback_data: 'so:edit' },
          ],
          [{ text: '❌ ยกเลิก', callback_data: 'so:cancel' }],
        ],
      },
    });
  }

  private validatePersonalDraft(data: SelfOnboardingSubmittedData): string | null {
    if (data.fullName) {
      const err = validateSelfOnboardingFullName(data.fullName);
      if (err) return err;
    }
    if (data.phone) {
      const err = validateSelfOnboardingPhone(data.phone);
      if (err) return err;
    }
    if (data.emergencyContactPhone) {
      const err = validateSelfOnboardingPhone(data.emergencyContactPhone);
      if (err) return err;
    }
    return null;
  }
}
