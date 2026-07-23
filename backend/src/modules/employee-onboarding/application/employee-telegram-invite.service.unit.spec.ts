// ============================================================================
// test/unit/employee-telegram-invite.service.unit.spec.ts → src path
// ============================================================================

import { createHash } from 'crypto';
import { EmployeeTelegramInviteService } from './employee-telegram-invite.service';

describe('EmployeeTelegramInviteService', () => {
  const telegramHealth = {
    resolveBotUsername: jest.fn().mockResolvedValue('TestBot'),
  };
  const svc = new EmployeeTelegramInviteService(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    telegramHealth as never,
  );

  const hashOnly = {
    hashToken(raw: string) {
      return svc.hashToken(raw);
    },
    async buildInviteLink(raw: string) {
      return svc.buildInviteLink(raw);
    },
    mapInviteToApiStatus: svc.mapInviteToApiStatus.bind(svc),
  };

  it('hashes token with sha256', () => {
    const raw = 'abc123token';
    expect(hashOnly.hashToken(raw)).toBe(createHash('sha256').update(raw).digest('hex'));
  });

  it('builds deep link with invite prefix', async () => {
    await expect(hashOnly.buildInviteLink('tok')).resolves.toContain('invite_tok');
    await expect(hashOnly.buildInviteLink('tok')).resolves.toContain('https://t.me/TestBot');
  });

  it('maps invite status to API status', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 86400000);
    const past = new Date(now.getTime() - 86400000);
    expect(hashOnly.mapInviteToApiStatus('pending', future)).toBe('ACTIVE');
    expect(hashOnly.mapInviteToApiStatus('pending', past)).toBe('EXPIRED');
    expect(hashOnly.mapInviteToApiStatus('used', future)).toBe('USED');
    expect(hashOnly.mapInviteToApiStatus('cancelled', future)).toBe('REVOKED');
  });
});
