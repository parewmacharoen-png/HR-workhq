// ============================================================================
// modules/knowledge/application/company-policy-knowledge.unit.spec.ts
// KB retrieval and AI policy answers from seeded company policies
// ============================================================================

import { RagRetrievalService } from './rag-retrieval.service';
import { EmbeddingRepository } from '../infrastructure/persistence/embedding.repository';
import { OpenAiEmbeddingProvider } from '../infrastructure/openai-embedding.provider';
import { AppConfigService } from '../../../config/app-config.service';
import { buildSystemPromptWithKnowledge } from '../domain/rag.types';
import { COMPANY_POLICY_ARTICLES } from '../domain/content/company-policy-articles';
import { AiToolDataService } from '../../ai/application/ai-tool-data.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ReportingService } from '../../reporting/application/reporting.service';
import { CommissionExecutiveDashboardService } from '../../reporting/application/commission-executive-dashboard.service';
import { AiToolContextService } from '../../ai/application/ai-tool-context.service';

function findArticleBody(slug: string): string {
  const article = COMPANY_POLICY_ARTICLES.find((a) => a.slug === slug);
  if (!article) throw new Error(`Missing policy article: ${slug}`);
  return article.body;
}

function buildPolicyChunks() {
  return COMPANY_POLICY_ARTICLES.map((article, index) => ({
    id: `chunk-${index}`,
    chunk: article.body,
    similarity: 0.9 - index * 0.01,
    metadata: {
      articleId: `article-${index}`,
      title: article.title,
      slug: article.slug,
      category: article.category,
      tags: [...article.tags],
      chunkIndex: 0,
    },
  }));
}

describe('Company policy knowledge retrieval', () => {
  let embeddings: jest.Mocked<Pick<EmbeddingRepository, 'searchByVector' | 'searchByKeyword'>>;
  let openAi: jest.Mocked<Pick<OpenAiEmbeddingProvider, 'isConfigured' | 'embed'>>;
  let rag: RagRetrievalService;
  const policyChunks = buildPolicyChunks();

  beforeEach(() => {
    embeddings = {
      searchByVector: jest.fn().mockResolvedValue([]),
      searchByKeyword: jest.fn().mockImplementation(async (query: string) => {
        const normalized = query.toLowerCase();
        return policyChunks.filter((chunk) => {
          const haystack = `${chunk.metadata.title} ${chunk.chunk} ${chunk.metadata.slug}`.toLowerCase();
          if (normalized.includes('marketing') || normalized.includes('kpi') || normalized.includes('ramp')) {
            return chunk.metadata.slug.startsWith('marketing-commission');
          }
          if (normalized.includes('admin') || normalized.includes('pool a') || normalized.includes('ลาเกิน')) {
            return chunk.metadata.slug.startsWith('admin-commission');
          }
          if (normalized.includes('ลากิจ') || normalized.includes('handbook') || normalized.includes('คู่มือ')) {
            return chunk.metadata.slug.startsWith('handbook');
          }
          if (normalized.includes('referral') || normalized.includes('แนะนำ')) {
            return chunk.metadata.slug.startsWith('referral');
          }
          return haystack.includes(normalized.slice(0, Math.min(normalized.length, 8)));
        }).slice(0, 5);
      }),
    };
    openAi = {
      isConfigured: jest.fn().mockReturnValue(false),
      embed: jest.fn(),
    };
    rag = new RagRetrievalService(
      embeddings as unknown as EmbeddingRepository,
      openAi as unknown as OpenAiEmbeddingProvider,
      { ragTopK: 5 } as AppConfigService,
    );
  });

  it('retrieves handbook content for leave entitlement queries', async () => {
    const chunks = await rag.retrieve('co-1', 'ลากิจได้กี่วัน');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((c) => c.metadata.slug === 'handbook-leave-benefits')).toBe(true);
    expect(chunks.some((c) => c.chunk.includes('3 วัน'))).toBe(true);
  });

  it('retrieves marketing commission policy for KPI queries', async () => {
    const chunks = await rag.retrieve('co-1', 'Marketing commission KPI 24 candidates');
    expect(chunks.some((c) => c.metadata.slug === 'marketing-commission-kpi-target')).toBe(true);
    expect(chunks.some((c) => c.chunk.includes('24 candidates'))).toBe(true);
  });

  it('retrieves admin commission policy for leave penalty queries', async () => {
    const chunks = await rag.retrieve('co-1', 'Admin commission ลาเกิน penalty');
    expect(chunks.some((c) => c.metadata.slug === 'admin-commission-leave-penalties')).toBe(true);
    expect(chunks.some((c) => c.chunk.includes('4 วัน'))).toBe(true);
  });

  it('augments AI system prompt with handbook policy excerpts', async () => {
    const handbookChunk = {
      id: 'h1',
      chunk: findArticleBody('handbook-leave-benefits'),
      similarity: 0.95,
      metadata: {
        articleId: 'a-hb',
        title: 'คู่มือพนักงาน — สิทธิลาและสวัสดิการ',
        slug: 'handbook-leave-benefits',
        category: 'handbook',
        tags: ['handbook', 'hr', 'leave'],
        chunkIndex: 0,
      },
    };
    embeddings.searchByKeyword.mockResolvedValueOnce([handbookChunk]);

    const prompt = await rag.buildAugmentedSystemPrompt(
      'You are WorkHQ assistant.',
      'co-1',
      'ลากิจได้กี่วัน',
    );
    expect(prompt).toContain('Company Knowledge Base');
    expect(prompt).toContain('3 วัน');
    expect(prompt).toContain('คู่มือพนักงาน — สิทธิลาและสวัสดิการ');
  });

  it('augments AI system prompt with marketing commission rules', async () => {
    const marketingChunk = {
      id: 'm1',
      chunk: findArticleBody('marketing-commission-ramp-schedule'),
      similarity: 0.95,
      metadata: {
        articleId: 'a-mkt',
        title: 'กฎคอมมิชชั่น Marketing — Ramp พนักงานใหม่ (COM-MKT-004)',
        slug: 'marketing-commission-ramp-schedule',
        category: 'commission',
        tags: ['commission', 'marketing'],
        chunkIndex: 0,
      },
    };
    embeddings.searchByKeyword.mockResolvedValueOnce([marketingChunk]);

    const prompt = await rag.buildAugmentedSystemPrompt(
      'You are WorkHQ assistant.',
      'co-1',
      'marketing ramp schedule month 2',
    );
    expect(prompt).toContain('20%');
    expect(prompt).toContain('Ramp');
  });

  it('augments AI system prompt with admin commission pool rules', async () => {
    const adminChunk = {
      id: 'a1',
      chunk: findArticleBody('admin-commission-pool-overview'),
      similarity: 0.95,
      metadata: {
        articleId: 'a-adm',
        title: 'กฎคอมมิชชั่น Admin — ภาพรวม Pool 2% (COM-ADM-001)',
        slug: 'admin-commission-pool-overview',
        category: 'commission',
        tags: ['commission', 'admin'],
        chunkIndex: 0,
      },
    };
    embeddings.searchByKeyword.mockResolvedValueOnce([adminChunk]);

    const prompt = await rag.buildAugmentedSystemPrompt(
      'You are WorkHQ assistant.',
      'co-1',
      'admin commission pool percentage',
    );
    expect(prompt).toContain('2%');
    expect(prompt).toContain('Pool A');
  });

  it('buildSystemPromptWithKnowledge cites authoritative policy guidance', () => {
    const prompt = buildSystemPromptWithKnowledge('Base prompt', [
      {
        id: 'x1',
        chunk: findArticleBody('referral-reward-amount'),
        similarity: 1,
        metadata: {
          articleId: 'ref-1',
          title: 'นโยบาย Referral — จำนวนเงินรางวัล',
          slug: 'referral-reward-amount',
          category: 'referral',
          chunkIndex: 0,
        },
      },
    ]);
    expect(prompt).toContain('2,000 บาท');
    expect(prompt).toContain('authoritative');
  });
});

