// ============================================================================
// test/helpers/telegram-fixtures.ts
// TEST-001b — shared Telegram workflow matrix fixtures
// ============================================================================

import { PrismaService } from '../../src/shared/prisma/prisma.service';

export interface TelegramRoleFixture {
  label: string;
  roleCode: string;
  telegramUserId: number;
  chatId: number;
}

export function buildCallbackPayload(
  telegramUserId: number,
  chatId: number,
  data: string,
) {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    callback_query: {
      id: `cb_${Math.random()}`,
      from: { id: telegramUserId, username: 'test_user' },
      data,
      message: { message_id: 1, chat: { id: chatId } },
    },
  };
}

export async function findUserTelegramId(
  prisma: PrismaService,
  userId: string,
): Promise<number | null> {
  const acc = await prisma.telegramAccount.findFirst({
    where: { userId, isActive: true, deletedAt: null },
  });
  return acc?.chatId ? Number(acc.chatId) : null;
}

export const WORKFLOW_MATRIX_ENTITY_TYPES = [
  'leave_request',
  'overtime',
  'advance_pay',
  'attendance_correction',
  'referral',
  'exit_case',
  'exit_settlement',
  'document_request',
] as const;
