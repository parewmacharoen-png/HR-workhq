// ============================================================================
// modules/security/application/telegram-identity-guard.service.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { TelegramIdentityService } from './telegram-identity.service';
import { TelegramAccessDeniedError } from '../domain/errors/security.errors';
import { TelegramAccessState } from '../domain/telegram-identity.types';

@Injectable()
export class TelegramIdentityGuard {
  constructor(private readonly identities: TelegramIdentityService) {}

  async getAccessState(telegramUserId: number): Promise<TelegramAccessState> {
    return this.identities.getAccessState(telegramUserId);
  }

  async assertHrAccess(telegramUserId: number): Promise<void> {
    await this.identities.assertActiveForTelegramUser(telegramUserId);
  }

  async assertSelfServiceToolAccess(userId: string, channel?: string): Promise<void> {
    if (channel !== 'telegram') return;
    await this.identities.assertActiveForUserTelegram(userId);
  }

  accessDeniedMessage(state: TelegramAccessState): string {
    switch (state) {
      case 'revoked':
        return 'Your account access has been revoked.\nPlease contact HR.';
      case 'pending':
        return '⏳ การลงทะเบียนของคุณอยู่ระหว่างตรวจสอบ\nกรุณารอ HR อนุมัติ';
      case 'unverified':
        return '🔐 กรุณายืนยันตัวตนก่อนใช้งาน\nพิมพ์ /start เพื่อเริ่มลงทะเบียน';
      default:
        return 'Access denied';
    }
  }

  isHrActionAllowed(state: TelegramAccessState): boolean {
    return state === 'active';
  }

  throwIfDenied(state: TelegramAccessState): void {
    if (state === 'active') return;
    throw new TelegramAccessDeniedError(this.accessDeniedMessage(state));
  }
}
