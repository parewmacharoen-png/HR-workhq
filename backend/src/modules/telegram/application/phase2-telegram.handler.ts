import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { AiManagerService } from '../../ai/application/ai-manager.service';
import { KnowledgeGraphService } from '../../ai/application/knowledge-graph.service';
import { CompetencyService } from '../../competency/application/competency.service';
import { SuccessionService } from '../../succession/application/succession.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import { ActorContext, SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';
import { formatMorningBriefTelegram } from './ai-morning-brief-delivery.scheduler';

/** Telegram handlers for Phase 2 HR OS features */
@Injectable()
export class Phase2TelegramHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
    private readonly audit: AuditService,
    private readonly aiManager: AiManagerService,
    private readonly graph: KnowledgeGraphService,
    private readonly competency: CompetencyService,
    private readonly succession: SuccessionService,
  ) {}

  async handleCallback(
    account: { id: string; userId: string },
    chatId: number,
    data: string,
    companyId: string | null,
    employeeId: string | null,
    isOwner: boolean,
  ): Promise<boolean> {
    if (!companyId || !employeeId) return false;

    if (data === 'ai:manager:menu') {
      await this.gateway.sendMessage({
        chatId,
        text: '🤖 <b>AI Manager</b>\nเลือกรายการ:',
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '📊 Morning Brief', callback_data: 'ai:brief:today' }],
            [{ text: '⚠️ เรื่องด่วน', callback_data: 'ai:brief:urgent' }],
            [{ text: '🔎 HR Graph Query', callback_data: 'graph:query:menu' }],
            [{ text: '🏠 เมนูหลัก', callback_data: 'home' }],
          ],
        },
      });
      return true;
    }

    if (data === 'ai:brief:today' || data === 'ai:brief:detail') {
      const actor: ActorContext = { ...SYSTEM_ACTOR, userId: account.userId, companyId };
      const brief = await this.aiManager.getTodayBrief(actor, companyId, employeeId);
      await this.audit.record(actor, {
        entityType: 'AiMorningBrief',
        entityId: brief.id,
        action: 'morning_brief_opened',
      });
      await this.gateway.sendMessage({
        chatId,
        text: brief.summaryText,
        replyMarkup: { inline_keyboard: [[{ text: '🏠 เมนูหลัก', callback_data: 'home' }]] },
      });
      return true;
    }

    if (data === 'ai:brief:urgent') {
      const text = await this.handleAiManagerMenu(employeeId, companyId, 'urgent');
      await this.gateway.sendMessage({ chatId, text });
      return true;
    }

    if (data === 'competency:my') {
      const text = await this.handleMySkills(employeeId);
      await this.gateway.sendMessage({ chatId, text });
      return true;
    }

    if (data === 'graph:query:menu') {
      await this.gateway.sendMessage({
        chatId,
        text: '🧭 <b>HR Graph Query</b>\nพิมพ์คำถาม เช่น "พนักงานที่ใกล้หมดโปร"',
        parseMode: 'HTML',
        replyMarkup: { inline_keyboard: [[{ text: '🏠 เมนูหลัก', callback_data: 'home' }]] },
      });
      return true;
    }

    if (data === 'succession:overview' && isOwner) {
      const actor: ActorContext = { ...SYSTEM_ACTOR, userId: account.userId, companyId };
      const plans = await this.succession.listPlans(actor, companyId);
      const lines = ['🧭 <b>Succession Planning</b>'];
      for (const p of plans.slice(0, 8)) {
        lines.push(`• ${(p as { criticalRole?: { title?: string } }).criticalRole?.title ?? 'Role'} — ${(p as { status?: string }).status ?? ''}`);
      }
      if (plans.length === 0) lines.push('ยังไม่มีแผน');
      await this.gateway.sendMessage({ chatId, text: lines.join('\n'), parseMode: 'HTML' });
      return true;
    }

    return false;
  }

  async handleTextQuery(
    account: { userId: string },
    chatId: number,
    query: string,
    companyId: string,
    isOwner: boolean,
  ): Promise<boolean> {
    if (!query.trim()) return false;
    const text = await this.handleGraphQuery('', companyId, query, isOwner);
    await this.gateway.sendMessage({ chatId, text });
    return true;
  }

  async handleAiManagerMenu(employeeId: string, companyId: string, action: string): Promise<string> {
    const actor: ActorContext = { ...SYSTEM_ACTOR, companyId };
    if (action === 'brief') {
      const brief = await this.aiManager.getTodayBrief(actor, companyId, employeeId);
      return brief.summaryText;
    }
    if (action === 'urgent') {
      const dash = await this.aiManager.dashboard(actor, companyId);
      const critical = (dash.criticalRisks as Array<{ title: string; summary: string }>) ?? [];
      if (!critical.length) return 'ไม่มีรายการเร่งด่วน';
      return critical.map((c) => `⚠️ ${c.title}\n${c.summary}`).join('\n\n');
    }
    return '🤖 AI Manager\n/brief — สรุปเช้า\n/urgent — รายการเร่งด่วน';
  }

  async handleGraphQuery(_employeeId: string, companyId: string, query: string, isOwner: boolean): Promise<string> {
    const actor: ActorContext = { ...SYSTEM_ACTOR, companyId };
    const result = await this.graph.query(actor, companyId, query);
    if (!result.rows.length) return 'ไม่พบข้อมูลที่ตรงกับคำถาม';
    return result.rows.slice(0, 10).map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' | ')).join('\n');
  }

  async handleMySkills(employeeId: string): Promise<string> {
    const actor: ActorContext = SYSTEM_ACTOR;
    const matrix = await this.competency.employeeMatrix(actor, employeeId);
    const lines = ['🎯 ทักษะของฉัน'];
    for (const s of matrix.skills) {
      const c = s.competency as { name: string };
      lines.push(`• ${c.name}: ระดับ ${s.currentLevel}${s.targetLevel ? ` (เป้า ${s.targetLevel})` : ''}`);
    }
    for (const g of matrix.gaps.filter((x) => x.gap > 0)) {
      lines.push(`⚠️ Gap: ${g.competencyName} (ต้องการ ${g.requiredLevel}, ปัจจุบัน ${g.currentLevel})`);
      if (g.suggestedTraining) lines.push(`   💡 ${g.suggestedTraining}`);
    }
    if (matrix.skills.length === 0) lines.push('ยังไม่มีข้อมูลทักษะ');
    return lines.join('\n');
  }

  formatBriefForTelegram(companyName: string, dateLabel: string, sections: Record<string, number>): string {
    return formatMorningBriefTelegram(companyName, dateLabel, sections);
  }
}
