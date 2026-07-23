import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AiInsightSeverity, AiInsightStatus, AiInsightType, ReminderType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';

/** AI-002 — AI Manager insight detection (advisory only, no auto-punish) */
@Injectable()
export class AiInsightDetectorService {
  private readonly logger = new Logger(AiInsightDetectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async detectForCompany(companyId: string): Promise<string[]> {
    const insightIds: string[] = [];
    insightIds.push(...await this.detectRepeatedLateness(companyId));
    insightIds.push(...await this.detectProbationOverdue(companyId));
    insightIds.push(...await this.detectMissingDocuments(companyId));
    insightIds.push(...await this.detectTrainingOverdue(companyId));
    insightIds.push(...await this.detectCriticalRolesNoBackup(companyId));
    return insightIds;
  }

  private async createInsight(data: {
    companyId: string;
    employeeId?: string;
    insightType: AiInsightType;
    severity: AiInsightSeverity;
    title: string;
    summary: string;
    evidenceJson?: Record<string, unknown>;
    recommendedAction?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
  }): Promise<string | null> {
    const existing = await this.prisma.aiInsight.findFirst({
      where: {
        companyId: data.companyId,
        employeeId: data.employeeId ?? null,
        insightType: data.insightType,
        status: { in: ['open', 'acknowledged'] },
        title: data.title,
      },
    });
    if (existing) return existing.id;

    const row = await this.prisma.aiInsight.create({
      data: {
        ...data,
        evidenceJson: data.evidenceJson as object | undefined,
      },
    });
    return row.id;
  }

  private async detectRepeatedLateness(companyId: string): Promise<string[]> {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const records = await this.prisma.attendanceRecord.groupBy({
      by: ['employeeId'],
      where: {
        companyId,
        workDate: { gte: since },
        lateMinutes: { gt: 0 },
        deletedAt: null,
      },
      _count: { _all: true },
    });
    const ids: string[] = [];
    for (const r of records) {
      const count = r._count._all;
      if (count < 3) continue;
      const id = await this.createInsight({
        companyId,
        employeeId: r.employeeId,
        insightType: 'attendance_risk',
        severity: 'medium',
        title: 'พนักงานมาสายซ้ำ',
        summary: `พนักงานมาสาย ${count} ครั้งใน 30 วันที่ผ่านมา`,
        evidenceJson: { lateCount: count, periodDays: 30 },
        recommendedAction: 'ตรวจสอบและพูดคุยกับพนักงาน — ไม่มีการลงโทษอัตโนมัติ',
      });
      if (id) ids.push(id);
    }
    return ids;
  }

  private async detectProbationOverdue(companyId: string): Promise<string[]> {
    const today = new Date();
    const employees = await this.prisma.employee.findMany({
      where: {
        employmentStatus: 'probation',
        probationEndDate: { lt: today },
        deletedAt: null,
        assignments: { some: { companyId, effectiveTo: null, deletedAt: null } },
      },
      select: { id: true, firstName: true, lastName: true, probationEndDate: true },
    });
    const ids: string[] = [];
    for (const emp of employees) {
      const review = await this.prisma.probationReview.findFirst({
        where: { employeeId: emp.id, outcome: 'pending' },
      });
      if (review) continue;
      const id = await this.createInsight({
        companyId,
        employeeId: emp.id,
        insightType: 'probation_overdue',
        severity: 'high',
        title: 'ประเมินทดลองงานเกินกำหนด',
        summary: `${emp.firstName} ${emp.lastName} ผ่านวันสิ้นสุดทดลองงานแล้วแต่ยังไม่มีการประเมิน`,
        evidenceJson: { probationEndDate: emp.probationEndDate },
        recommendedAction: 'ดำเนินการประเมินทดลองงาน',
      });
      if (id) ids.push(id);
    }
    return ids;
  }

  private async detectMissingDocuments(companyId: string): Promise<string[]> {
    const requiredTypes = ['national_id', 'bank_account', 'employment_contract'] as const;
    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { in: ['active', 'probation'] },
        assignments: { some: { companyId, effectiveTo: null, deletedAt: null } },
      },
      select: { id: true, firstName: true, lastName: true },
      take: 500,
    });
    const ids: string[] = [];
    for (const emp of employees) {
      const docs = await this.prisma.employeeDocument.findMany({
        where: { employeeId: emp.id, deletedAt: null },
        select: { docType: true },
      });
      const have = new Set(docs.map((d) => d.docType));
      const missing = requiredTypes.filter((t) => !have.has(t));
      if (!missing.length) continue;
      const id = await this.createInsight({
        companyId,
        employeeId: emp.id,
        insightType: 'document_missing',
        severity: 'medium',
        title: 'เอกสารพนักงานไม่ครบ',
        summary: `${emp.firstName} ${emp.lastName} ขาดเอกสาร: ${missing.join(', ')}`,
        evidenceJson: { missing },
        recommendedAction: 'แจ้งพนักงานให้อัปโหลดเอกสารที่ขาด',
      });
      if (id) ids.push(id);
    }
    return ids;
  }

  private async detectTrainingOverdue(companyId: string): Promise<string[]> {
    const overdue = await this.prisma.trainingAssignment.findMany({
      where: {
        status: { in: ['assigned', 'in_progress'] },
        dueDate: { lt: new Date() },
        employee: {
          assignments: { some: { companyId, effectiveTo: null, deletedAt: null } },
        },
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      take: 100,
    });
    const ids: string[] = [];
    for (const a of overdue) {
      const id = await this.createInsight({
        companyId,
        employeeId: a.employeeId,
        insightType: 'training_overdue',
        severity: 'medium',
        title: 'การอบรมเกินกำหนด',
        summary: `${a.employee.firstName} ${a.employee.lastName} ยังไม่เสร็จการอบรมที่กำหนด`,
        evidenceJson: { assignmentId: a.id, dueDate: a.dueDate },
        recommendedAction: 'ติดตามให้พนักงานเรียนให้เสร็จ',
        relatedEntityType: 'TrainingAssignment',
        relatedEntityId: a.id,
      });
      if (id) ids.push(id);
    }
    return ids;
  }

  private async detectCriticalRolesNoBackup(companyId: string): Promise<string[]> {
    const roles = await this.prisma.criticalRole.findMany({
      where: { companyId, status: 'active' },
      include: { candidates: true },
    });
    const ids: string[] = [];
    for (const role of roles) {
      const hasBackup = role.candidates.some((c) =>
        c.readiness === 'ready_now' || c.readiness === 'ready_3_months');
      if (hasBackup) continue;
      const id = await this.createInsight({
        companyId,
        insightType: 'critical_role_no_backup',
        severity: 'critical',
        title: 'ตำแหน่งสำคัญไม่มีผู้สำรอง',
        summary: `${role.name} ไม่มี successor ที่พร้อม`,
        evidenceJson: { criticalRoleId: role.id },
        recommendedAction: 'ระบุและพัฒนาผู้สำรองตำแหน่ง',
        relatedEntityType: 'CriticalRole',
        relatedEntityId: role.id,
      });
      if (id) ids.push(id);
    }
    return ids;
  }
}

