// ============================================================================
// modules/ai/application/knowledge-assistant.service.ts
// AI-001 — WorkHQ Knowledge Assistant with citations and query logging
// ============================================================================

import { Injectable, Inject } from '@nestjs/common';
import { AiChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { DateProvider } from '../../../shared/time/date.provider';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { RagRetrievalService } from '../../knowledge/application/rag-retrieval.service';
import { AiAssistantService } from './ai-assistant.service';

export interface KnowledgeSourceCitation {
  title: string;
  sourceType: string;
  excerpt: string;
  sourceId?: string;
}

export interface KnowledgeAssistantResult {
  answer: string;
  sources: KnowledgeSourceCitation[];
  confidence: number;
  deniedReason?: string | null;
  conversationId?: string;
  queryLogId: string;
}

const NO_SOURCE_MESSAGE = 'ไม่พบข้อมูลในนโยบาย — กรุณาติดต่อ HR หรือตรวจสอบประกาศล่าสุด';

@Injectable()
export class KnowledgeAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rag: RagRetrievalService,
    private readonly assistant: AiAssistantService,
    private readonly dates: DateProvider,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async ask(
    actor: ActorContext,
    question: string,
    channel: AiChannel = AiChannel.web,
    conversationId?: string | null,
  ): Promise<KnowledgeAssistantResult> {
    const trimmed = question.trim();
    const access = await this.permissions.findUserAccess(actor.userId);
    const companyId = actor.companyId ?? access?.scopes?.find((s: { companyId: string | null }) => s.companyId)?.companyId ?? null;

    if (this.isSalaryQuestion(trimmed) && !this.canViewSalary(access?.businessRole)) {
      return this.logAndReturn(actor, trimmed, channel, {
        answer: 'คุณไม่มีสิทธิ์ดูข้อมูลเงินเดือน — กรุณาติดต่อ HR',
        sources: [],
        confidence: 0,
        deniedReason: 'salary_visibility_denied',
      });
    }

    const ragChunks = companyId ? await this.rag.retrieve(companyId, trimmed) : [];
    const kbSources = companyId
      ? await this.searchKnowledgeSources(companyId, trimmed)
      : [];

    const sources: KnowledgeSourceCitation[] = [
      ...ragChunks.map((c: { metadata: { title?: string }; chunk: string; sourceId?: string }) => ({
        title: c.metadata.title ?? 'Knowledge Base',
        sourceType: 'kb_article',
        excerpt: c.chunk.slice(0, 400),
        sourceId: c.sourceId,
      })),
      ...kbSources,
    ];

    if (sources.length === 0) {
      // fall through to assistant or no-source message below
    }

    try {
      const chat = await this.assistant.chat(actor, {
        message: trimmed,
        conversationId,
        channel,
      });

      const confidence = sources.length > 0
        ? Math.min(95, 40 + sources.length * 15)
        : 25;

      const answer = sources.length === 0
        ? `${chat.reply}\n\n⚠️ ${NO_SOURCE_MESSAGE}`
        : `${chat.reply}\n\n📚 อ้างอิง: ${sources.map((s) => s.title).join(', ')}`;

      return this.logAndReturn(actor, trimmed, channel, {
        answer,
        sources,
        confidence,
        conversationId: chat.conversationId,
      });
    } catch {
      const fallback = sources.length > 0
        ? sources.map((s) => `• ${s.title}: ${s.excerpt}`).join('\n')
        : NO_SOURCE_MESSAGE;

      return this.logAndReturn(actor, trimmed, channel, {
        answer: fallback,
        sources,
        confidence: sources.length > 0 ? 55 : 10,
      });
    }
  }

  async listUnresolved(companyId: string, limit = 20) {
    return this.prisma.aiQueryLog.findMany({
      where: {
        companyId,
        OR: [
          { confidence: { lt: 30 } },
          { deniedReason: { not: null } },
          { answer: { contains: 'ไม่พบข้อมูลในนโยบาย' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private async searchKnowledgeSources(
    companyId: string,
    query: string,
  ): Promise<KnowledgeSourceCitation[]> {
    const terms = query.split(/\s+/).filter((t) => t.length > 2).slice(0, 5);
    if (!terms.length) return [];

    const rows = await this.prisma.aiKnowledgeSource.findMany({
      where: {
        status: 'published',
        OR: [{ companyId }, { companyId: null }],
        AND: terms.map((term) => ({
          OR: [
            { title: { contains: term, mode: 'insensitive' as const } },
            { content: { contains: term, mode: 'insensitive' as const } },
          ],
        })),
      },
      take: 5,
      include: { chunks: { take: 1, orderBy: { chunkIndex: 'asc' } } },
    });

    return rows.map((r: { id: string; title: string; sourceType: string; content: string; chunks: Array<{ chunkText?: string }> }) => ({
      title: r.title,
      sourceType: r.sourceType,
      excerpt: r.chunks[0]?.chunkText?.slice(0, 400) ?? r.content.slice(0, 400),
      sourceId: r.id,
    }));
  }

  private isSalaryQuestion(q: string): boolean {
    return /เงินเดือน|salary|payslip|ค่าจ้าง/i.test(q);
  }

  private canViewSalary(role?: string | null): boolean {
    return role === 'owner' || role === 'secretary' || role === 'big_leader';
  }

  private async logAndReturn(
    actor: ActorContext,
    question: string,
    channel: AiChannel,
    result: Omit<KnowledgeAssistantResult, 'queryLogId'>,
  ): Promise<KnowledgeAssistantResult> {
    const access = await this.permissions.findUserAccess(actor.userId);
    const row = await this.prisma.aiQueryLog.create({
      data: {
        actorUserId: actor.userId,
        actorEmployeeId: access?.employeeId ?? null,
        actorRole: access?.businessRole ?? null,
        companyId: actor.companyId,
        question,
        answer: result.answer,
        sourcesJson: result.sources as unknown as Prisma.InputJsonValue,
        confidence: result.confidence,
        deniedReason: result.deniedReason ?? null,
        channel,
      },
    });

    return { ...result, queryLogId: row.id };
  }
}
