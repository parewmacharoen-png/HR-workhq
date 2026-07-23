// ============================================================================
// modules/telegram/infrastructure/telegram-gateway.service.ts
// Wraps the Telegram Bot API. All outbound messages go through here so we have
// a single place for retry logic, rate limiting, and the message audit log.
// Uses fetch (Node 18+) — no extra HTTP library needed.
// ============================================================================

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { TelegramMessageLogService } from '../application/telegram-message-log.service';

export interface SendMessageInput {
  chatId: number;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  replyMarkup?: unknown;   // InlineKeyboardMarkup etc.
  telegramAccountId?: string;
  messageType?: string;
}

export interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
}

@Injectable()
export class TelegramGatewayService implements OnModuleInit {
  private readonly logger = new Logger(TelegramGatewayService.name);
  private baseUrl!: string;
  private token!: string;

  constructor(
    private readonly config: AppConfigService,
    private readonly messageLog: TelegramMessageLogService,
  ) {}

  onModuleInit(): void {
    // TELEGRAM_BOT_TOKEN added to env; graceful no-op if absent in dev
    this.token = process.env['TELEGRAM_BOT_TOKEN'] ?? '';
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
    if (!this.token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set — Telegram gateway is inactive');
    }
  }

  async removeReplyKeyboard(chatId: number): Promise<void> {
    if (!this.token) return;
    await this.post('sendMessage', {
      chat_id: chatId,
      text: '\u200b',
      reply_markup: { remove_keyboard: true },
    });
  }

  /** Updates the persistent bottom reply keyboard for a chat. */
  async setReplyKeyboard(chatId: number, replyMarkup: unknown): Promise<void> {
    if (!this.token) return;
    await this.post('sendMessage', {
      chat_id: chatId,
      text: '\u200b',
      reply_markup: replyMarkup,
    });
  }

  /** Shows the blue "Menu" button (bot command list) beside the message input. */
  async setChatMenuButton(chatId?: number): Promise<{ ok: boolean; error?: string }> {
    if (!this.token) return { ok: false, error: 'no token' };
    const body: Record<string, unknown> = {
      menu_button: { type: 'commands' },
    };
    if (chatId != null) body['chat_id'] = chatId;
    return this.postWithMeta('setChatMenuButton', body);
  }

  async sendMessage(input: SendMessageInput): Promise<number | null> {
    if (!this.token) return null;
    const safeText = (input.text ?? '').trim() || '…';
    const body: Record<string, unknown> = {
      chat_id: input.chatId,
      text: safeText,
      parse_mode: input.parseMode ?? 'HTML',
    };
    if (input.replyMarkup) body['reply_markup'] = input.replyMarkup;
    const res = await this.post<{ message_id: number }>('sendMessage', body);
    const messageId = res?.message_id ?? null;
    try {
      const accountId = input.telegramAccountId
        ?? await this.messageLog.resolveAccountIdByChat(input.chatId);
      if (accountId) {
        await this.messageLog.logMessage(
          accountId,
          'outbound',
          input.messageType ?? 'text',
          { chatId: input.chatId, text: input.text, replyMarkup: input.replyMarkup ?? null },
          messageId,
        );
      }
    } catch (err) {
      this.logger.warn('Outbound message log failed', err);
    }
    return messageId;
  }

