// ============================================================================
// shared/time/date.provider.ts
// INF-001b — injectable Bangkok calendar clock (no server-local assumptions).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { BangkokTimeProvider } from './bangkok-time.provider';

@Injectable()
export class DateProvider {
  constructor(private readonly bangkok: BangkokTimeProvider) {}

  now(): Date {
    return this.bangkok.now();
  }

  today(): Date {
    return this.bangkok.workDate();
  }

  todayString(): string {
    return this.bangkok.workDateString();
  }

  tomorrow(): Date {
    return this.addDays(this.today(), 1);
  }

  tomorrowString(): string {
    return this.bangkok.workDateString(this.addDays(this.now(), 1));
  }

  parseDate(dateStr: string): Date {
    return this.bangkok.parseWorkDate(dateStr);
  }

  addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }

  /** Inclusive date range as YYYY-MM-DD strings in Bangkok. */
  rangeStrings(start: Date, end: Date): string[] {
    const out: string[] = [];
    let cur = start;
    while (cur <= end) {
      out.push(cur.toISOString().slice(0, 10));
      cur = this.addDays(cur, 1);
    }
    return out;
  }

  startOfMonth(asOf?: Date): Date {
    const s = this.bangkok.workDateString(asOf);
    const [y, m] = s.split('-').map(Number);
    return new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00.000Z`);
  }

  endOfMonth(asOf?: Date): Date {
    const start = this.startOfMonth(asOf);
    const next = new Date(start);
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(next.getUTCDate() - 1);
    return next;
  }
}
