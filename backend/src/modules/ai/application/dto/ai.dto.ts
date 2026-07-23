// ============================================================================
// modules/ai/application/dto/ai.dto.ts
// ============================================================================

import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { AiChannel } from '@prisma/client';

export class AiChatDto {
  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsEnum(AiChannel)
  channel?: AiChannel;
}