  async sendDocument(input: {
    chatId: number;
    buffer: Buffer;
    filename: string;
    caption?: string;
    contentType?: string;
    telegramAccountId?: string;
    messageType?: string;
  }): Promise<number | null> {
    if (!this.token) return null;
    try {
      const form = new FormData();
      form.append('chat_id', String(input.chatId));
      form.append(
        'document',
        new Blob([Uint8Array.from(input.buffer)], {
          type: input.contentType ?? 'application/pdf',
        }),
        input.filename,
      );
      if (input.caption?.trim()) {
        form.append('caption', input.caption.trim());
        form.append('parse_mode', 'HTML');
      }

      const res = await fetch(`${this.baseUrl}/sendDocument`, {
        method: 'POST',
        body: form,
      });
      const json = (await res.json()) as TelegramApiResponse<{ message_id: number }>;
      if (!json.ok) {
        this.logger.warn(`Telegram sendDocument failed: ${json.description}`);
        return null;
      }
      const messageId = json.result?.message_id ?? null;
      try {
        const accountId = input.telegramAccountId
          ?? await this.messageLog.resolveAccountIdByChat(input.chatId);
        if (accountId) {
          await this.messageLog.logMessage(
            accountId,
            'outbound',
            input.messageType ?? 'document',
            { chatId: input.chatId, filename: input.filename, caption: input.caption ?? null },
            messageId,
          );
        }
      } catch (err) {
        this.logger.warn('Outbound document log failed', err);
      }
      return messageId;
    } catch (err) {
      this.logger.error('Telegram sendDocument error', err);
      return null;
    }
  }

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    replyMarkup?: unknown,
  ): Promise<boolean> {
    if (!this.token) return false;
    const safeText = (text ?? '').trim() || '…';
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text: safeText,
      parse_mode: 'HTML',
    };
    if (replyMarkup !== undefined) body.reply_markup = replyMarkup;
    const res = await this.post('editMessageText', body);
    if (res != null) return true;
    // Same content is not an error — still try markup-only update.
    if (replyMarkup !== undefined) {
      return this.editMessageReplyMarkup(chatId, messageId, replyMarkup);
    }
    return false;
  }

  async editMessageReplyMarkup(chatId: number, messageId: number, replyMarkup: unknown): Promise<boolean> {
    if (!this.token) return false;
    const res = await this.post('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup,
    });
    return res != null;
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    if (!this.token) return;
    await this.post('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
  }

  async downloadFile(filePath: string): Promise<Buffer | null> {
    if (!this.token) return null;
    try {
      const fileUrl = `https://api.telegram.org/file/bot${this.token}/${filePath}`;
      const res = await fetch(fileUrl);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      this.logger.error('Telegram downloadFile error', err);
      return null;
    }
  }

  async getFile(fileId: string): Promise<{ file_path: string; file_size?: number } | null> {
    if (!this.token) return null;
    return this.post('getFile', { file_id: fileId });
  }

  /** Registers slash-command suggestions shown when the user types "/". */
  async setMyCommands(
    commands: Array<{ command: string; description: string }>,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.token || commands.length === 0) {
      return { ok: false, error: 'no token or empty command list' };
    }
    const payload = commands.map((c) => ({
      command: c.command,
      description: c.description.slice(0, 256),
    }));

    const primary = await this.postWithMeta('setMyCommands', { commands: payload });
    if (primary.ok) return { ok: true };

    const scoped = await this.postWithMeta('setMyCommands', {
      commands: payload,
      scope: { type: 'all_private_chats' },
    });
    if (scoped.ok) return { ok: true };

    return { ok: false, error: scoped.error ?? primary.error ?? 'unknown error' };
  }

  private async postWithMeta(method: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
    if (!this.token) return { ok: false, error: 'no token' };
    try {
      const res = await fetch(`${this.baseUrl}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as TelegramApiResponse<unknown>;
      if (json.ok) return { ok: true };
      const error = json.description ?? `HTTP ${res.status}`;
      this.logger.warn(`Telegram ${method} failed: ${error}`);
      return { ok: false, error };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Telegram ${method} error`, err);
      return { ok: false, error: message };
    }
  }

  private async post<T>(method: string, body: unknown): Promise<T | null> {
    try {
      const res = await fetch(`${this.baseUrl}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as TelegramApiResponse<T>;
      if (!json.ok) {
        this.logger.warn(`Telegram ${method} failed: ${json.description}`);
        return null;
      }
      return json.result ?? null;
    } catch (err) {
      this.logger.error(`Telegram ${method} error`, err);
      return null;
    }
  }
}
