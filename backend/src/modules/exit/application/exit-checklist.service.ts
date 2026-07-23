// ============================================================================
// modules/exit/application/exit-checklist.service.ts
// EMP-012 — granular exit checklist seeding & sync with legacy booleans.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { DEFAULT_EXIT_CHECKLIST } from '../domain/constants/exit-checklist.constants';
import { ExitChecklistItemResponse } from './dto/exit.dto';
import { ExitChecklistItemNotFoundError } from '../domain/errors/exit.errors';
import { DateProvider } from '../../../shared/time/date.provider';

@Injectable()
export class ExitChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dates: DateProvider,
  ) {}

  async seedDefaultItems(exitCaseId: string): Promise<void> {
    await this.prisma.exitChecklistItem.createMany({
      data: DEFAULT_EXIT_CHECKLIST.map((item) => ({
        exitCaseId,
        itemKey: item.itemKey,
        label: item.label,
        sortOrder: item.sortOrder,
      })),
      skipDuplicates: true,
    });
  }

  async listItems(exitCaseId: string): Promise<ExitChecklistItemResponse[]> {
    const rows = await this.prisma.exitChecklistItem.findMany({
      where: { exitCaseId },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async updateItem(
    actor: ActorContext,
    exitCaseId: string,
    itemId: string,
    completed: boolean,
  ): Promise<ExitChecklistItemResponse> {
    const row = await this.prisma.exitChecklistItem.findFirst({
      where: { id: itemId, exitCaseId },
    });
    if (!row) throw new ExitChecklistItemNotFoundError(itemId);

    const now = completed ? this.dates.now() : null;
    const updated = await this.prisma.exitChecklistItem.update({
      where: { id: itemId },
      data: {
        completed,
        completedBy: completed ? actor.userId : null,
        completedAt: now,
      },
    });

    await this.syncLegacyChecklistFlags(exitCaseId);
    return this.toResponse(updated);
  }

  async countPending(exitCaseId: string): Promise<number> {
    return this.prisma.exitChecklistItem.count({
      where: { exitCaseId, completed: false },
    });
  }

  async listPendingLabels(exitCaseId: string): Promise<string[]> {
    const rows = await this.prisma.exitChecklistItem.findMany({
      where: { exitCaseId, completed: false },
      orderBy: { sortOrder: 'asc' },
      select: { label: true },
    });
    return rows.map((r) => r.label);
  }

  async markItemCompleteByKey(
    actor: ActorContext,
    exitCaseId: string,
    itemKey: string,
  ): Promise<void> {
    const row = await this.prisma.exitChecklistItem.findFirst({
      where: { exitCaseId, itemKey },
    });
    if (!row || row.completed) return;
    await this.updateItem(actor, exitCaseId, row.id, true);
  }

  private async syncLegacyChecklistFlags(exitCaseId: string): Promise<void> {
    const items = await this.prisma.exitChecklistItem.findMany({ where: { exitCaseId } });
    const done = (key: string) => items.find((i) => i.itemKey === key)?.completed ?? false;

    await this.prisma.employeeExitCase.update({
      where: { id: exitCaseId },
      data: {
        assetsReturned: done('return_keys') && done('return_laptop') && done('return_phone'),
        accessRevoked: done('remove_telegram_permissions') && done('remove_system_access'),
        finalPayrollBuilt: done('payroll_settlement_completed'),
      },
    });
  }

  private toResponse(row: {
    id: string;
    exitCaseId: string;
    itemKey: string;
    label: string;
    sortOrder: number;
    completed: boolean;
    completedBy: string | null;
    completedAt: Date | null;
  }): ExitChecklistItemResponse {
    return {
      id: row.id,
      exitCaseId: row.exitCaseId,
      itemKey: row.itemKey,
      label: row.label,
      sortOrder: row.sortOrder,
      completed: row.completed,
      completedBy: row.completedBy,
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }
}
