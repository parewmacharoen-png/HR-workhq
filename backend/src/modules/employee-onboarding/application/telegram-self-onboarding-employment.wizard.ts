// Telegram button wizard — employment org declaration (department, team, position, etc.)

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import { EmployeeSelfOnboardingService } from './employee-self-onboarding.service';
import {
  type EmploymentDeclaration,
  type EmploymentWizardContext,
  type DeclaredCompanyTeam,
  TELEGRAM_DEPARTMENT_OPTIONS,
  TELEGRAM_POSITION_OPTIONS,
  activeEmploymentSteps,
  computeEmploymentStepIndex,
  isEmploymentDeclarationComplete,
  normalizeEmploymentDeclaration,
} from '../domain/self-onboarding-employment.steps';

export interface SelfOnboardingDraftWithEmployment {
  employeeId: string;
  companyId: string;
  stepIndex: number;
  data: Record<string, unknown>;
  employment?: EmploymentDeclaration;
  employmentStepIndex?: number;
  employmentCtx?: EmploymentWizardContext;
  phase?: 'personal' | 'employment';
}

@Injectable()
export class TelegramSelfOnboardingEmploymentWizard {
  constructor(
    private readonly gateway: TelegramGatewayService,
    private readonly prisma: PrismaService,
    private readonly onboarding: EmployeeSelfOnboardingService,
  ) {}

