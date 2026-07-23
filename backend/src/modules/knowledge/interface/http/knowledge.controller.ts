// ============================================================================
// modules/knowledge/interface/http/knowledge.controller.ts
// ============================================================================

import {
  Body, Controller, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { KnowledgeBaseService } from '../../application/knowledge-base.service';
import {
  CreateKbArticleDto,
  ListKbArticlesQuery,
  ReindexKnowledgeQuery,
  UpdateKbArticleDto,
} from '../../application/dto/knowledge.dto';

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly service: KnowledgeBaseService) {}

  @Get('articles')
  @RequirePermission('knowledge:read')
  list(@CurrentActor() actor: ActorContext, @Query() query: ListKbArticlesQuery) {
    return this.service.list(actor, query);
  }

  @Get('articles/:id')
  @RequirePermission('knowledge:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.get(actor, id);
  }

  @Post('articles')
  @RequirePermission('knowledge:write')
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateKbArticleDto) {
    return this.service.create(actor, dto);
  }

  @Patch('articles/:id')
  @RequirePermission('knowledge:write')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateKbArticleDto,
  ) {
    return this.service.update(actor, id, dto);
  }

  @Post('articles/:id/publish')
  @RequirePermission('knowledge:write')
  publish(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.publish(actor, id);
  }

  @Post('articles/:id/unpublish')
  @RequirePermission('knowledge:write')
  unpublish(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.unpublish(actor, id);
  }

  @Post('reindex')
  @RequirePermission('knowledge:write')
  reindex(@CurrentActor() actor: ActorContext, @Query() query: ReindexKnowledgeQuery) {
    return this.service.reindex(actor, query.companyId);
  }
}
