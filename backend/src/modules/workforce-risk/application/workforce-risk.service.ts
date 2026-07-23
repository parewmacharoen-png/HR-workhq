// ============================================================================
// modules/workforce-risk/application/workforce-risk.service.ts
// Uses WorkDayService as source of truth for availability.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';
import { WorkDayService } from '../../workday/application/workday.service';
import { WorkDayScopeService } from '../../workday/application/workday-scope.service';
import { WorkDayDto } from '../../workday/domain/workday-state.types';
import {
  isEmergencyLeaveType,
  isSickLeaveType,
} from '../../leave/domain/services/leave-type-classification';
import {
  buildRecommendations,
  resolveRiskLevel,
  worstRiskLevel,
} from '../domain/workforce-risk.resolver';
import {
  CompanyWorkforceRiskDto,
  UNAVAILABLE_WORKDAY_STATES,
  WorkforceRiskForecastDto,
  WorkforceRiskResult,
} from '../domain/workforce-risk.types';
import { WorkforceStaffingRuleService } from './workforce-staffing-rule.service';

interface TeamBucket {
  teamId: string | null;
  teamName: string | null;
  employeeIds: string[];
}

@Injectable()
export class WorkforceRiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: BangkokTimeProvider,
    private readonly workdays: WorkDayService,
    private readonly staffingRules: WorkforceStaffingRuleService,
    private readonly scope: WorkDayScopeService,
  ) {}

  async getCompanyRisk(
    actor: ActorContext,
    companyId: string,
    dateIso?: string,
  ): Promise<CompanyWorkforceRiskDto> {
    const date = dateIso ?? this.time.workDateString();
    const scopedIds = await this.scope.resolveEmployeeIds(actor, companyId);
    const teams = await this.buildTeamBuckets(companyId, scopedIds);
    const rules = await this.staffingRules.findEffectiveRules(companyId, date);
    const allEmployeeIds = teams.flatMap((t) => t.employeeIds);
    const workDayMap = await this.loadWorkDayMap(companyId, date, allEmployeeIds);

    const teamResults = teams.map((team) =>
      this.computeTeamRisk(companyId, date, team, workDayMap, rules),
    );

    const levels = teamResults.map((t) => t.level);
    const atRiskCount = teamResults.filter((t) => t.level === 'ORANGE' || t.level === 'RED').length;

    return {
      date,
      companyId,
      overallLevel: worstRiskLevel(levels),
      teams: teamResults,
      atRiskCount,
    };
  }

  async getTeamRisk(
    actor: ActorContext,
    companyId: string,
    teamId: string,
    dateIso?: string,
  ): Promise<WorkforceRiskResult> {
    const date = dateIso ?? this.time.workDateString();
    const scopedIds = await this.scope.resolveEmployeeIds(actor, companyId);
    const teams = await this.buildTeamBuckets(companyId, scopedIds);
    const team = teams.find((t) => t.teamId === teamId);
    const bucket = team ?? { teamId, teamName: null, employeeIds: [] };
    const rules = await this.staffingRules.findEffectiveRules(companyId, date, teamId);
    const workDayMap = await this.loadWorkDayMap(companyId, date, bucket.employeeIds);
    return this.computeTeamRisk(companyId, date, bucket, workDayMap, rules);
  }

  async getRiskForecast(
    actor: ActorContext,
    companyId: string,
    startDate: string,
    days = 7,
  ): Promise<WorkforceRiskForecastDto> {
    const items: WorkforceRiskForecastDto['items'] = [];
    const start = this.time.parseWorkDate(startDate);
    for (let i = 0; i < days; i += 1) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const dateIso = d.toISOString().slice(0, 10);
      const dayRisk = await this.getCompanyRisk(actor, companyId, dateIso);
      items.push({
        date: dateIso,
        overallLevel: dayRisk.overallLevel,
        atRiskCount: dayRisk.atRiskCount,
        teams: dayRisk.teams.filter((t) => t.level === 'ORANGE' || t.level === 'RED'),
      });
    }
    return { companyId, startDate, days, items };
  }

  private computeTeamRisk(
    companyId: string,
    date: string,
    team: TeamBucket,
    workDayMap: Map<string, WorkDayDto>,
    rules: Awaited<ReturnType<WorkforceStaffingRuleService['findEffectiveRules']>>,
  ): WorkforceRiskResult {
    const memberCount = team.employeeIds.length;
    const { minimumRequired, targetRequired } = this.staffingRules.resolveRuleForTeam(
      rules,
      team.teamId,
      memberCount,
    );

    let unavailableCount = 0;
    const reasons: string[] = [];

    for (const employeeId of team.employeeIds) {
      const day = workDayMap.get(employeeId);
      if (!day) continue;
      if (UNAVAILABLE_WORKDAY_STATES.has(day.state)) {
        unavailableCount += 1;
        reasons.push(...this.unavailabilityReasons(day));
      } else if (day.leave?.status === 'pending') {
        reasons.push(`${day.employee.firstName}: คำขอลารออนุมัติ`);
      }
    }

    const availableCount = memberCount - unavailableCount;
    const { level, shortage } = resolveRiskLevel(availableCount, minimumRequired);
    const recommendations = buildRecommendations(shortage, reasons);

    return {
      date,
      companyId,
      teamId: team.teamId,
      teamName: team.teamName,
      requiredMinimum: minimumRequired,
      targetStaffing: targetRequired,
      availableCount,
      unavailableCount,
      shortage,
      level,
      reasons: [...new Set(reasons)],
      recommendations,
    };
  }

  private unavailabilityReasons(day: WorkDayDto): string[] {
    const name = `${day.employee.firstName} ${day.employee.lastName}`;
    if (day.state === 'MONTHLY_OFF') {
      return [`${name}: วันหยุดประจำเดือน`];
    }
    if (day.state === 'HOLIDAY') {
      return [`${name}: วันหยุด`];
    }
    if (day.state === 'ABSENT') {
      return [`${name}: ขาดงาน`];
    }
    if (day.state === 'LEAVE') {
      const code = day.leave?.leaveTypeCode ?? '';
      if (isSickLeaveType(code)) {
        return [`${name}: ลาป่วยวันนี้`];
      }
      if (isEmergencyLeaveType(code)) {
        return [`${name}: ลาฉุกเฉินวันนี้`];
      }
      return [`${name}: ลา (${day.leave?.leaveTypeName ?? code})`];
    }
    return [`${name}: ไม่พร้อมทำงาน (${day.state})`];
  }

  private async loadWorkDayMap(
    companyId: string,
    dateIso: string,
    employeeIds: string[],
  ): Promise<Map<string, WorkDayDto>> {
    const workDays = await this.workdays.getCompanyWorkDaysByEmployeeIds(
      companyId,
      dateIso,
      employeeIds,
    );
    return new Map(workDays.map((d) => [d.employee.id, d]));
  }

  private async buildTeamBuckets(companyId: string, scopedEmployeeIds: string[]): Promise<TeamBucket[]> {
    if (!scopedEmployeeIds.length) return [];
    const assignments = await this.prisma.employeeAssignment.findMany({
      where: {
        companyId,
        employeeId: { in: scopedEmployeeIds },
        effectiveTo: null,
        deletedAt: null,
        employee: {
          deletedAt: null,
          employmentStatus: { in: ['active', 'probation'] },
        },
      },
      select: {
        employeeId: true,
        teamId: true,
        team: { select: { id: true, name: true } },
      },
    });

    const byTeam = new Map<string | null, TeamBucket>();
    for (const row of assignments) {
      const key = row.teamId;
      if (!byTeam.has(key)) {
        byTeam.set(key, {
          teamId: row.teamId,
          teamName: row.team?.name ?? (row.teamId ? 'ทีม' : 'ไม่ระบุทีม'),
          employeeIds: [],
        });
      }
      byTeam.get(key)!.employeeIds.push(row.employeeId);
    }
    return [...byTeam.values()];
  }
}
