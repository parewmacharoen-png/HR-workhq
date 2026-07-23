// ============================================================================
// EXPORT-003 — User export preferences
// ============================================================================

import { Injectable } from '@nestjs/common';
import { ExportFormat, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';

@Injectable()
export class UserExportPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async get(actor: ActorContext, module: string) {
    return this.prisma.userExportPreference.findUnique({
      where: { userId_module: { userId: actor.userId, module } },
    });
  }

  async save(actor: ActorContext, dto: {
    module: string;
    selectedColumns?: string[];
    filters?: Record<string, unknown>;
    lastFormat?: ExportFormat;
    lastTemplateId?: string;
  }) {
    return this.prisma.userExportPreference.upsert({
      where: { userId_module: { userId: actor.userId, module: dto.module } },
      create: {
        userId: actor.userId,
        module: dto.module,
        selectedColumnsJson: dto.selectedColumns as Prisma.InputJsonValue,
        filtersJson: dto.filters as Prisma.InputJsonValue,
        lastFormat: dto.lastFormat ?? 'google_sheets',
        lastTemplateId: dto.lastTemplateId,
      },
      update: {
        ...(dto.selectedColumns ? { selectedColumnsJson: dto.selectedColumns as Prisma.InputJsonValue } : {}),
        ...(dto.filters ? { filtersJson: dto.filters as Prisma.InputJsonValue } : {}),
        ...(dto.lastFormat ? { lastFormat: dto.lastFormat } : {}),
        ...(dto.lastTemplateId ? { lastTemplateId: dto.lastTemplateId } : {}),
      },
    });
  }
}
