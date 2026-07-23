// ============================================================================
// shared/time/scheduler-time.provider.ts
// INF-001b — Bangkok-aware scheduler helpers (lock keys, next run).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { BangkokTimeProvider } from './bangkok-time.provider';

@Injectable()
export class SchedulerTimeProvider {
  constructor(private readonly bangkok: BangkokTimeProvider) {}

  /** Date key for Redis/dedup locks — always Bangkok YYYY-MM-DD. */
  dateKey(asOf: Date = this.bangkok.now()): string {
    return this.bangkok.workDateString(asOf);
  }

  /** Minute bucket key in Bangkok local time. */
  minuteKey(asOf: Date = this.bangkok.now()): string {
    const d = this.bangkok.workDateString(asOf);
    const mins = this.bangkok.minutesSinceMidnight(asOf);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    return `${d}:${hh}:${mm}`;
  }

  /** Next UTC instant when Bangkok local time reaches hour:minute. */
  nextBangkokRun(hour: number, minute: number, asOf: Date = this.bangkok.now()): Date {
    const dateStr = this.bangkok.workDateString(asOf);
    let candidate = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`);
    if (candidate <= asOf) {
      const nextDay = new Date(this.bangkok.parseWorkDate(dateStr));
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const nextStr = nextDay.toISOString().slice(0, 10);
      candidate = new Date(`${nextStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`);
    }
    return candidate;
  }
}
