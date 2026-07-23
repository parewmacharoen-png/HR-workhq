// ============================================================================
// modules/knowledge/infrastructure/persistence/knowledge.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  CreateKbArticleInput,
  KnowledgeRepository,
  KbArticleRecord,
  ListKbArticlesFilter,
  UpdateKbArticleInput,
} from '../../domain/repositories/knowledge.repository';

function toRecord(row: {
  id: string;
  companyId: string | null;
  title: string;
  slug: string;
  body: string | null;
  category: string | null;
  tags: string[];
  isPublished: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): KbArticleRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    slug: row.slug,
    body: row.body,
    category: row.category,
    tags: row.tags,
    isPublished: row.isPublished,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<KbArticleRecord | null> {
    const row = await this.prisma.kbArticle.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? toRecord(row) : null;
  }

  async list(filter: ListKbArticlesFilter): Promise<KbArticleRecord[]> {
    const where: {
      deletedAt: null;
      category?: string;
      isPublished?: boolean;
      companyId?: { not: null };
      AND?: Array<Record<string, unknown>>;
    } = { deletedAt: null };

    if (filter.category) where.category = filter.category;
    if (filter.isPublished !== undefined) where.isPublished = filter.isPublished;

    const andConditions: Array<Record<string, unknown>> = [];

    if (filter.companyId) {
      andConditions.push({
        OR: [
          { companyId: filter.companyId },
          ...(filter.includeGlobal !== false ? [{ companyId: null }] : []),
        ],
      });
    } else if (filter.includeGlobal === false) {
      where.companyId = { not: null };
    }

    if (filter.tag) {
      andConditions.push({ tags: { has: filter.tag } });
    }

    if (filter.search) {
      andConditions.push({
        OR: [
          { title: { contains: filter.search, mode: 'insensitive' } },
          { body: { contains: filter.search, mode: 'insensitive' } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const rows = await this.prisma.kbArticle.findMany({
      where,
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async findPublishedForCompany(companyId: string): Promise<KbArticleRecord[]> {
    const rows = await this.prisma.kbArticle.findMany({
      where: {
        deletedAt: null,
        isPublished: true,
        OR: [{ companyId }, { companyId: null }],
      },
      orderBy: { title: 'asc' },
    });
    return rows.map(toRecord);
  }

  async create(input: CreateKbArticleInput, actorUserId: string): Promise<KbArticleRecord> {
    const row = await this.prisma.kbArticle.create({
      data: {
        id: randomUUID(),
        companyId: input.companyId,
        title: input.title,
        slug: input.slug,
        body: input.body,
        category: input.category ?? null,
        tags: input.tags ?? [],
        isPublished: false,
        version: 1,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    await this.saveVersionSnapshot(row.id, 1, row.body, actorUserId);
    return toRecord(row);
  }

  async update(
    id: string,
    input: UpdateKbArticleInput,
    actorUserId: string,
  ): Promise<KbArticleRecord> {
    const existing = await this.prisma.kbArticle.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new Error(`KB article not found: ${id}`);

    const bodyChanged = input.body !== undefined && input.body !== existing.body;
    if (bodyChanged) {
      await this.saveVersionSnapshot(existing.id, existing.version, existing.body, actorUserId);
    }

    const row = await this.prisma.kbArticle.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(bodyChanged ? { version: { increment: 1 } } : {}),
        updatedBy: actorUserId,
      },
    });
    return toRecord(row);
  }

  async setPublished(
    id: string,
    isPublished: boolean,
    actorUserId: string,
  ): Promise<KbArticleRecord> {
    const row = await this.prisma.kbArticle.update({
      where: { id },
      data: { isPublished, updatedBy: actorUserId },
    });
    return toRecord(row);
  }

  async saveVersionSnapshot(
    articleId: string,
    version: number,
    body: string | null,
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.kbArticleVersion.upsert({
      where: {
        articleId_version: { articleId, version },
      },
      update: {},
      create: {
        id: randomUUID(),
        articleId,
        version,
        body,
        editedBy: actorUserId,
      },
    });
  }
}