  async loadWizardContext(
    employeeId: string,
    primaryCompanyId: string,
  ): Promise<EmploymentWizardContext> {
    const [assignments, companies] = await Promise.all([
      this.prisma.employeeAssignment.findMany({
        where: { employeeId, effectiveTo: null, deletedAt: null },
        select: { companyId: true, isPrimaryCompany: true },
        orderBy: [{ isPrimaryCompany: 'desc' }, { effectiveFrom: 'asc' }],
      }),
      this.prisma.company.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
    const seen = new Set<string>();
    const seededCompanyIds: string[] = [];
    for (const row of assignments) {
      if (seen.has(row.companyId)) continue;
      seen.add(row.companyId);
      seededCompanyIds.push(row.companyId);
    }
    if (!seededCompanyIds.length && primaryCompanyId) {
      seededCompanyIds.push(primaryCompanyId);
    }

    return {
      primaryCompanyId,
      seededCompanyIds,
      companyNameById,
      availableCompanyIds: companies.map((c) => c.id),
    };
  }

  async ensureEmploymentLoaded(draft: SelfOnboardingDraftWithEmployment): Promise<void> {
    if (!draft.employmentCtx) {
      draft.employmentCtx = await this.loadWizardContext(draft.employeeId, draft.companyId);
    }
    if (draft.employment === undefined) {
      draft.employment = await this.onboarding.loadEmploymentDeclaration(draft.employeeId);
    }
    draft.employment = normalizeEmploymentDeclaration(draft.employment ?? {}, draft.employmentCtx);
    draft.employmentStepIndex = computeEmploymentStepIndex(draft.employment, draft.employmentCtx);

    if (draft.phase !== 'employment' && draft.employmentStepIndex !== undefined) {
      const complete = isEmploymentDeclarationComplete(draft.employment, draft.employmentCtx);
      if (!complete) draft.phase = 'employment';
    }
  }

  isEmploymentComplete(draft: SelfOnboardingDraftWithEmployment): boolean {
    if (!draft.employmentCtx || !draft.employment) return false;
    return isEmploymentDeclarationComplete(draft.employment, draft.employmentCtx);
  }

  validateForSubmit(draft: SelfOnboardingDraftWithEmployment): string | null {
    if (!draft.employment || !draft.employmentCtx) {
      return '👔 กรุณากรอกข้อมูลการทำงานให้ครบก่อนส่ง';
    }
    const employment = draft.employment;
    const ctx = draft.employmentCtx;
    if ((employment.declaredDepartment ?? '').toLowerCase() === 'marketing') {
      const companyIds = [
        ...ctx.seededCompanyIds,
        ...(employment.companyTeams ?? [])
          .map((row) => row.companyId)
          .filter((id) => !ctx.seededCompanyIds.includes(id)),
      ];
      const unique = [...new Set(companyIds)];
      for (const companyId of unique) {
        const row = employment.companyTeams?.find((r) => r.companyId === companyId);
        if (!row?.teamId) {
          const name = ctx.companyNameById.get(companyId) ?? companyId;
          return `❌ แผนก Marketing ต้องเลือกทีมที่ <b>${name}</b> ก่อนส่ง`;
        }
      }
    }
    return null;
  }

  async promptStep(chatId: number, draft: SelfOnboardingDraftWithEmployment): Promise<void> {
    await this.ensureEmploymentLoaded(draft);
    const employment = draft.employment ?? {};
    const ctx = draft.employmentCtx!;
    const steps = activeEmploymentSteps(employment, ctx);
    const idx = draft.employmentStepIndex ?? computeEmploymentStepIndex(employment, ctx);
    const step = steps[idx];
    if (!step) return;

    const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
    if (step.type === 'department_picker') {
      for (let i = 0; i < TELEGRAM_DEPARTMENT_OPTIONS.length; i += 2) {
        keyboard.push(
          TELEGRAM_DEPARTMENT_OPTIONS.slice(i, i + 2).map((opt) => ({
            text: opt.label,
            callback_data: `so:emp:dept:${opt.value}`,
          })),
        );
      }
    } else if (step.type === 'position_picker') {
      for (let i = 0; i < TELEGRAM_POSITION_OPTIONS.length; i += 2) {
        keyboard.push(
          TELEGRAM_POSITION_OPTIONS.slice(i, i + 2).map((opt) => ({
            text: opt.label,
            callback_data: `so:emp:pos:${opt.value}`,
          })),
        );
      }
    } else if (step.type === 'team_picker' && step.companyId) {
      const teams = await this.loadTeams(step.companyId, employment.declaredDepartment);
      const companyName = ctx.companyNameById.get(step.companyId) ?? step.companyId;
      if (!teams.length) {
        keyboard.push([{ text: '— ยังไม่มีทีมในบริษัทนี้ —', callback_data: 'so:emp:skip' }]);
      } else {
        for (const team of teams.slice(0, 12)) {
          keyboard.push([{
            text: team.name.replace(/^Team /, 'ทีม '),
            callback_data: `so:emp:team:${team.id}`,
          }]);
        }
      }
      if (step.skippable) {
        keyboard.push([{ text: 'ข้าม (ไม่ระบุทีม)', callback_data: 'so:emp:skip' }]);
      }
      step.label = `ทีมที่ ${companyName}`;
    } else if (step.type === 'company_picker') {
      const declared = new Set((employment.companyTeams ?? []).map((r) => r.companyId));
      const options = ctx.availableCompanyIds
        .filter((id) => !declared.has(id))
        .map((id) => ({ id, name: ctx.companyNameById.get(id) ?? id }));
      for (const company of options.slice(0, 12)) {
        keyboard.push([{
          text: company.name,
          callback_data: `so:emp:co:${company.id}`,
        }]);
      }
      if (!keyboard.length) {
        keyboard.push([{ text: 'ไม่มีบริษัทเพิ่ม', callback_data: 'so:emp:bool:no' }]);
      }
    } else if (step.type === 'boolean') {
      keyboard.push([
        { text: 'ใช่ มีบริษัทอื่น', callback_data: 'so:emp:bool:yes' },
        { text: 'ไม่มี / เสร็จแล้ว', callback_data: 'so:emp:bool:no' },
      ]);
    } else if (step.type === 'work_location_picker') {
      keyboard.push([
        { text: '🏢 Office', callback_data: 'so:emp:loc:office' },
        { text: '🏠 WFH', callback_data: 'so:emp:loc:wfh' },
      ]);
    } else if (step.type === 'office_type_picker') {
      keyboard.push([
        { text: 'Front Office (หน้างาน)', callback_data: 'so:emp:office:front_office' },
        { text: 'Back Office (หลังบ้าน)', callback_data: 'so:emp:office:back_office' },
      ]);
    }

    const navRow: Array<{ text: string; callback_data: string }> = [];
    if (idx > 0) navRow.push({ text: '⬅️ ย้อนกลับ', callback_data: 'so:emp:back' });
    navRow.push({ text: '❌ ยกเลิก', callback_data: 'so:cancel' });
    keyboard.push(navRow);

    const marketingNote = employment.declaredDepartment?.toLowerCase() === 'marketing'
      ? '\n<i>แผนก Marketing ต้องเลือกทีมให้ครบทุกบริษัท</i>'
      : '';

    await this.gateway.sendMessage({
      chatId,
      text: [
        '👔 <b>ข้อมูลการทำงาน</b>',
        '',
        `กรุณาเลือก <b>${step.label}</b>`,
        `<i>ขั้นที่ ${idx + 1}/${steps.length}</i>${marketingNote}`,
      ].join('\n'),
      parseMode: 'HTML',
      replyMarkup: { inline_keyboard: keyboard },
    });
  }

  async handleCallback(
    data: string,
    draft: SelfOnboardingDraftWithEmployment,
    chatId?: number,
  ): Promise<boolean> {
    if (!data.startsWith('so:emp:')) return false;
    await this.ensureEmploymentLoaded(draft);
    const ctx = draft.employmentCtx!;
    const employment = { ...(draft.employment ?? {}) };
    const steps = activeEmploymentSteps(employment, ctx);
    const idx = draft.employmentStepIndex ?? 0;
    const step = steps[idx];
    if (!step && data !== 'so:emp:back') return true;

    if (data === 'so:emp:back') {
      draft.employmentStepIndex = Math.max(0, idx - 1);
      return true;
    }

    if (data === 'so:emp:skip' && step?.type === 'team_picker' && step.companyId) {
      if ((employment.declaredDepartment ?? '').toLowerCase() === 'marketing') {
        if (chatId) {
          await this.gateway.sendMessage({
            chatId,
            text: '❌ แผนก Marketing ต้องเลือกทีม — ไม่สามารถข้ามได้',
          });
        }
        return true;
      }
      upsertCompanyTeam(employment, {
        companyId: step.companyId,
        companyName: ctx.companyNameById.get(step.companyId) ?? step.companyId,
        teamSkipped: true,
      });
      clearAddAnotherIfExtraComplete(employment, ctx);
      draft.employment = employment;
      draft.employmentStepIndex = computeEmploymentStepIndex(employment, ctx);
      await this.onboarding.saveEmploymentDeclaration(draft.employeeId, employment);
      return true;
    }

    if (data.startsWith('so:emp:dept:')) {
      employment.declaredDepartment = decodeURIComponent(data.slice('so:emp:dept:'.length));
      employment.companyTeams = [];
      delete employment.addAnotherCompany;
    } else if (data.startsWith('so:emp:pos:')) {
      employment.declaredPosition = decodeURIComponent(data.slice('so:emp:pos:'.length));
    } else if (data.startsWith('so:emp:team:') && step?.companyId) {
      const teamId = data.slice('so:emp:team:'.length);
      const teamName = await this.resolveTeamName(
        step.companyId,
        teamId,
        employment.declaredDepartment,
      );
      upsertCompanyTeam(employment, {
        companyId: step.companyId,
        companyName: ctx.companyNameById.get(step.companyId) ?? step.companyId,
        teamId,
        teamName,
        teamSkipped: false,
      });
      if (!ctx.seededCompanyIds.includes(step.companyId)) {
        delete employment.addAnotherCompany;
      }
    } else if (data.startsWith('so:emp:co:')) {
      const companyId = data.slice('so:emp:co:'.length);
      upsertCompanyTeam(employment, {
        companyId,
        companyName: ctx.companyNameById.get(companyId) ?? companyId,
      });
      employment.addAnotherCompany = 'yes';
    } else if (data.startsWith('so:emp:bool:')) {
      employment.addAnotherCompany = data.endsWith(':yes') ? 'yes' : 'no';
    } else if (data.startsWith('so:emp:loc:')) {
      employment.declaredWorkLocation = data.endsWith(':wfh') ? 'wfh' : 'office';
    } else if (data.startsWith('so:emp:office:')) {
      employment.declaredOfficeType = data.endsWith(':back_office') ? 'back_office' : 'front_office';
    } else {
      return false;
    }

    draft.employment = employment;
    draft.employmentStepIndex = computeEmploymentStepIndex(employment, ctx);
    await this.onboarding.saveEmploymentDeclaration(draft.employeeId, employment);
    return true;
  }

  formatSummaryLines(employment: EmploymentDeclaration | undefined): string[] {
    if (!employment || !Object.keys(employment).length) return [];
    const dept = employment.declaredDepartment ?? '—';
    const pos = TELEGRAM_POSITION_OPTIONS.find((p) => p.value === employment.declaredPosition)?.label
      ?? employment.declaredPosition ?? '—';
    const loc = employment.declaredWorkLocation === 'wfh'
      ? 'WFH'
      : employment.declaredWorkLocation === 'office'
        ? 'Office'
        : '—';
    const office = employment.declaredOfficeType === 'back_office'
      ? 'Back Office'
      : employment.declaredOfficeType === 'front_office'
        ? 'Front Office'
        : '—';

    const teamLines = (employment.companyTeams ?? []).map((row) => {
      const team = row.teamSkipped
        ? 'ไม่ระบุ'
        : (row.teamName?.replace(/^Team /, 'ทีม ') ?? '—');
      return `• ${row.companyName}: ${team}`;
    });

    return [
      '',
      '<b>ข้อมูลการทำงาน (ที่คุณระบุ)</b>',
      `แผนก: ${dept}`,
      `ตำแหน่ง: ${pos}`,
      ...(teamLines.length ? ['ทีมแต่ละบริษัท:', ...teamLines] : []),
      `ทำงานที่: ${loc}`,
      ...(employment.declaredDepartment?.toLowerCase() === 'admin' ? [`ค่าคอมแอดมิน: ${office}`] : []),
    ];
  }

  private async resolveTeamName(
    companyId: string,
    teamId: string,
    department?: string,
  ): Promise<string> {
    const marketing = department?.toLowerCase() === 'marketing';
    if (marketing) {
      const row = await this.prisma.marketingTeam.findFirst({
        where: { id: teamId, companyId, deletedAt: null },
        select: { name: true },
      });
      if (row) return row.name;
    }
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, companyId, deletedAt: null },
      select: { name: true },
    });
    return team?.name ?? teamId;
  }

  private async loadTeams(
    companyId: string,
    department?: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const marketing = department?.toLowerCase() === 'marketing';
    if (marketing) {
      const rows = await this.prisma.marketingTeam.findMany({
        where: { companyId, deletedAt: null, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      if (rows.length) return rows;
    }
    return this.prisma.team.findMany({
      where: { companyId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
  }
}

function upsertCompanyTeam(
  employment: EmploymentDeclaration,
  row: DeclaredCompanyTeam,
): void {
  const list = [...(employment.companyTeams ?? [])];
  const idx = list.findIndex((r) => r.companyId === row.companyId);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...row };
  } else {
    list.push(row);
  }
  employment.companyTeams = list;
}

function clearAddAnotherIfExtraComplete(
  employment: EmploymentDeclaration,
  ctx: EmploymentWizardContext,
): void {
  const extras = (employment.companyTeams ?? []).filter(
    (r) => !ctx.seededCompanyIds.includes(r.companyId),
  );
  if (extras.every((r) => r.teamId || r.teamSkipped)) {
    delete employment.addAnotherCompany;
  }
}
