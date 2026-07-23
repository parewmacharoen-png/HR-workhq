// ============================================================================
// modules/workforce-risk/application/workforce-risk.service.unit.spec.ts
// ============================================================================

import { WorkforceRiskService } from './workforce-risk.service';
import { WorkforceStaffingRuleService } from './workforce-staffing-rule.service';
import { WorkDayService } from '../../workday/application/workday.service';
import { WorkDayScopeService } from '../../workday/application/workday-scope.service';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';
import type { WorkDayDto } from '../../workday/domain/workday-state.types';

function workDay(partial: Partial<WorkDayDto> & { employeeId: string; firstName: string; state: WorkDayDto['state'] }): WorkDayDto {
  return {
    employee: {
      id: partial.employeeId,
      globalId: 'G001',
      firstName: partial.firstName,
      lastName: 'Test',
      teamName: 'Marketing',
    },
    date: '2026-06-29',
    state: partial.state,
    shift: null,
    attendance: partial.attendance ?? null,
    monthlyOff: partial.monthlyOff ?? { requestId: null, status: null },
    leave: partial.leave ?? { requestId: null, leaveTypeCode: null, leaveTypeName: null, status: null },
    overtime: partial.overtime ?? { id: null, otHours: 0, amount: 0, status: null },
    exceptions: [],
    payrollImpact: null,
    timeline: [],
  };
}

describe('WorkforceRiskService', () => {
  const actor = { userId: 'u-1', impersonatorUserId: null, companyId: 'co-1' };

  function buildService(workDays: WorkDayDto[], rules: Array<{ teamId: string | null; minimumRequired: number; targetRequired: number }> = []) {
    const prisma = {
      employeeAssignment: {
        findMany: jest.fn().mockResolvedValue([
          { employeeId: 'e1', teamId: 't1', team: { id: 't1', name: 'Marketing' } },
          { employeeId: 'e2', teamId: 't1', team: { id: 't1', name: 'Marketing' } },
          { employeeId: 'e3', teamId: 't1', team: { id: 't1', name: 'Marketing' } },
        ]),
      },
    };
    const time = {
      workDateString: () => '2026-06-29',
      parseWorkDate: (s: string) => new Date(`${s}T00:00:00.000Z`),
    } as BangkokTimeProvider;
    const workdays = {
      getCompanyWorkDaysByEmployeeIds: jest.fn().mockResolvedValue(workDays),
    } as unknown as WorkDayService;
    const staffingRules = {
      findEffectiveRules: jest.fn().mockResolvedValue(rules.map((r, i) => ({
        id: `rule-${i}`,
        companyId: 'co-1',
        teamId: r.teamId,
        roleKey: null,
        minimumRequired: r.minimumRequired,
        targetRequired: r.targetRequired,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
        reason: null,
        createdById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))),
      resolveRuleForTeam: WorkforceStaffingRuleService.prototype.resolveRuleForTeam,
    } as unknown as WorkforceStaffingRuleService;
    const scope = {
      resolveEmployeeIds: jest.fn().mockResolvedValue(['e1', 'e2', 'e3']),
    } as unknown as WorkDayScopeService;
    return new WorkforceRiskService(prisma as never, time, workdays, staffingRules, scope);
  }

  it('returns GREEN when staffing above minimum', async () => {
    const service = buildService([
      workDay({ employeeId: 'e1', firstName: 'A', state: 'WORKING' }),
      workDay({ employeeId: 'e2', firstName: 'B', state: 'WORKING' }),
      workDay({ employeeId: 'e3', firstName: 'C', state: 'WORKING' }),
    ], [{ teamId: 't1', minimumRequired: 2, targetRequired: 3 }]);
    const result = await service.getCompanyRisk(actor, 'co-1');
    expect(result.teams[0].level).toBe('GREEN');
  });

  it('returns YELLOW at exact minimum', async () => {
    const service = buildService([
      workDay({ employeeId: 'e1', firstName: 'A', state: 'WORKING' }),
      workDay({ employeeId: 'e2', firstName: 'B', state: 'LEAVE', leave: { requestId: 'l1', leaveTypeCode: 'annual', leaveTypeName: 'Annual', status: 'approved' } }),
      workDay({ employeeId: 'e3', firstName: 'C', state: 'WORKING' }),
    ], [{ teamId: 't1', minimumRequired: 2, targetRequired: 3 }]);
    const result = await service.getCompanyRisk(actor, 'co-1');
    expect(result.teams[0].level).toBe('YELLOW');
  });

  it('sick leave today increases risk with reason', async () => {
    const service = buildService([
      workDay({ employeeId: 'e1', firstName: 'A', state: 'LEAVE', leave: { requestId: 'l1', leaveTypeCode: 'sick', leaveTypeName: 'Sick', status: 'approved' } }),
      workDay({ employeeId: 'e2', firstName: 'B', state: 'WORKING' }),
      workDay({ employeeId: 'e3', firstName: 'C', state: 'WORKING' }),
    ], [{ teamId: 't1', minimumRequired: 3, targetRequired: 3 }]);
    const result = await service.getCompanyRisk(actor, 'co-1');
    expect(result.teams[0].level).toBe('ORANGE');
    expect(result.teams[0].reasons.some((r) => r.includes('ลาป่วย'))).toBe(true);
  });

  it('monthly off reduces available count', async () => {
    const service = buildService([
      workDay({ employeeId: 'e1', firstName: 'A', state: 'MONTHLY_OFF' }),
      workDay({ employeeId: 'e2', firstName: 'B', state: 'WORKING' }),
      workDay({ employeeId: 'e3', firstName: 'C', state: 'WORKING' }),
    ], [{ teamId: 't1', minimumRequired: 3, targetRequired: 3 }]);
    const result = await service.getCompanyRisk(actor, 'co-1');
    expect(result.teams[0].availableCount).toBe(2);
    expect(result.teams[0].level).toBe('ORANGE');
  });

  it('returns recommendations when shortage exists', async () => {
    const service = buildService([
      workDay({ employeeId: 'e1', firstName: 'A', state: 'LEAVE', leave: { requestId: 'l1', leaveTypeCode: 'annual', leaveTypeName: 'Annual', status: 'approved' } }),
      workDay({ employeeId: 'e2', firstName: 'B', state: 'LEAVE', leave: { requestId: 'l2', leaveTypeCode: 'annual', leaveTypeName: 'Annual', status: 'approved' } }),
      workDay({ employeeId: 'e3', firstName: 'C', state: 'WORKING' }),
    ], [{ teamId: 't1', minimumRequired: 3, targetRequired: 3 }]);
    const result = await service.getCompanyRisk(actor, 'co-1');
    expect(result.teams[0].recommendations.length).toBeGreaterThan(0);
  });

  it('forecast detects risky future day', async () => {
    const service = buildService([
      workDay({ employeeId: 'e1', firstName: 'A', state: 'MONTHLY_OFF' }),
      workDay({ employeeId: 'e2', firstName: 'B', state: 'MONTHLY_OFF' }),
      workDay({ employeeId: 'e3', firstName: 'C', state: 'WORKING' }),
    ], [{ teamId: 't1', minimumRequired: 3, targetRequired: 3 }]);
    const forecast = await service.getRiskForecast(actor, 'co-1', '2026-06-29', 3);
    expect(forecast.items[0].atRiskCount).toBeGreaterThan(0);
  });
});
