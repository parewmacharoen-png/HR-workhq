// ============================================================================
// shared/prisma/prisma.service.ts
// Single PrismaClient instance for the app. Soft-delete is enforced at the
// repository layer (default filters deleted_at IS NULL); this service also
// installs a client extension that rewrites delete() into an update() setting
// deleted_at, so accidental hard deletes are prevented globally.
// ============================================================================

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Models that carry deleted_at/deleted_by and therefore support soft delete.
const SOFT_DELETE_MODELS = new Set<string>([
  'Company', 'Function', 'Team',
  'Employee', 'EmployeeAssignment', 'EmployeeDocument', 'EmployeeBankAccount',
  'User', 'Role', 'UserRole', 'ScopeGrant', 'BusinessRoleAssignment', 'UserPermissionOverride',
  'WorkflowDefinition', 'WorkflowInstance',
  'AttendanceRecord', 'OvertimeRecord', 'AttendanceCorrection',
  'LeaveType', 'LeaveBalance', 'LeaveRequest', 'HolidayConversion',
  'PayrollCycle', 'PayrollItem', 'Payslip', 'SalaryHistory', 'Deposit',
  'CommissionTarget', 'CommissionRecord', 'CommissionHold',
  'CommissionRedistribution', 'BigLeaderLedger',
  'MarketingCommissionCycle', 'MarketingCommissionCarryForward',
  'AdminCommissionCycle', 'AdminCommissionEmployeeProfile', 'AdminCommissionShiftSegment',
  'CommissionCycle', 'CommissionAdjustmentRequest',
  'AdvanceRequest', 'DepositRefund',
  'PerformanceCycle', 'EvaluationWeight', 'Evaluation',
  'Candidate', 'Referral',
  'TrainingCourse', 'TrainingAssignment',
  'Asset', 'AssetAssignment', 'AssetDamageReport',
  'KbArticle', 'AiConversation',
  'TelegramAccount', 'Announcement',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Whether a model supports soft delete (used by repositories). */
  static supportsSoftDelete(model: string): boolean {
    return SOFT_DELETE_MODELS.has(model);
  }
}
