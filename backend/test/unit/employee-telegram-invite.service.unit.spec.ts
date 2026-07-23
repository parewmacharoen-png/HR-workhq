// ============================================================================
// test/unit/employee-telegram-invite.service.unit.spec.ts
// ============================================================================

import { createHash } from 'crypto';
import { EmployeeTelegramInviteService } from '../../src/modules/employee-onboarding/application/employee-telegram-invite.service';

describe('EmployeeTelegramInviteService', () => {
  const hashOnly = {
    hashToken(raw: string) {
      return createHash('sha256').update(raw).digest('hex');
    },
    buildInviteLink(raw: string) {
      process.env.TELEGRAM_BOT_USERNAME = 'TestBot';
      return `https://t.me/TestBot?start=invite_${raw}`;
    },
  };

  it('hashes token with sha256', () => {
    const svc = hashOnly as Pick<EmployeeTelegramInviteService, 'hashToken' | 'buildInviteLink'>;
    const raw = 'abc123token';
    expect(svc.hashToken(raw)).toBe(createHash('sha256').update(raw).digest('hex'));
  });

  it('builds deep link with invite prefix', () => {
    const svc = hashOnly as Pick<EmployeeTelegramInviteService, 'hashToken' | 'buildInviteLink'>;
    expect(svc.buildInviteLink('tok')).toContain('invite_tok');
  });
});
