// ============================================================================
// Cancels request-instance shells and pending workflows linked to a domain entity.
// Does not re-revert domain data — callers must already have applied domain changes.
// ============================================================================

import { PrismaService } from '../prisma/prisma.service';

export async function cancelLinkedApprovals(
  prisma: PrismaService,
  input: {
    entityType: 'LeaveRequest' | 'MonthlyOffRequest';
    workflowEntityType: 'leave' | 'monthly_off';
    entityId: string;
    actorUserId: string;
    reason: string;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  const instanceIds = new Set<string>();

  const byIntegration = await prisma.requestInstance.findMany({
    where: {
      deletedAt: null,
      integrationEntityType: input.entityType,
      integrationEntityId: input.entityId,
      status: { notIn: ['cancelled', 'rejected'] },
    },
    select: { id: true },
  });
  for (const row of byIntegration) instanceIds.add(row.id);

  const stagedEvents = await prisma.requestTimelineEvent.findMany({
    where: {
      eventType: 'integration_action_executed',
      payloadJson: {
        path: ['stagedEntityId'],
        equals: input.entityId,
      },
    },
    select: { requestInstanceId: true },
  });
  for (const row of stagedEvents) instanceIds.add(row.requestInstanceId);

  for (const requestInstanceId of instanceIds) {
    await prisma.requestInstance.updateMany({
      where: {
        id: requestInstanceId,
        status: { notIn: ['cancelled', 'rejected'] },
      },
      data: {
        status: 'cancelled',
        cancelledAt: now,
        cancelledReason: input.reason,
        integrationStatus: 'cancelled',
      },
    });
    await prisma.requestApprovalStepInstance.updateMany({
      where: { requestInstanceId, status: 'pending' },
      data: { status: 'cancelled' },
    });
    await prisma.requestTimelineEvent.create({
      data: {
        requestInstanceId,
        eventType: 'cancelled',
        actorUserId: input.actorUserId,
        message: input.reason,
        payloadJson: {
          action: 'admin_history_cascade',
          entityType: input.entityType,
          entityId: input.entityId,
        },
      },
    });
  }

  await prisma.workflowInstance.updateMany({
    where: {
      entityType: input.workflowEntityType,
      entityId: input.entityId,
      status: 'pending',
      deletedAt: null,
    },
    data: {
      status: 'cancelled',
      updatedBy: input.actorUserId,
    },
  });
}

export async function syncLeaveRequestFormValues(
  prisma: PrismaService,
  input: {
    leaveRequestId: string;
    startDate?: string;
    endDate?: string;
    days?: number;
    reason?: string | null;
    leaveTypeCode?: string;
  },
): Promise<void> {
  const instances = await prisma.requestInstance.findMany({
    where: {
      deletedAt: null,
      OR: [
        {
          integrationEntityType: 'LeaveRequest',
          integrationEntityId: input.leaveRequestId,
        },
      ],
    },
    select: { id: true },
  });

  const stagedEvents = await prisma.requestTimelineEvent.findMany({
    where: {
      eventType: 'integration_action_executed',
      payloadJson: {
        path: ['stagedEntityId'],
        equals: input.leaveRequestId,
      },
    },
    select: { requestInstanceId: true },
  });

  const instanceIds = [
    ...new Set([
      ...instances.map((row) => row.id),
      ...stagedEvents.map((row) => row.requestInstanceId),
    ]),
  ];
  if (!instanceIds.length) return;

  const updates: Array<{ fieldKey: string; value: string }> = [];
  if (input.startDate) updates.push({ fieldKey: 'startDate', value: input.startDate });
  if (input.endDate) updates.push({ fieldKey: 'endDate', value: input.endDate });
  if (input.days != null) updates.push({ fieldKey: 'days', value: String(input.days) });
  if (input.reason !== undefined) updates.push({ fieldKey: 'reason', value: input.reason ?? '' });
  if (input.leaveTypeCode) updates.push({ fieldKey: 'leaveType', value: input.leaveTypeCode });
  if (!updates.length) return;

  for (const requestInstanceId of instanceIds) {
    for (const field of updates) {
      await prisma.requestValue.updateMany({
        where: { requestInstanceId, fieldKey: field.fieldKey },
        data: { valueText: field.value, valueJson: field.value as unknown as object },
      });
    }
  }
}
