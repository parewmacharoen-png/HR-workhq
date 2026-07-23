// ============================================================================
// test/helpers/outbox.ts — extended drain for TEST-001b
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { LeaveService } from '../../src/modules/leave/application/leave.service';
import { AttendanceService } from '../../src/modules/attendance/application/attendance.service';
import { CommissionAdjustmentService } from '../../src/modules/commission/application/commission-adjustment.service';
import { DocumentRequestService } from '../../src/modules/document-request/application/document-request.service';

interface WorkflowResolvedPayload {
  entityType: string;
  entityId: string;
  status: 'approved' | 'rejected' | 'cancelled';
}

export async function drainOutbox(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const leave = app.get(LeaveService);
  const attendance = app.get(AttendanceService);
  const commissionAdjustments = app.get(CommissionAdjustmentService);
  let documentRequests: DocumentRequestService | undefined;
  try {
    documentRequests = app.get(DocumentRequestService);
  } catch {
    documentRequests = undefined;
  }

  const events = await prisma.outboxEvent.findMany({
    where: { processedAt: null },
    orderBy: { occurredAt: 'asc' },
  });

  for (const event of events) {
    if (event.eventType.startsWith('workflow.')) {
      const payload = event.payload as unknown as WorkflowResolvedPayload;
      const status = payload.status;
      if (payload.entityType === 'leave') {
        await leave.onWorkflowResolved(payload.entityId, status);
      } else if (payload.entityType === 'leave_reschedule') {
        await leave.onRescheduleWorkflowResolved(payload.entityId, status);
      } else if (payload.entityType === 'leave_shift_swap') {
        await leave.onShiftSwapWorkflowResolved(payload.entityId, status);
      } else if (payload.entityType === 'overtime') {
        await attendance.onOvertimeWorkflowResolved(payload.entityId, status);
      } else if (payload.entityType === 'attendance_correction') {
        await attendance.onCorrectionWorkflowResolved(payload.entityId, status);
      } else if (payload.entityType === 'commission_adjustment') {
        await commissionAdjustments.onWorkflowResolved(payload.entityId, status);
      } else if (payload.entityType === 'document_request' && documentRequests) {
        await documentRequests.onWorkflowResolved(payload.entityId, status);
      }
    }

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), attempts: event.attempts + 1 },
    });
  }
}
