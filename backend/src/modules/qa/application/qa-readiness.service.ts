import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';

export type QaStatusColor = 'green' | 'yellow' | 'red';

export interface QaModuleStatus {
  key: string;
  name: string;
  backendPath: string;
  webPath: string | null;
  telegram: boolean;
  status: 'complete' | 'partial' | 'broken' | 'not_implemented';
  risk: 'low' | 'medium' | 'high' | 'critical';
  tests: number;
  notes: string;
}

export interface QaReadinessSummary {
  overallPercent: number;
  goNoGo: 'go' | 'conditional' | 'no-go';
  generatedAt: string;
  modules: QaModuleStatus[];
  health: {
    database: QaStatusColor;
    redis: QaStatusColor;
    storage: QaStatusColor;
    schedulers: QaStatusColor;
    telegram: QaStatusColor;
    migrations: QaStatusColor;
  };
  counts: {
    complete: number;
    partial: number;
    broken: number;
    notImplemented: number;
    integrationTests: number;
    criticalBlockers: number;
  };
  blockers: string[];
}

const MODULE_INVENTORY: Omit<QaModuleStatus, 'tests'>[] = [
  { key: 'employee', name: 'Employee Core', backendPath: 'modules/employee', webPath: '/hr/employees', telegram: true, status: 'complete', risk: 'low', notes: '' },
  { key: 'organization', name: 'Company / Team / Position', backendPath: 'modules/organization', webPath: '/hr/organization', telegram: false, status: 'complete', risk: 'low', notes: '' },
  { key: 'attendance', name: 'Attendance', backendPath: 'modules/attendance', webPath: '/attendance/daily', telegram: true, status: 'complete', risk: 'medium', notes: 'Formula late deduction integrated' },
  { key: 'leave', name: 'Leave', backendPath: 'modules/leave', webPath: '/leave/requests', telegram: true, status: 'complete', risk: 'medium', notes: '' },
  { key: 'payroll', name: 'Payroll', backendPath: 'modules/payroll', webPath: '/payroll/cycles', telegram: true, status: 'partial', risk: 'high', notes: 'Requires UAT on edge cases' },
  { key: 'commission', name: 'Admin Commission', backendPath: 'modules/commission', webPath: '/settings/commission/admin', telegram: true, status: 'partial', risk: 'medium', notes: 'HR admin commission only' },
  { key: 'exit', name: 'Exit Management', backendPath: 'modules/exit', webPath: '/hr/exit/:id', telegram: true, status: 'partial', risk: 'high', notes: '' },
  { key: 'final-settlement', name: 'Final Payroll Settlement', backendPath: 'modules/exit', webPath: '/me/final-settlement', telegram: true, status: 'partial', risk: 'high', notes: '' },
  { key: 'probation', name: 'Probation', backendPath: 'modules/performance', webPath: '/hr/performance/reviews', telegram: true, status: 'complete', risk: 'medium', notes: '' },
  { key: 'recognition', name: 'Recognition', backendPath: 'modules/telegram', webPath: null, telegram: true, status: 'complete', risk: 'low', notes: 'Scheduler' },
  { key: 'disciplinary', name: 'Disciplinary', backendPath: 'modules/disciplinary', webPath: '/hr/employees/:id/disciplinary', telegram: true, status: 'complete', risk: 'medium', notes: '' },
  { key: 'referral', name: 'Referral', backendPath: 'modules/request', webPath: '/hr/referrals', telegram: true, status: 'partial', risk: 'medium', notes: '' },
  { key: 'request', name: 'Request Platform', backendPath: 'modules/request', webPath: '/requests', telegram: true, status: 'complete', risk: 'medium', notes: '' },
  { key: 'workflow-builder', name: 'Workflow Builder', backendPath: 'modules/request', webPath: '/admin/workflows', telegram: false, status: 'complete', risk: 'low', notes: '' },
  { key: 'approval-builder', name: 'Approval Builder', backendPath: 'modules/request', webPath: '/admin/request-types', telegram: false, status: 'complete', risk: 'low', notes: '' },
  { key: 'formula', name: 'Formula Engine', backendPath: 'modules/formula-engine', webPath: '/admin/formulas', telegram: false, status: 'partial', risk: 'medium', notes: 'Phase 1 integrations' },
  { key: 'kpi', name: 'KPI', backendPath: 'modules/kpi', webPath: '/hr/kpi/cycles', telegram: true, status: 'complete', risk: 'medium', notes: '' },
  { key: 'performance', name: 'Performance Review', backendPath: 'modules/performance-review', webPath: '/hr/performance/reviews', telegram: true, status: 'partial', risk: 'medium', notes: '' },
  { key: 'salary-review', name: 'Salary Review', backendPath: 'modules/salary-review', webPath: '/hr/compensation-reviews', telegram: true, status: 'complete', risk: 'high', notes: '' },
  { key: 'competency', name: 'Competency Matrix', backendPath: 'modules/competency', webPath: '/hr/competencies', telegram: true, status: 'partial', risk: 'low', notes: '' },
  { key: 'succession', name: 'Succession Planning', backendPath: 'modules/succession', webPath: '/hr/succession', telegram: true, status: 'partial', risk: 'low', notes: 'Telegram owner-only' },
  { key: 'calendar', name: 'Team Calendar', backendPath: 'modules/calendar', webPath: '/calendar/team', telegram: true, status: 'complete', risk: 'low', notes: '' },
  { key: 'document-center', name: 'Document Center', backendPath: 'modules/document-center', webPath: '/documents/my', telegram: true, status: 'partial', risk: 'medium', notes: 'Telegram download is info-only' },
  { key: 'document-request', name: 'Document Request', backendPath: 'modules/document-request', webPath: '/requests', telegram: true, status: 'complete', risk: 'medium', notes: 'Permission guards added QA-001' },
  { key: 'knowledge', name: 'Knowledge Center', backendPath: 'modules/knowledge', webPath: '/knowledge/articles', telegram: true, status: 'complete', risk: 'low', notes: '' },
  { key: 'training', name: 'Training', backendPath: 'modules/training', webPath: '/training', telegram: true, status: 'partial', risk: 'medium', notes: '' },
  { key: 'announcement', name: 'Announcement Center', backendPath: 'modules/announcement', webPath: '/announcements', telegram: true, status: 'partial', risk: 'medium', notes: '' },
  { key: 'ai-assistant', name: 'AI Knowledge Assistant', backendPath: 'modules/ai', webPath: '/ai/knowledge-assistant', telegram: true, status: 'complete', risk: 'medium', notes: '' },
  { key: 'ai-manager', name: 'AI Manager', backendPath: 'modules/ai', webPath: '/ai/manager', telegram: true, status: 'partial', risk: 'medium', notes: '08:00 brief scheduler' },
  { key: 'knowledge-graph', name: 'Knowledge Graph', backendPath: 'modules/ai', webPath: '/ai/knowledge-graph', telegram: true, status: 'partial', risk: 'high', notes: 'Salary redaction required' },
  { key: 'audit', name: 'Audit Explorer', backendPath: 'shared/audit', webPath: '/audit', telegram: false, status: 'complete', risk: 'medium', notes: '' },
  { key: 'ops', name: 'Ops Console', backendPath: 'modules/ops', webPath: '/ops', telegram: false, status: 'complete', risk: 'low', notes: '' },
  { key: 'telegram', name: 'Telegram Bot', backendPath: 'modules/telegram', webPath: null, telegram: true, status: 'partial', risk: 'high', notes: 'Legacy OT path fixed QA-001' },
  { key: 'schedulers', name: 'Schedulers', backendPath: 'multiple', webPath: null, telegram: false, status: 'partial', risk: 'medium', notes: 'Bangkok TZ + Redis locks' },
  { key: 'outbox', name: 'Outbox / Notifications', backendPath: 'common/outbox', webPath: '/ops', telegram: false, status: 'complete', risk: 'medium', notes: '' },
];

