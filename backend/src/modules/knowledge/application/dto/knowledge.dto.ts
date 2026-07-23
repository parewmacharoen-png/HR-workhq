// ============================================================================
// modules/knowledge/application/dto/knowledge.dto.ts
// ============================================================================

import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateKbArticleDto {
  @IsOptional()
  @IsUUID()
  companyId?: string | null;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateKbArticleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ListKbArticlesQuery {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}

export class ReindexKnowledgeQuery {
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
