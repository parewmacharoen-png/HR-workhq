// ============================================================================
// modules/settings/application/settings.service.ts
// HR Settings Engine — generic key/value config with versioning and audit.
// ============================================================================

import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { Prisma, SettingCategory } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  ATTENDANCE_RULES_SETTING_KEY,
  mergeAttendanceRules,
  validateAttendanceRules,
} from '../domain/attendance-settings.types';
import {
  LEAVE_RULES_SETTING_KEY,
  mergeLeaveRules,
  validateLeaveRules,
} from '../domain/leave-settings.types';
import {
  DEPOSIT_RULES_SETTING_KEY,
  mergeDepositRules,
  validateDepositRules,
} from '../domain/deposit-settings.types';
import {
  REFERRAL_RULES_SETTING_KEY,
  mergeReferralRules,
  validateReferralRules,
} from '../domain/referral-settings.types';
import {
  PAYROLL_RULES_SETTING_KEY,
  mergePayrollRules,
  validatePayrollRules,
} from '../domain/payroll-settings.types';
import {
  resolveEffectiveSettingValue,
  SettingAuditResponse,
  SettingProfileResponse,
  SettingVersionResponse,
  SETTING_CATEGORIES,
} from '../domain/settings.types';
import { AttendanceSettingsCacheService } from './attendance-settings-cache.service';
import { DepositSettingsCacheService } from './deposit-settings-cache.service';
import { LeaveSettingsCacheService } from './leave-settings-cache.service';
import { ReferralSettingsCacheService } from './referral-settings-cache.service';
import { PayrollSettingsCacheService } from './payroll-settings-cache.service';

export interface ListSettingsQuery {
  companyId?: string | null;
  category?: SettingCategory;
}

