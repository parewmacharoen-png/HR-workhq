// ============================================================================
// modules/ai/interface/http/ai.controller.ts
// ============================================================================

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AiChannel } from '@prisma/client';
import { AiAssistantService } from '../../application/ai-assistant.service';
import { KnowledgeAssistantService } from '../../application/knowledge-assistant.service';
import { AiChatDto } from '../../application/dto/ai.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class KnowledgeAssistantDto {
  @IsString() @MinLength(1) question!: string;
  @IsOptional() @IsEnum(AiChannel) channel?: AiChannel;
  @IsOptional() conversationId?: string;
}

@Controller('ai')
export class AiController {
  constructor(
    private readonly assistant: AiAssistantService,
    private readonly knowledge: KnowledgeAssistantService,
  ) {}

  @Post('chat')
  @RequirePermission('ai:chat')
  chat(@CurrentActor() actor: ActorContext, @Body() dto: AiChatDto) {
    return this.assistant.chat(actor, {
      message: dto.message,
      conversationId: dto.conversationId,
      channel: dto.channel,
    });
  }

  @Post('knowledge-assistant')
  @RequirePermission('ai:chat')
  knowledgeAssistant(@CurrentActor() actor: ActorContext, @Body() dto: KnowledgeAssistantDto) {
    return this.knowledge.ask(
      actor,
      dto.question,
      dto.channel ?? AiChannel.web,
      dto.conversationId,
    );
  }

  @Get('knowledge-assistant/unresolved')
  @RequirePermission('ai:chat')
  unresolved(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.knowledge.listUnresolved(companyId);
  }
}