describe('search_company_knowledge AI tool', () => {
  it('returns formatted handbook results for policy queries', async () => {
    const rag = {
      retrieve: jest.fn().mockResolvedValue([
        {
          id: 'c1',
          chunk: findArticleBody('handbook-leave-benefits'),
          similarity: 0.88,
          metadata: {
            articleId: 'a1',
            title: 'คู่มือพนักงาน — สิทธิลาและสวัสดิการ',
            slug: 'handbook-leave-benefits',
            category: 'handbook',
            chunkIndex: 0,
          },
        },
      ]),
      formatChunksForTool: jest.fn((chunks) => ({
        count: chunks.length,
        results: chunks.map((chunk: { metadata: { title: string; category: string | null; slug: string }; chunk: string; similarity: number }) => ({
          title: chunk.metadata.title,
          category: chunk.metadata.category ?? null,
          slug: chunk.metadata.slug,
          excerpt: chunk.chunk,
          similarity: chunk.similarity,
        })),
      })),
    };

    const service = new AiToolDataService(
      {} as PrismaService,
      {} as ReportingService,
      {} as CommissionExecutiveDashboardService,
      {} as AiToolContextService,
      rag as unknown as RagRetrievalService,
      {} as import('../../ai/application/employee-self-service-query.service').EmployeeSelfServiceQueryService,
      {} as import('../../marketing/application/marketing-kpi-query.service').MarketingKpiQueryService,
      {} as import('../../marketing/application/marketing-backoffice.service').MarketingBackOfficeService,
      {} as import('../../marketing/application/marketing-expense.service').MarketingExpenseService,
      {} as import('../../marketing/application/marketing-insight.service').MarketingInsightService,
      {} as import('../../commission/application/commission-finalization.service').CommissionFinalizationService,
      {} as import('../../commission/application/commission-adjustment.service').CommissionAdjustmentService,
      {} as import('../../reporting/application/executive-insight.service').ExecutiveInsightService,
    );

    const result = await service.fetch(
      'search_company_knowledge',
      { employeeId: 'e1', companyId: 'co-1' },
      { query: 'ลากิจได้กี่วัน' },
    ) as { count: number; results: Array<{ slug: string; excerpt: string }> };

    expect(rag.retrieve).toHaveBeenCalledWith('co-1', 'ลากิจได้กี่วัน');
    expect(result.count).toBe(1);
    expect(result.results[0]?.slug).toBe('handbook-leave-benefits');
    expect(result.results[0]?.excerpt).toContain('3 วัน');
  });
});
