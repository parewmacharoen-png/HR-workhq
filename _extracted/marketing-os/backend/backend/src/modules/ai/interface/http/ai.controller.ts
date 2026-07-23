// ============================================================================
// modules/ai/interface/http/ai.controller.ts
// ============================================================================

import { Body, Controller, Post } from '@nestjs/common';
import { AiAssistantService } from '../../application/ai-assistant.service';
import { AiChatDto } from '../../application/dto/ai.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('ai')
export class AiController {
  constructor(private readonly assistant: AiAssistantService) {}

  @Post('chat')
  @RequirePermission('ai:chat')
  chat(@CurrentActor() actor: ActorContext, @Body() dto: AiChatDto) {
    return this.assistant.chat(actor, {
      message: dto.message,
      conversationId: dto.conversationId,
      channel: dto.channel,
    });
  }
}
