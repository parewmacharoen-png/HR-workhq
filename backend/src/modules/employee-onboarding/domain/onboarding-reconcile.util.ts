import { PrismaService } from '../../../shared/prisma/prisma.service';

/** Cancel orphan draft submissions when the employee already has a submitted/approved record. */
export async function reconcileStaleDraftSubmissions(
  prisma: PrismaService,
  companyId?: string,
): Promise<number> {
  const drafts = await prisma.employeeSelfOnboardingSubmission.findMany({
    where: {
      status: 'draft',
      ...(companyId ? { companyId } : {}),
    },
    select: { id: true, employeeId: true },
  });

  let cancelled = 0;
  for (const draft of drafts) {
    const hasFinished = await prisma.employeeSelfOnboardingSubmission.findFirst({
      where: {
        employeeId: draft.employeeId,
        id: { not: draft.id },
        status: { in: ['submitted', 'approved'] },
      },
      select: { id: true },
    });
    if (!hasFinished) continue;

    await prisma.employeeSelfOnboardingSubmission.update({
      where: { id: draft.id },
      data: { status: 'cancelled' },
    });
    cancelled += 1;
  }
  return cancelled;
}
