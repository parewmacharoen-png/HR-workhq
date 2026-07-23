import { describe, expect, it } from 'vitest';
import {
  buildTelegramLinkMessage,
  mapTelegramUiStatus,
  telegramHeaderActionLabel,
  telegramLinkStatusLabel,
  TELEGRAM_LINK_MESSAGE_TEMPLATE,
} from './employee-telegram-link';

describe('employee-telegram-link api helpers', () => {
  it('maps backend telegram status to UI status', () => {
    expect(mapTelegramUiStatus('not_connected')).toBe('NOT_LINKED');
    expect(mapTelegramUiStatus('invite_sent')).toBe('LINK_SENT');
    expect(mapTelegramUiStatus('pending_review')).toBe('PENDING_REVIEW');
    expect(mapTelegramUiStatus('linked')).toBe('LINKED');
    expect(mapTelegramUiStatus('not_connected', true)).toBe('LINKED');
    expect(mapTelegramUiStatus('started')).toBe('PENDING_REVIEW');
    expect(mapTelegramUiStatus('rejected')).toBe('NOT_LINKED');
  });

  it('returns header action labels', () => {
    expect(telegramHeaderActionLabel('NOT_LINKED')).toBe('เชื่อม Telegram');
    expect(telegramHeaderActionLabel('LINK_SENT')).toBe('ส่งลิงก์แล้ว');
    expect(telegramHeaderActionLabel('PENDING_REVIEW')).toBe('รอ HR ตรวจสอบ');
    expect(telegramHeaderActionLabel('LINKED')).toBe('เชื่อมแล้ว');
  });

  it('returns link status labels', () => {
    expect(telegramLinkStatusLabel('ACTIVE')).toBe('พร้อมใช้งาน');
    expect(telegramLinkStatusLabel('EXPIRED')).toBe('หมดอายุ');
  });

  it('builds copy message with link placeholder', () => {
    const link = 'https://t.me/WorkHQBot?start=invite_abc';
    expect(buildTelegramLinkMessage(link)).toBe(
      TELEGRAM_LINK_MESSAGE_TEMPLATE.replace('{{link}}', link),
    );
  });
});
