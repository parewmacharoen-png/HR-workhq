// ============================================================================
// shared/time/bangkok-time.provider.ts
// INF-001 — centralized Asia/Bangkok timezone handling.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { BANGKOK_TZ } from '../../modules/employee/domain/services/employee-date-events.service';

export { BANGKOK_TZ };

@Injectable()
export class BangkokTimeProvider {
  readonly timezone = BANGKOK_TZ;

  now(): Date {
    return new Date();
  }

  /** Calendar date at midnight UTC matching Bangkok YYYY-MM-DD. */
  workDate(asOf: Date = this.now()): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: BANGKOK_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(asOf);
    return new Date(`${parts}T00:00:00.000Z`);
  }

  /** ISO date string YYYY-MM-DD in Bangkok. */
  workDateString(asOf: Date = this.now()): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: BANGKOK_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(asOf);
  }

  minutesSinceMidnight(asOf: Date = this.now()): number {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: BANGKOK_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(asOf);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return hour * 60 + minute;
  }

  /** Parse YYYY-MM-DD as Bangkok work date. */
  parseWorkDate(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }
}