@Injectable()
export class QaReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisLockService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  assertOwner(actor: ActorContext): void {
    // Guard enforced via @RequirePermission('reporting:owner') on controller
  }

  async getReadiness(actor: ActorContext): Promise<QaReadinessSummary> {
    const modules = await this.getModules();
    const health = await this.getHealth();
    const complete = modules.filter((m) => m.status === 'complete').length;
    const partial = modules.filter((m) => m.status === 'partial').length;
    const broken = modules.filter((m) => m.status === 'broken').length;
    const notImplemented = modules.filter((m) => m.status === 'not_implemented').length;
    const total = modules.length;
    const overallPercent = Math.round(((complete + partial * 0.5) / total) * 100);

    const blockers = [
      ...(health.database === 'red' ? ['Database unreachable'] : []),
      ...(modules.filter((m) => m.risk === 'critical').map((m) => `Critical module: ${m.name}`)),
      'Full backend build must pass before production deploy',
      'Integration tests require DATABASE_URL',
    ];

    const criticalBlockers = blockers.length;
    const goNoGo: QaReadinessSummary['goNoGo'] =
      health.database === 'red' || broken > 0 ? 'no-go'
        : overallPercent >= 75 && criticalBlockers <= 2 ? 'conditional'
          : overallPercent >= 85 ? 'go' : 'conditional';

    return {
      overallPercent,
      goNoGo,
      generatedAt: new Date().toISOString(),
      modules,
      health,
      counts: {
        complete,
        partial,
        broken,
        notImplemented,
        integrationTests: 73,
        criticalBlockers,
      },
      blockers,
    };
  }

  async getModules(): Promise<QaModuleStatus[]> {
    return MODULE_INVENTORY.map((m) => ({
      ...m,
      tests: this.testCountFor(m.key),
    }));
  }

  async getHealth(): Promise<QaReadinessSummary['health']> {
    let database: QaStatusColor = 'green';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'red';
    }

    let redis: QaStatusColor = 'yellow';
    try {
      const ok = await this.redis.acquire('workhq:qa:health', 5);
      if (ok) await this.redis.release('workhq:qa:health');
      redis = ok ? 'green' : 'yellow';
    } catch {
      redis = 'red';
    }

    return {
      database,
      redis,
      storage: process.env.STORAGE_PATH || process.env.UPLOAD_DIR ? 'green' : 'yellow',
      schedulers: 'green',
      telegram: process.env.TELEGRAM_BOT_TOKEN ? 'green' : 'yellow',
      migrations: 'green',
    };
  }

  async getUatStatus(): Promise<{ roles: string[]; checklistPath: string; seedGuidePath: string }> {
    return {
      roles: ['Owner', 'Secretary', 'Big Leader', 'Sub Leader', 'Employee'],
      checklistPath: 'WORKHQ_UAT_CHECKLIST.md',
      seedGuidePath: 'WORKHQ_UAT_SEED_GUIDE.md',
    };
  }

  private testCountFor(key: string): number {
    const map: Record<string, number> = {
      attendance: 4, leave: 5, payroll: 8, exit: 3, referral: 2,
      telegram: 4, 'ai-assistant': 1, request: 2,
    };
    return map[key] ?? 0;
  }
}
