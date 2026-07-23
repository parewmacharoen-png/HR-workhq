// ============================================================================
// modules/workday/application/workday-daily-brief.service.ts
// Scheduled Telegram brief payloads — methods ready for cron wiring.
// ============================================================================

import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';
import { WorkDayService } from './workday.service';
import { WorkforceRiskService } from '../../workforce-risk/application/workforce-risk.service';
import { SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';

export type DailyBriefKind =
  | 'morning_summary'
  | 'missing_check_in'
  | 'break_too_long'
  | 'missing_check_out';

export interface DailyBriefPayload {
  kind: DailyBriefKind;
  companyId: string;
  date: string;
  title: string;
  lines: string[];
}

@Injectable()
export class WorkDayDailyBriefService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: BangkokTimeProvider,
    private readonly workdays: WorkDayService,
    @Optional() @Inject(forwardRef(() => WorkforceRiskService))
    private readonly workforceRisk?: WorkforceRiskService,
  ) {}

  /** 08:00 — company workforce summary for today. */
  async buildMorningSummary(companyId: string): Promise<DailyBriefPayload> {
    const date = this.time.workDateString();
    const employeeIds = await this.allActiveEmployeeIds(companyId);
    const workDays = await this.workdays.getCompanyWorkDaysByEmployeeIds(companyId, date, employeeIds);
    const center = this.summarizeWorkDays(companyId, date, workDays);
    const lines = [
      `ทำงานอยู่: ${center.widgets.working.length}`,
      `สาย: ${center.widgets.late.length}`,
      `ยังไม่เข้างาน: ${center.widgets.notCheckedIn.length}`,
      `พักอยู่: ${center.widgets.onBreak.length}`,
      `OT: ${center.widgets.ot.length}`,
      `วันหยุด: ${center.widgets.offDay.length}`,
      `ลา: ${center.widgets.onLeave.length}`,
      `ต้องจัดการ: ${center.widgets.needsAction.length}`,
    ];

    if (this.workforceRisk) {
      const risk = await this.workforceRisk.getCompanyRisk(SYSTEM_ACTOR, companyId, date);
      const atRisk = risk.teams.filter((t) => t.level === 'ORANGE' || t.level === 'RED');
      if (atRisk.length > 0) {
        lines.push(`⚠️ วันนี้มีความเสี่ยงกำลังคน ${atRisk.length} เรื่อง`);
        for (const team of atRisk.slice(0, 5)) {
          const label = team.teamName ?? 'ทีม';
          if (team.shortage > 0) {
            lines.push(`- ${label} ขาด ${team.shortage} คน`);
          } else {
            lines.push(`- ${label} เหลือเท่าขั้นต่ำ`);
          }
        }
      }
    }
    return {
      kind: 'morning_summary',
      companyId,
      date,
      title: 'สรุปกำลังพลวันนี้',
      lines,
    };
  }

  /** 09:16 — employees missing check-in after grace. */
  async buildMissingCheckInBrief(companyId: string): Promise<DailyBriefPayload> {
    const date = this.time.workDateString();
    const employeeIds = await this.allActiveEmployeeIds(companyId);
    const workDays = await this.workdays.getCompanyWorkDaysByEmployeeIds(companyId, date, employeeIds);
    const center = this.summarizeWorkDays(companyId, date, workDays);
    const bucket = center.exceptions.find((e) => e.type === 'missing_check_in');
    const lines = (bucket?.items ?? []).map(
      (e) => `${e.firstName} ${e.lastName} (${e.globalId})`,
    );
    return {
      kind: 'missing_check_in',
      companyId,
      date,
      title: 'ยังไม่กดเข้างาน',
      lines: lines.length ? lines : ['ไม่มีรายการ'],
    };
  }

  /** 12:45 — employees on break too long. */
  async buildBreakTooLongBrief(companyId: string): Promise<DailyBriefPayload> {
    const date = this.time.workDateString();
    const employeeIds = await this.allActiveEmployeeIds(companyId);
    const workDays = await this.workdays.getCompanyWorkDaysByEmployeeIds(companyId, date, employeeIds);
    const center = this.summarizeWorkDays(companyId, date, workDays);
    const bucket = center.exceptions.find((e) => e.type === 'break_too_long');
    const lines = (bucket?.items ?? []).map(
      (e) => `${e.firstName} ${e.lastName} (${e.globalId})`,
    );
    return {
      kind: 'break_too_long',
      companyId,
      date,
      title: 'พักเกินเวลา',
      lines: lines.length ? lines : ['ไม่มีรายการ'],
    };
  }

  /** 21:15 — employees missing checkout. */
  async buildMissingCheckOutBrief(companyId: string): Promise<DailyBriefPayload> {
    const date = this.time.workDateString();
    const employeeIds = await this.allActiveEmployeeIds(companyId);
    const workDays = await this.workdays.getCompanyWorkDaysByEmployeeIds(companyId, date, employeeIds);
    const center = this.summarizeWorkDays(companyId, date, workDays);
    const bucket = center.exceptions.find((e) => e.type === 'missing_check_out');
    const lines = (bucket?.items ?? []).map(
      (e) => `${e.firstName} ${e.lastName} (${e.globalId})`,
    );
    return {
      kind: 'missing_check_out',
      companyId,
      date,
      title: 'ยังไม่กดเลิกงาน',
      lines: lines.length ? lines : ['ไม่มีรายการ'],
    };
  }

  async buildBrief(kind: DailyBriefKind, companyId: string): Promise<DailyBriefPayload> {
    switch (kind) {
      case 'morning_summary':
        return this.buildMorningSummary(companyId);
      case 'missing_check_in':
        return this.buildMissingCheckInBrief(companyId);
      case 'break_too_long':
        return this.buildBreakTooLongBrief(companyId);
      case 'missing_check_out':
        return this.buildMissingCheckOutBrief(companyId);
      default:
        return this.buildMorningSummary(companyId);
    }
  }

  private async allActiveEmployeeIds(companyId: string): Promise<string[]> {
    const rows = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { in: ['active', 'probation'] },
        assignments: {
          some: { companyId, effectiveTo: null, deletedAt: null },
        },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private summarizeWorkDays(
    companyId: string,
    date: string,
    workDays: Awaited<ReturnType<WorkDayService['getCompanyWorkDaysByEmployeeIds']>>,
  ) {
    const widgets = {
      working: workDays.filter((d) => d.state === 'WORKING'),
      late: workDays.filter((d) => (d.attendance?.lateMinutes ?? 0) > 0 && d.attendance?.checkInAt),
      notCheckedIn: workDays.filter((d) => ['MISSING_CHECK_IN', 'SCHEDULED', 'ABSENT'].includes(d.state)),
      onBreak: workDays.filter((d) => d.state === 'BREAK'),
      ot: workDays.filter((d) => d.state === 'OT'),
      offDay: workDays.filter((d) => ['MONTHLY_OFF', 'HOLIDAY'].includes(d.state)),
      onLeave: workDays.filter((d) => d.state === 'LEAVE'),
      needsAction: workDays.filter((d) => d.state === 'NEEDS_RECALCULATION' || d.exceptions.length > 0),
    };
    const exceptionTypes = [
      'missing_check_in',
      'missing_check_out',
      'break_too_long',
      'needs_recalculation',
      'ot_pending',
      'monthly_off_pending',
      'leave_pending',
    ] as const;
    const exceptions = exceptionTypes.map((type) => ({
      type,
      label: type,
      count: workDays.filter((d) => d.exceptions.some((e) => e.type === type)).length,
      items: workDays
        .filter((d) => d.exceptions.some((e) => e.type === type))
        .map((d) => d.employee),
    })).filter((b) => b.count > 0);
    return { companyId, date, widgets, exceptions };
  }
}