export interface HistoryQuery {
  companyId?: string | null;
  category?: SettingCategory;
  key?: string;
  limit?: number;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly attendanceSettingsCache: AttendanceSettingsCacheService,
    private readonly leaveSettingsCache: LeaveSettingsCacheService,
    private readonly referralSettingsCache: ReferralSettingsCacheService,
    private readonly depositSettingsCache: DepositSettingsCacheService,
    private readonly payrollSettingsCache: PayrollSettingsCacheService,
  ) {}

  async listSettings(query: ListSettingsQuery): Promise<SettingProfileResponse[]> {
    const where: Prisma.SettingProfileWhereInput = { isActive: true };
    if (query.category) where.category = query.category;
    if (query.companyId === undefined) {
      // no company filter — return all accessible scopes caller requested via query
    } else if (query.companyId === null || query.companyId === '') {
      where.companyId = null;
    } else {
      where.companyId = query.companyId;
    }

    const rows = await this.prisma.settingProfile.findMany({
      where,
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
    return rows.map((row) => this.toProfileResponse(row));
  }

  async listByCategory(
    category: SettingCategory,
    companyId?: string | null,
  ): Promise<SettingProfileResponse[]> {
    return this.listSettings({ category, companyId });
  }

  async getValue(
    category: SettingCategory,
    key: string,
    companyId?: string | null,
  ): Promise<SettingProfileResponse | null> {
    const profile = await this.findProfile(companyId ?? null, category, key);
    return profile ? this.toProfileResponse(profile) : null;
  }

  async getCompanySetting(
    companyId: string,
    category: SettingCategory,
    key: string,
  ): Promise<SettingProfileResponse | null> {
    const profile = await this.findProfile(companyId, category, key);
    return profile ? this.toProfileResponse(profile) : null;
  }

  async getSystemSetting(
    category: SettingCategory,
    key: string,
  ): Promise<SettingProfileResponse | null> {
    const profile = await this.findProfile(null, category, key);
    return profile ? this.toProfileResponse(profile) : null;
  }

  async getEffectiveValue(
    companyId: string | null,
    category: SettingCategory,
    key: string,
  ): Promise<{ value: unknown | null; source: 'company' | 'system' | null }> {
    const companyProfile = companyId
      ? await this.findProfile(companyId, category, key)
      : null;
    const systemProfile = await this.findProfile(null, category, key);

    const companyValue = companyProfile?.value ?? null;
    const systemValue = systemProfile?.value ?? null;
    const resolved = resolveEffectiveSettingValue(companyValue, systemValue);

    let source: 'company' | 'system' | null = null;
    if (resolved === null) source = null;
    else if (companyValue !== null && companyValue !== undefined) source = 'company';
    else if (systemValue !== null && systemValue !== undefined) source = 'system';

    return { value: resolved, source };
  }

  async setValue(
    actor: ActorContext,
    category: SettingCategory,
    key: string,
    value: unknown,
    opts: { companyId?: string | null; reason?: string },
  ): Promise<SettingProfileResponse> {
    const companyId = opts.companyId ?? null;
    await this.assertScopeAccess(actor, companyId);
    this.validateKey(key);
    this.validateValue(value, category, key);

    const existing = await this.findProfile(companyId, category, key);
    const previousValue = existing?.value ?? null;

    const profile = existing
      ? await this.prisma.settingProfile.update({
          where: { id: existing.id },
          data: {
            value: value as Prisma.InputJsonValue,
            isActive: true,
            updatedAt: new Date(),
          },
        })
      : await this.prisma.settingProfile.create({
          data: {
            companyId,
            category,
            key,
            value: value as Prisma.InputJsonValue,
            isActive: true,
          },
        });

    await this.prisma.settingVersion.create({
      data: {
        settingProfileId: profile.id,
        previousValue: previousValue === null ? undefined : (previousValue as Prisma.InputJsonValue),
        newValue: value as Prisma.InputJsonValue,
        changedBy: actor.userId,
      },
    });

    await this.prisma.settingAudit.create({
      data: {
        profileId: profile.id,
        companyId,
        category,
        actorId: actor.userId,
        action: existing ? 'update' : 'create',
        key,
        oldValue: previousValue === null ? undefined : (previousValue as Prisma.InputJsonValue),
        newValue: value as Prisma.InputJsonValue,
      },
    });

    if (category === 'attendance') {
      this.attendanceSettingsCache.invalidate(companyId);
    }
    if (category === 'leave') {
      this.leaveSettingsCache.invalidate(companyId);
    }
    if (category === 'referral') {
      this.referralSettingsCache.invalidate(companyId);
    }
    if (category === 'deposit') {
      this.depositSettingsCache.invalidate(companyId);
    }
    if (category === 'payroll') {
      this.payrollSettingsCache.invalidate(companyId);
    }

    return this.toProfileResponse(profile);
  }

  async versionHistory(query: HistoryQuery): Promise<SettingVersionResponse[]> {
    const profileWhere: Prisma.SettingProfileWhereInput = {};
    if (query.category) profileWhere.category = query.category;
    if (query.key) profileWhere.key = query.key;
    if (query.companyId === null || query.companyId === '') {
      profileWhere.companyId = null;
    } else if (query.companyId) {
      profileWhere.companyId = query.companyId;
    }

    const profiles = await this.prisma.settingProfile.findMany({
      where: profileWhere,
      select: { id: true },
    });
    if (!profiles.length) return [];

    const rows = await this.prisma.settingVersion.findMany({
      where: { settingProfileId: { in: profiles.map((p) => p.id) } },
      orderBy: { changedAt: 'desc' },
      take: query.limit ?? 50,
    });

    return rows.map((row) => ({
      id: row.id,
      settingProfileId: row.settingProfileId,
      previousValue: row.previousValue,
      newValue: row.newValue,
      changedBy: row.changedBy,
      changedAt: row.changedAt.toISOString(),
    }));
  }

  async auditHistory(query: HistoryQuery): Promise<SettingAuditResponse[]> {
    const where: Prisma.SettingAuditWhereInput = {};
    if (query.category) where.category = query.category;
    if (query.key) where.key = query.key;
    if (query.companyId === null || query.companyId === '') {
      where.companyId = null;
    } else if (query.companyId) {
      where.companyId = query.companyId;
    }

    const rows = await this.prisma.settingAudit.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: query.limit ?? 50,
    });

    return rows.map((row) => ({
      id: row.id,
      profileId: row.profileId,
      companyId: row.companyId,
      category: row.category,
      actorId: row.actorId,
      action: row.action,
      key: row.key,
      oldValue: row.oldValue,
      newValue: row.newValue,
      timestamp: row.timestamp.toISOString(),
    }));
  }

  getCategories(): SettingCategory[] {
    return [...SETTING_CATEGORIES];
  }

  private async findProfile(
    companyId: string | null,
    category: SettingCategory,
    key: string,
  ) {
    if (companyId) {
      return this.prisma.settingProfile.findFirst({
        where: { companyId, category, key, isActive: true },
      });
    }
    return this.prisma.settingProfile.findFirst({
      where: { companyId: null, category, key, isActive: true },
    });
  }

  private async assertScopeAccess(actor: ActorContext, companyId: string | null): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
  }

  private validateKey(key: string): void {
    if (!key?.trim() || key.length > 120) {
      throw new BadRequestException('Setting key must be 1–120 characters');
    }
  }

  private validateValue(
    value: unknown,
    category?: SettingCategory,
    key?: string,
  ): void {
    if (value === undefined) {
      throw new BadRequestException('Setting value is required');
    }
    if (category === 'attendance' && key === ATTENDANCE_RULES_SETTING_KEY) {
      const errors = validateAttendanceRules(mergeAttendanceRules(value));
      if (errors.length) {
        throw new BadRequestException(errors.join('; '));
      }
    }
    if (category === 'leave' && key === LEAVE_RULES_SETTING_KEY) {
      const errors = validateLeaveRules(mergeLeaveRules(value));
      if (errors.length) {
        throw new BadRequestException(errors.join('; '));
      }
    }
    if (category === 'referral' && key === REFERRAL_RULES_SETTING_KEY) {
      const errors = validateReferralRules(mergeReferralRules(value));
      if (errors.length) {
        throw new BadRequestException(errors.join('; '));
      }
    }
    if (category === 'deposit' && key === DEPOSIT_RULES_SETTING_KEY) {
      const errors = validateDepositRules(mergeDepositRules(value));
      if (errors.length) {
        throw new BadRequestException(errors.join('; '));
      }
    }
    if (category === 'payroll' && key === PAYROLL_RULES_SETTING_KEY) {
      const errors = validatePayrollRules(mergePayrollRules(value));
      if (errors.length) {
        throw new BadRequestException(errors.join('; '));
      }
    }
  }

  private toProfileResponse(row: {
    id: string;
    companyId: string | null;
    category: SettingCategory;
    key: string;
    value: unknown;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): SettingProfileResponse {
    return {
      id: row.id,
      companyId: row.companyId,
      category: row.category,
      key: row.key,
      value: row.value,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
