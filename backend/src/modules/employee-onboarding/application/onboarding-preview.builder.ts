// Build HR-readable onboarding preview from request values + related records

import { PrismaService } from '../../../shared/prisma/prisma.service';
import { InvitationEmploymentPreset } from '../domain/self-onboarding.types';
import { isOnboardingRequestTypeKey } from '../domain/employee-onboarding.constants';
import { resolvePresetOrgContext } from '../domain/employment-preset.util';

export interface OnboardingRequestPreview {
  fullName: string | null;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  departmentName: string | null;
  teamName: string | null;
  businessRole: string | null;
  position: string | null;
  employmentType: string | null;
  startDate: string | null;
  telegramUserId: string | null;
  telegramUsername: string | null;
  submittedAt: string | null;
}

export async function buildOnboardingRequestPreview(
  prisma: PrismaService,
  typeKey: string,
  values: Record<string, unknown>,
  companyId: string,
): Promise<OnboardingRequestPreview | null> {
  if (!isOnboardingRequestTypeKey(typeKey)) return null;

  const employeeId = parseStr(values.employeeId);
  const submissionId = parseStr(values.selfOnboardingSubmissionId);
  const invitationId = parseStr(values.invitationId);
  const telegramUserId = parseStr(values.telegramUserId);

  const [submission, invite, employee, company, identity] = await Promise.all([
    submissionId
      ? prisma.employeeSelfOnboardingSubmission.findUnique({ where: { id: submissionId } })
      : employeeId
        ? prisma.employeeSelfOnboardingSubmission.findFirst({
          where: { employeeId, status: { in: ['submitted', 'approved'] } },
          orderBy: { submittedAt: 'desc' },
        })
        : null,
    invitationId
      ? prisma.employeeTelegramInvite.findUnique({ where: { id: invitationId } })
      : employeeId
        ? prisma.employeeTelegramInvite.findFirst({
          where: { employeeId },
          orderBy: { createdAt: 'desc' },
        })
        : null,
    employeeId ? prisma.employee.findUnique({ where: { id: employeeId } }) : null,
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    telegramUserId
      ? prisma.telegramIdentity.findFirst({
        where: { telegramUserId: BigInt(telegramUserId), deletedAt: null },
        orderBy: { linkedAt: 'desc' },
      })
      : null,
  ]);

  const preset = (invite?.presetJson ?? {}) as unknown as InvitationEmploymentPreset;
  const data = (submission?.submittedDataJson ?? {}) as Record<string, string | undefined>;

  let teamName: string | null = null;
  let departmentName: string | null = null;
  const teamId = preset.teamId;
  if (teamId) {
    const team = await prisma.team.findFirst({ where: { id: teamId, deletedAt: null }, select: { name: true } });
    teamName = team?.name ?? null;
  }
  const orgContext = await resolvePresetOrgContext(prisma, preset);
  departmentName = orgContext.departmentName;

  const fullName = data.fullName
    ?? (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : null)
    ?? (employee ? `${employee.firstName} ${employee.lastName}`.trim() : null);

  return {
    fullName,
    nickname: data.nickname ?? employee?.nickname ?? null,
    phone: data.phone ?? employee?.phone ?? (parseStr(values.submittedPhone) || null),
    email: data.email ?? employee?.email ?? null,
    companyName: company?.name ?? null,
    departmentName,
    teamName,
    businessRole: preset.businessRole ?? null,
    position: preset.position ?? employee?.position ?? null,
    employmentType: preset.employmentType ?? employee?.employmentType ?? null,
    startDate: preset.startDate ?? employee?.hireDate?.toISOString().slice(0, 10) ?? null,
    telegramUserId: (telegramUserId || identity?.telegramUserId?.toString()) ?? null,
    telegramUsername: identity?.telegramUsername ?? null,
    submittedAt: submission?.submittedAt?.toISOString() ?? null,
  };
}

function parseStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}
