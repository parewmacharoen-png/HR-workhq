// ============================================================================
// modules/knowledge/domain/repositories/knowledge.repository.ts
// ============================================================================

export const KNOWLEDGE_REPOSITORY = Symbol('KNOWLEDGE_REPOSITORY');

export interface KbArticleRecord {
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
}

export interface CreateKbArticleInput {
  companyId: string | null;
  title: string;
  slug: string;
  body: string;
  category?: string | null;
  tags?: string[];
}

export interface UpdateKbArticleInput {
  title?: string;
  slug?: string;
  body?: string;
  category?: string | null;
  tags?: string[];
}

export interface ListKbArticlesFilter {
  companyId?: string | null;
  category?: string;
  tag?: string;
  isPublished?: boolean;
  search?: string;
  includeGlobal?: boolean;
}

export interface KnowledgeRepository {
  findById(id: string): Promise<KbArticleRecord | null>;
  list(filter: ListKbArticlesFilter): Promise<KbArticleRecord[]>;
  findPublishedForCompany(companyId: string): Promise<KbArticleRecord[]>;
  create(input: CreateKbArticleInput, actorUserId: string): Promise<KbArticleRecord>;
  update(id: string, input: UpdateKbArticleInput, actorUserId: string): Promise<KbArticleRecord>;
  setPublished(id: string, isPublished: boolean, actorUserId: string): Promise<KbArticleRecord>;
  saveVersionSnapshot(articleId: string, version: number, body: string | null, actorUserId: string): Promise<void>;
}
