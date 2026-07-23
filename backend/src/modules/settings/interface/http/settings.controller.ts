// ============================================================================
// modules/settings/interface/http/settings.controller.ts
// ============================================================================

import {
  Body, Controller, Get, Param, Put, Query, BadRequestException,
} from '@nestjs/common';
import { SettingCategory } from '@prisma/client';
import { Allow, IsOptional, IsString } from 'class-validator';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { SettingsService } from '../../application/settings.service';
import { parseSettingCategory, SETTING_CATEGORIES } from '../../domain/settings.types';

class SetSettingDto {
  @Allow()
  value!: unknown;

  @IsOptional()
  @IsString()
  companyId?: string | null;

  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  private parseCategory(raw: string): SettingCategory {
    try {
      return parseSettingCategory(raw);
    } catch {
      throw new BadRequestException(`Invalid setting category: ${raw}`);
    }
  }

  private resolveCompanyId(
    actor: ActorContext,
    queryCompanyId?: string,
    bodyCompanyId?: string | null,
  ): string | null {
    if (bodyCompanyId !== undefined) {
      return bodyCompanyId === 'system' || bodyCompanyId === '' ? null : bodyCompanyId;
    }
    if (queryCompanyId === 'system') return null;
    if (queryCompanyId) return queryCompanyId;
    return actor.companyId;
  }

  @Get()
  @RequirePermission('settings:read')
  list(
    @Query('companyId') companyId?: string,
    @Query('category') category?: string,
  ) {
    const parsedCategory = category ? this.parseCategory(category) : undefined;
    return this.settings.listSettings({
      companyId: companyId === 'system' ? null : companyId,
      category: parsedCategory,
    }).then((settings) => ({
      categories: SETTING_CATEGORIES,
      settings,
    }));
  }

  @Get('history')
  @RequirePermission('settings:read')
  history(
    @Query('companyId') companyId?: string,
    @Query('category') category?: string,
    @Query('key') key?: string,
    @Query('limit') limit?: string,
  ) {
    return this.settings.versionHistory({
      companyId: companyId === 'system' ? null : companyId,
      category: category ? this.parseCategory(category) : undefined,
      key,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('audit')
  @RequirePermission('settings:read')
  audit(
    @Query('companyId') companyId?: string,
    @Query('category') category?: string,
    @Query('key') key?: string,
    @Query('limit') limit?: string,
  ) {
    return this.settings.auditHistory({
      companyId: companyId === 'system' ? null : companyId,
      category: category ? this.parseCategory(category) : undefined,
      key,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':category')
  @RequirePermission('settings:read')
  byCategory(
    @Param('category') category: string,
    @Query('companyId') companyId?: string,
  ) {
    const parsed = this.parseCategory(category) as SettingCategory;
    return this.settings.listByCategory(
      parsed,
      companyId === 'system' ? null : companyId,
    );
  }

  @Put(':category/:key')
  @RequirePermission('settings:write')
  set(
    @CurrentActor() actor: ActorContext,
    @Param('category') category: string,
    @Param('key') key: string,
    @Query('companyId') queryCompanyId: string | undefined,
    @Body() dto: SetSettingDto,
  ) {
    const parsed = this.parseCategory(category) as SettingCategory;
    const companyId = this.resolveCompanyId(actor, queryCompanyId, dto.companyId);

    return this.settings.setValue(actor, parsed, key, dto.value, {
      companyId,
      reason: dto.reason,
    });
  }
}