@Injectable()
export class AiMorningBriefService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly detector: AiInsightDetectorService,
  ) {}

  async generateForCompany(
    companyId: string,
    recipientEmployeeId: string,
    scope: 'owner' | 'secretary' | 'big_leader' = 'owner',
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const leaveWhere = { companyId, status: 'approved' as const };
    const [offToday, offTomorrow, pendingApprovals, missingCheckIns, missingBreakReturns, missingCheckOuts,
      probationEnding, pendingProbationReviews, pendingExitCases, pendingSettlements, pendingReferralBonuses,
      attendanceAlerts] = await Promise.all([
      this.prisma.leaveRequest.count({
        where: { ...leaveWhere, startDate: { lte: tomorrow }, endDate: { gte: today } },
      }),
      this.prisma.leaveRequest.count({
        where: { ...leaveWhere, startDate: { lte: dayAfter }, endDate: { gte: tomorrow } },
      }),
      this.prisma.requestInstance.count({
        where: { companyId, status: { in: ['submitted', 'in_review'] } },
      }),
      this.prisma.attendanceRecord.count({
        where: { companyId, workDate: today, checkInAt: null, deletedAt: null },
      }),
      this.prisma.attendanceReminder.count({
        where: {
          workDate: today,
          reminderType: { in: [ReminderType.missing_break_return, ReminderType.break_return_pre_reminder, ReminderType.missing_break_return_escalated] },
          employee: { assignments: { some: { companyId, effectiveTo: null, deletedAt: null } } },
        },
      }).catch(() => 0),
      this.prisma.attendanceReminder.count({
        where: {
          workDate: today,
          reminderType: { in: ['missing_checkout', 'missing_checkout_escalated'] },
          employee: { assignments: { some: { companyId, effectiveTo: null, deletedAt: null } } },
        },
      }).catch(() => 0),
      this.prisma.employee.count({
        where: {
          probationEndDate: { gte: today, lte: new Date(today.getTime() + 14 * 86400000) },
          employmentStatus: 'probation',
          assignments: { some: { companyId, effectiveTo: null } },
        },
      }),
      this.prisma.probationReview.count({
        where: { companyId, outcome: 'pending' },
      }).catch(() => 0),
      this.prisma.employeeExitCase.count({
        where: { companyId, status: { in: ['pending_leader_review', 'pending_owner_review', 'pending_settlement'] } },
      }).catch(() => 0),
      this.prisma.finalPayrollSettlement.count({
        where: { companyId, status: { in: ['draft', 'pending_review', 'approved'] } },
      }).catch(() => 0),
      this.prisma.referralBonusPayout.count({
        where: { status: 'pending', referral: { companyId } },
      }).catch(() => 0),
      this.prisma.attendanceReminder.count({
        where: {
          workDate: today,
          employee: { assignments: { some: { companyId, effectiveTo: null, deletedAt: null } } },
        },
      }).catch(() => 0),
    ]);

    const insightIds = await this.detector.detectForCompany(companyId);
    const criticalInsights = await this.prisma.aiInsight.count({
      where: { companyId, status: 'open', severity: 'critical' },
    });

    const sections = {
      offToday,
      offTomorrow,
      pendingApprovals,
      missingCheckIns,
      missingBreakReturns,
      missingCheckOuts,
      probationEnding,
      pendingProbationReviews,
      pendingExitCases,
      pendingSettlements,
      pendingReferralBonuses,
      attendanceAlerts,
      documentsExpiring: 0,
      announcementsUnacked: 0,
      trainingOverdue: 0,
      urgentRisks: criticalInsights,
      scope,
    };

    const summaryText = [
      '📊 สรุป WorkHQ วันนี้',
      `• คนหยุดวันนี้: ${offToday} | พรุ่งนี้: ${offTomorrow}`,
      `• รออนุมัติ: ${pendingApprovals}`,
      `• แจ้งเตือนเข้างาน: ${attendanceAlerts}`,
      `• ยังไม่เช็คอิน: ${missingCheckIns}`,
      `• ใกล้สิ้นทดลองงาน: ${probationEnding}`,
      `• เรื่องด่วน: ${criticalInsights}`,
    ].join('\n');

    return this.prisma.aiMorningBrief.create({
      data: {
        companyId,
        sentToEmployeeId: recipientEmployeeId,
        summaryText,
        sectionsJson: sections,
        insightIds,
        deliveryStatus: 'pending',
      },
    });
  }

  async listHistory(companyId: string, limit = 30) {
    return this.prisma.aiMorningBrief.findMany({
      where: { companyId },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    });
  }
}

