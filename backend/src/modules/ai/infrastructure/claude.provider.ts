// ============================================================================
// modules/ai/infrastructure/claude.provider.ts
// Anthropic Messages API adapter (Claude) with tool calling support.
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmContentBlock,
  LlmStopReason,
} from '../domain/llm.types';
import { AiProviderError, AiProviderNotConfiguredError } from '../domain/errors/ai.errors';

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicMessageResponse {
  content?: AnthropicContentBlock[];
  model?: string;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

@Injectable()
export class ClaudeProvider {
  private readonly logger = new Logger(ClaudeProvider.name);

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return !!this.config.anthropicApiKey;
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const apiKey = this.config.anthropicApiKey;
    if (!apiKey) throw new AiProviderNotConfiguredError();

    const model = this.config.anthropicModel;
    const maxTokens = request.maxTokens ?? this.config.aiMaxTokens;

    const bodyPayload: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      system: request.system,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };
    if (request.tools && request.tools.length > 0) {
      bodyPayload.tools = request.tools;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(bodyPayload),
    });

    const body = (await response.json()) as AnthropicMessageResponse;

    if (!response.ok) {
      const msg = body.error?.message ?? `Anthropic API error (${response.status})`;
      this.logger.warn(`Claude API failed: ${msg}`);
      throw new AiProviderError(msg);
    }

    const contentBlocks = this.parseContentBlocks(body.content ?? []);
    const text = contentBlocks
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    const stopReason = this.parseStopReason(body.stop_reason);

    if (stopReason !== 'tool_use' && !text) {
      throw new AiProviderError('Claude returned an empty response');
    }

    return {
      content: text,
      contentBlocks,
      stopReason,
      model: body.model ?? model,
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
    };
  }

  private parseContentBlocks(blocks: AnthropicContentBlock[]): LlmContentBlock[] {
    const result: LlmContentBlock[] = [];
    for (const block of blocks) {
      if (block.type === 'text') {
        result.push({ type: 'text', text: block.text ?? '' });
        continue;
      }
      if (block.type === 'tool_use' && block.id && block.name) {
        result.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input ?? {},
        });
      }
    }
    return result;
  }

  private parseStopReason(value?: string): LlmStopReason {
    if (value === 'tool_use' || value === 'max_tokens' || value === 'stop_sequence') {
      return value;
    }
    return 'end_turn';
  }
}
