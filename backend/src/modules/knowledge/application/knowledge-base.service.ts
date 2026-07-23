// ============================================================================
// modules/knowledge/application/knowledge-base.service.ts
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import {
  KNOWLEDGE_REPOSITORY,
  KnowledgeRepository,
  KbArticleRecord,
} from '../domain/repositories/knowledge.repository';
import { KbArticleNotFoundError } from '../domain/errors/knowledge.errors';
import {
  CreateKbArticleDto,
  ListKbArticlesQuery,
  UpdateKbArticleDto,
} from './dto/knowledge.dto';
import { KbIndexingService } from './kb-indexing.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'article';
}

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @Inject(KNOWLEDGE_REPOSITORY) private readonly articles: KnowledgeRepository,
    private readonly indexing: KbIndexingService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  async create(actor: ActorContext, dto: CreateKbArticleDto): Promise<KbArticleRecord> {
    const companyId = dto.companyId ?? actor.companyId ?? null;
    if (companyId) {
      await this.companyAccess.assertCompanyAccess(actor, companyId);
    } else if (!(await this.companyAccess.hasAllScope(actor.userId))) {
      throw new Error('Only platform admins may create global knowledge articles');
    }

    return this.articles.create(
      {
        companyId,
        title: dto.title.trim(),
        slug: dto.slug?.trim() || slugify(dto.title),
        body: dto.body,
        category: dto.category ?? null,
        tags: dto.tags ?? [],
      },
      actor.userId,
    );
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateKbArticleDto,
  ): Promise<KbArticleRecord> {
    const existing = await this.requireArticle(actor, id);
    const updated = await this.articles.update(
      id,
      {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      },
      actor.userId,
    );

    if (existing.isPublished) {
      await this.indexing.indexArticle(id, actor.userId);
    }
    return updated;
  }

  async get(actor: ActorContext, id: string): Promise<KbArticleRecord> {
    return this.requireArticle(actor, id);
  }

  async list(actor: ActorContext, query: ListKbArticlesQuery): Promise<KbArticleRecord[]> {
    const companyId = query.companyId ?? actor.companyId ?? undefined;
    if (companyId) {
      await this.companyAccess.assertCompanyAccess(actor, companyId);
    }

    return this.articles.list({
      companyId,
      category: query.category,
      tag: query.tag,
      isPublished: query.isPublished,
      search: query.search,
      includeGlobal: true,
    });
  }

  async publish(actor: ActorContext, id: string): Promise<KbArticleRecord> {
    const existing = await this.requireArticle(actor, id);
    await this.articles.saveVersionSnapshot(
      existing.id,
      existing.version,
      existing.body,
      actor.userId,
    );
    const article = await this.articles.setPublished(id, true, actor.userId);
    await this.indexing.indexArticle(id, actor.userId);
    return article;
  }

  async unpublish(actor: ActorContext, id: string): Promise<KbArticleRecord> {
    await this.requireArticle(actor, id);
    const article = await this.articles.setPublished(id, false, actor.userId);
    await this.indexing.indexArticle(id, actor.userId);
    return article;
  }

  async reindex(actor: ActorContext, companyId?: string): Promise<{ indexedChunks: number }> {
    const resolvedCompanyId = companyId
      ?? actor.companyId
      ?? await this.requireCompanyForReindex(actor);

    await this.companyAccess.assertCompanyAccess(actor, resolvedCompanyId);
    const indexedChunks = await this.indexing.reindexCompany(resolvedCompanyId, actor.userId);
    return { indexedChunks };
  }

  private async requireCompanyForReindex(actor: ActorContext): Promise<string> {
    await this.companyAccess.requireCompanyId(actor, null);
    throw new Error('unreachable');
  }

  private async requireArticle(actor: ActorContext, id: string): Promise<KbArticleRecord> {
    const article = await this.articles.findById(id);
    if (!article) throw new KbArticleNotFoundError(id);

    if (article.companyId) {
      await this.companyAccess.assertCompanyAccess(actor, article.companyId);
    } else if (!(await this.companyAccess.hasAllScope(actor.userId))) {
      throw new Error('Global knowledge articles require platform admin access');
    }

    return article;
  }
}
