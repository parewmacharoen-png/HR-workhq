// ============================================================================
// modules/calendar/application/team-calendar.handler.ts
// TEAM-001 — Telegram team calendar
// ============================================================================

import { Injectable } from '@nestjs/common';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import { TeamCalendarService } from './team-calendar.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CalendarEventDto } from './dto/team-calendar.dto';

const CATEGORY_ICON: Record<string, string> = {
  off_day: '🟢',
  monthly_off: '🗓',
  approved_leave: '🔵',
  sick_leave: '🟠',
  emergency_leave: '🔴',
  unpaid_leave: '⚪',
  shift_change: '🟣',
};

@Injectable()
export class TeamCalendarTelegramHandler {
  constructor(
    private readonly calendar: TeamCalendarService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  async showMenu(chatId: number): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: '📅 <b>ปฏิทินทีม</b>\nเลือกช่วงเวลา:',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📆 วันนี้', callback_data: 'calendar:today' }],
          [{ text: '📆 พรุ่งนี้', callback_data: 'calendar:tomorrow' }],
          [{ text: '📆 สัปดาห์นี้', callback_data: 'calendar:week' }],
          [{ text: '📆 เดือนนี้', callback_data: 'calendar:month' }],
          [{ text: '🏠 กลับเมนูหลัก', callback_data: 'home' }],
        ],
      },
    });
  }

  async handleCallback(
    actor: ActorContext,
    chatId: number,
    data: string,
    telegramAccountId: string,
  ): Promise<void> {
    let payload: { date?: string; events: CalendarEventDto[]; count?: number; summary?: { todayOff: number; tomorrowOff: number; upcoming7Days: number } };
    let title = '';

    switch (data) {
      case 'calendar:today': {
        const res = await this.calendar.getToday(actor);
        title = `📅 <b>ปฏิทินทีม — วันนี้ (${res.date})</b>`;
        payload = { events: res.events, count: res.count };
        break;
      }
      case 'calendar:tomorrow': {
        const res = await this.calendar.getTomorrow(actor);
        title = `📅 <b>ปฏิทินทีม — พรุ่งนี้ (${res.date})</b>`;
        payload = { events: res.events, count: res.count };
        break;
      }
      case 'calendar:week': {
        const res = await this.calendar.getUpcoming(actor, actor.companyId ?? undefined, 7);
        title = '📅 <b>ปฏิทินทีม — สัปดาห์นี้</b>';
        payload = res;
        break;
      }
      case 'calendar:month':
      default: {
        const res = await this.calendar.getTeam(actor, { companyId: actor.companyId ?? undefined });
        title = '📅 <b>ปฏิทินทีม — เดือนนี้</b>';
        payload = res;
        break;
      }
    }

    const lines = [title, ''];
    if (payload.events.length === 0) {
      lines.push('ไม่มีการลา/หยุดในช่วงนี้');
    } else {
      for (const e of payload.events.slice(0, 15)) {
        const icon = CATEGORY_ICON[e.category] ?? '•';
        lines.push(`${icon} ${e.employeeName} — ${e.leaveTypeName ?? e.category} (${e.startDate}${e.endDate !== e.startDate ? ` → ${e.endDate}` : ''})`);
      }
      if (payload.events.length > 15) lines.push(`… และอีก ${payload.events.length - 15} รายการ`);
    }
    if (payload.summary) {
      lines.push('', `วันนี้: ${payload.summary.todayOff} · พรุ่งนี้: ${payload.summary.tomorrowOff} · 7 วัน: ${payload.summary.upcoming7Days}`);
    }

    await this.gateway.sendMessage({
      chatId,
      text: lines.join('\n'),
      parseMode: 'HTML',
      telegramAccountId,
      messageType: 'team_calendar',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📅 เลือกช่วงอื่น', callback_data: 'calendar:menu' }],
          [{ text: '🏠 กลับเมนูหลัก', callback_data: 'home' }],
        ],
      },
    });
  }
}
