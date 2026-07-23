/**
 * Seed company policy KB articles with versioning, publish, and embeddings.
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  COMPANY_POLICY_ARTICLES,
  CompanyPolicyArticle,
} from '../../src/modules/knowledge/domain/content/company-policy-articles';

const KB_ARTICLE_SOURCE_TYPE = 'kb_article';

/** Legacy seed slugs superseded by official policy articles. */
const DEPRECATED_KB_SLUGS = [
  'commission-payout-policy',
  'leave-personal-policy',
  'ot-policy',
] as const;

async function deprecateLegacyKbArticles(
  prisma: PrismaClient,
  adminUserId: string,
): Promise<void> {
  for (const slug of DEPRECATED_KB_SLUGS) {
    const row = await prisma.kbArticle.findFirst({
      where: { slug, deletedAt: null },
    });
    if (!row) continue;

    await prisma.kbArticle.update({
      where: { id: row.id },
      data: {
        isPublished: false,
        deletedAt: new Date(),
        deletedBy: adminUserId,
        updatedBy: adminUserId,
      },
    });
    await deleteArticleEmbeddings(prisma, row.id);
    console.log(`  kb deprecated: ${slug}`);
  }
}

function chunkBody(body: string, chunkSize = 800, overlap = 100): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (trimmed.length <= chunkSize) return [trimmed];

  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    const end = Math.min(start + chunkSize, trimmed.length);
    chunks.push(trimmed.slice(start, end));
    if (end >= trimmed.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

async function saveVersionSnapshot(
  prisma: PrismaClient,
  articleId: string,
  version: number,
  body: string | null,
  actorUserId: string,
): Promise<void> {
  await prisma.kbArticleVersion.upsert({
    where: { articleId_version: { articleId, version } },
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

async function deleteArticleEmbeddings(prisma: PrismaClient, articleId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM ai.ai_embeddings
     WHERE source_type = $1 AND source_id = $2::uuid`,
    KB_ARTICLE_SOURCE_TYPE,
    articleId,
  );
}

async function insertEmbedding(
  prisma: PrismaClient,
  articleId: string,
  adminUserId: string,
  chunk: string,
  chunkIndex: number,
  article: CompanyPolicyArticle,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO ai.ai_embeddings
       (id, source_type, source_id, chunk, embedding, metadata, created_by, updated_by)
     VALUES ($1::uuid, $2, $3::uuid, $4, NULL, $5::jsonb, $6::uuid, $6::uuid)`,
    randomUUID(),
    KB_ARTICLE_SOURCE_TYPE,
    articleId,
    chunk,
    JSON.stringify({
      companyId: null,
      articleId,
      title: article.title,
      slug: article.slug,
      category: article.category,
      tags: article.tags,
      chunkIndex,
    }),
    adminUserId,
  );
}

async function reindexArticleEmbeddings(
  prisma: PrismaClient,
  articleId: string,
  adminUserId: string,
  article: CompanyPolicyArticle,
): Promise<number> {
  await deleteArticleEmbeddings(prisma, articleId);
  const chunks = chunkBody(article.body);
  for (let i = 0; i < chunks.length; i += 1) {
    await insertEmbedding(prisma, articleId, adminUserId, chunks[i], i, article);
  }
  return chunks.length;
}

async function upsertPolicyArticle(
  prisma: PrismaClient,
  adminUserId: string,
  article: CompanyPolicyArticle,
): Promise<{ slug: string; version: number; chunks: number }> {
  const existing = await prisma.kbArticle.findFirst({
    where: { slug: article.slug, deletedAt: null },
  });

  if (!existing) {
    const row = await prisma.kbArticle.create({
      data: {
        id: randomUUID(),
        companyId: null,
        title: article.title,
        slug: article.slug,
        body: article.body,
        category: article.category,
        tags: [...article.tags],
        isPublished: true,
        version: 1,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });
    await saveVersionSnapshot(prisma, row.id, 1, row.body, adminUserId);
    const chunks = await reindexArticleEmbeddings(prisma, row.id, adminUserId, article);
    return { slug: article.slug, version: 1, chunks };
  }

  const bodyChanged = existing.body !== article.body
    || existing.title !== article.title
    || existing.category !== article.category
    || JSON.stringify(existing.tags) !== JSON.stringify([...article.tags]);

  if (!bodyChanged) {
    if (!existing.isPublished) {
      await prisma.kbArticle.update({
        where: { id: existing.id },
        data: { isPublished: true, updatedBy: adminUserId },
      });
    }
    const chunks = await reindexArticleEmbeddings(prisma, existing.id, adminUserId, article);
    return { slug: article.slug, version: existing.version, chunks };
  }

  await saveVersionSnapshot(prisma, existing.id, existing.version, existing.body, adminUserId);
  const updated = await prisma.kbArticle.update({
    where: { id: existing.id },
    data: {
      title: article.title,
      body: article.body,
      category: article.category,
      tags: [...article.tags],
      isPublished: true,
      version: { increment: 1 },
      updatedBy: adminUserId,
    },
  });
  await saveVersionSnapshot(prisma, updated.id, updated.version, updated.body, adminUserId);
  const chunks = await reindexArticleEmbeddings(prisma, updated.id, adminUserId, article);
  return { slug: article.slug, version: updated.version, chunks };
}

export async function seedCompanyPolicyKnowledge(
  prisma: PrismaClient,
  adminUserId: string,
): Promise<Array<{ slug: string; version: number; chunks: number }>> {
  await deprecateLegacyKbArticles(prisma, adminUserId);
  const results = [];
  for (const article of COMPANY_POLICY_ARTICLES) {
    const result = await upsertPolicyArticle(prisma, adminUserId, article);
    results.push(result);
    console.log(`  kb article: ${result.slug} (v${result.version}, ${result.chunks} chunks)`);
  }
  return results;
}

export { COMPANY_POLICY_ARTICLES, KB_ARTICLE_SOURCE_TYPE };
