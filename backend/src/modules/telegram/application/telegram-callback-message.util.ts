// ============================================================================
// Normalize Telegram callback_query.message for editMessageText / edit markup.
// ============================================================================

export interface TelegramSourceMessage {
  message_id: number;
  chat: { id: number };
}

export function normalizeCallbackSourceMessage(
  message: unknown,
  fallbackChatId?: number,
): TelegramSourceMessage | undefined {
  if (!message || typeof message !== 'object') {
    if (fallbackChatId == null) return undefined;
    return undefined;
  }
  const row = message as { message_id?: number; chat?: { id?: number } };
  const messageId = row.message_id;
  const chatId = row.chat?.id ?? fallbackChatId;
  if (messageId == null || chatId == null) return undefined;
  return { message_id: messageId, chat: { id: chatId } };
}

/** Strip @BotName suffix and arguments — `/checkin@bot` → `/checkin`. */
export function normalizeTelegramCommand(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return trimmed.toLowerCase();
  const head = trimmed.split(/\s+/)[0] ?? trimmed;
  const at = head.indexOf('@');
  const command = at === -1 ? head : head.slice(0, at);
  return command.toLowerCase();
}
