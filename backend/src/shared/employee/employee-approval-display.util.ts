import { PrismaService } from '../prisma/prisma.service';

export interface EmployeeApprovalDisplayContext {
  companyName: string | null;
  teamName: string | null;
  position: string | null;
}

export async function loadEmployeeApprovalDisplayContext(
  prisma: PrismaService,
  employeeId: string,
  companyId?: string | null,
): Promise<EmployeeApprovalDisplayContext> {
  const [assignment, employee] = await Promise.all([
    prisma.employeeAssignment.findFirst({
      where: {
        employeeId,
        effectiveTo: null,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: [{ isPrimaryTeam: 'desc' }, { isPrimaryCompany: 'desc' }],
      include: {
        company: { select: { name: true } },
        team: { select: { name: true } },
      },
    }),
    prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { position: true },
    }),
  ]);

  return {
    companyName: assignment?.company?.name ?? null,
    teamName: assignment?.team?.name ?? null,
    position: employee?.position ?? null,
  };
}
