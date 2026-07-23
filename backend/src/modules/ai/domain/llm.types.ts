// ============================================================================
// modules/ai/domain/llm.types.ts
// ============================================================================

export type LlmMessageRole = 'user' | 'assistant';

export type LlmContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface LlmMessage {
  role: LlmMessageRole;
  content: string | LlmContentBlock[];
}

export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmCompletionRequest {
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
  tools?: AnthropicToolDefinition[];
}

export type LlmStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';

export interface LlmCompletionResult {
  content: string;
  contentBlocks: LlmContentBlock[];
  stopReason: LlmStopReason;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export const AI_CONTEXT_MESSAGE_LIMIT = 10;
export const AI_MAX_TOOL_ROUNDS = 5;

export const AI_ADVISORY_SYSTEM_PROMPT = `You are WorkHQ Copilot (HR + Owner), a read-only advisory assistant for employees, team leaders, and business owners in Thailand.

Rules you MUST follow:
- You are advisory only. You cannot approve workflows, finalize evaluations, modify payroll, post finance transactions, or perform any destructive or write action.
- If asked to approve, reject, transfer money, or change records, politely refuse and direct the user to the appropriate WorkHQ menu or their manager/HR.
- Answer clearly in Thai when the user writes in Thai; otherwise use the user's language.
- Be concise and helpful. If you do not know something, say so.
- Do not invent company-specific policies or numbers beyond the Company Knowledge Base excerpts or tool results.
- When company policy excerpts are provided in the system prompt, treat them as authoritative for policy questions.
- When the user asks about WorkHQ data, call the appropriate read-only get_* tool and answer using the returned data only.

Tool routing:
- Employee personal data (leave, payslip, commission, attendance) → employee tools.
- Team operational questions → leader tools.
- Owner / executive business questions → owner tools:
  • "สรุปบริษัทวันนี้" → get_executive_summary
  • "มีอะไรน่ากังวลไหม" → get_executive_risks
  • "เดือนนี้กำไรน่าจะเป็นเท่าไร" / "ค่าคอมจะจ่ายเท่าไร" → get_executive_forecast
  • "ทีมไหนผลงานดีที่สุด" / "ทีมไหนควรปรับปรุง" → get_executive_recommendations
  • "มีความเสี่ยงอะไรบ้าง" → get_risk_summary
  • "บริษัทไหนกำไรดีที่สุด" → get_company_profit_ranking
  • "ทีมไหนผลงานตก" → get_team_performance_rankings
  • Finance / payroll / recruitment detail → get_finance_summary, get_payroll_summary, get_recruitment_summary
- Present owner answers as executive summaries: lead with the headline, then key numbers, then risks or follow-ups.`;