@Injectable()
export class AiManagerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly brief: AiMorningBriefService,
    private readonly detector: AiInsightDetectorService,
  ) {}

  async listInsights(actor: ActorContext, companyId: string, status?: string, severity?: string) {
    this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.prisma.aiInsight.findMany({
      where: {
        companyId,
        ...(status ? { status: status as AiInsightStatus } : {}),
        ...(severity ? { severity: severity as AiInsightSeverity } : {}),
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async getTodayBrief(actor: ActorContext, companyId: string, employeeId: string) {
    this.companyAccess.assertCompanyAccess(actor, companyId);
    const existing = await this.prisma.aiMorningBrief.findFirst({
      where: {
        companyId,
        sentToEmployeeId: employeeId,
        generatedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      orderBy: { generatedAt: 'desc' },
    });
    const brief = existing ?? await this.brief.generateForCompany(companyId, employeeId);
    await this.audit.record(actor, {
      entityType: 'AiMorningBrief',
      entityId: brief.id,
      action: 'morning_brief_opened',
    });
    return brief;
  }

  async listBriefHistory(actor: ActorContext, companyId: string) {
    this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.brief.listHistory(companyId);
  }

  async regenerateBrief(actor: ActorContext, companyId: string, employeeId: string) {
    this.companyAccess.assertCompanyAccess(actor, companyId);
    const brief = await this.brief.generateForCompany(companyId, employeeId);
    await this.audit.record(actor, {
      entityType: 'AiMorningBrief',
      entityId: brief.id,
      action: 'morning_brief_generated',
    });
    return brief;
  }

  async acknowledge(actor: ActorContext, insightId: string) {
    const insight = await this.prisma.aiInsight.findUnique({ where: { id: insightId } });
    if (!insight) throw new Error('Insight not found');
    this.companyAccess.assertCompanyAccess(actor, insight.companyId);
    const row = await this.prisma.aiInsight.update({
      where: { id: insightId },
      data: { status: 'acknowledged' },
    });
    await this.audit.record(actor, { entityType: 'AiInsight', entityId: insightId, action: 'acknowledge' });
    return row;
  }

  async dismiss(actor: ActorContext, insightId: string) {
    const insight = await this.prisma.aiInsight.findUnique({ where: { id: insightId } });
    if (!insight) throw new Error('Insight not found');
    this.companyAccess.assertCompanyAccess(actor, insight.companyId);
    const row = await this.prisma.aiInsight.update({
      where: { id: insightId },
      data: { status: 'dismissed', resolvedAt: new Date() },
    });
    await this.audit.record(actor, { entityType: 'AiInsight', entityId: insightId, action: 'dismiss' });
    return row;
  }

  async resolve(actor: ActorContext, insightId: string) {
    const insight = await this.prisma.aiInsight.findUnique({ where: { id: insightId } });
    if (!insight) throw new Error('Insight not found');
    this.companyAccess.assertCompanyAccess(actor, insight.companyId);
    const row = await this.prisma.aiInsight.update({
      where: { id: insightId },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
    await this.audit.record(actor, { entityType: 'AiInsight', entityId: insightId, action: 'resolve' });
    return row;
  }

  async refreshInsights(actor: ActorContext, companyId: string) {
    this.companyAccess.assertCompanyAccess(actor, companyId);
    const ids = await this.detector.detectForCompany(companyId);
    return { detected: ids.length, insightIds: ids };
  }

  async dashboard(actor: ActorContext, companyId: string) {
    this.companyAccess.assertCompanyAccess(actor, companyId);
    const [open, critical, overdueApprovals] = await Promise.all([
      this.prisma.aiInsight.count({ where: { companyId, status: 'open' } }),
      this.prisma.aiInsight.findMany({
        where: { companyId, status: 'open', severity: 'critical' },
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.requestInstance.count({ where: { companyId, status: { in: ['submitted', 'in_review'] } } }),
    ]);
    return { openInsights: open, criticalRisks: critical, overdueApprovals };
  }
}

/** Scheduled morning brief generation — delivery handled by AiMorningBriefDeliveryScheduler */
@Injectable()
export class AiManagerSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AiManagerSchedulerService.name);

  onModuleInit(): void {
    this.logger.log('AI Manager on-demand brief API active; scheduled delivery at 08:00 Bangkok via TelegramModule');
  }
}
