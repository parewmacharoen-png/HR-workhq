// ============================================================================
// modules/ai/application/knowledge-assistant.service.unit.spec.ts
// AI-001 tests
// ============================================================================

import { AiChannel } from '@prisma/client';
import { KnowledgeAssistantService } from './knowledge-assistant.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RagRetrievalService } from '../../knowledge/application/rag-retrieval.service';
import { AiAssistantService } from './ai-assistant.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { BusinessPermissionRepository } from '../../permission/domain/repositories/business-permission.repository';

describe('KnowledgeAssistantService', () => {
  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'co-1' };

  const findManySources = jest.fn();
  const createLog = jest.fn();
  const retrieve = jest.fn();
  const chat = jest.fn();
  const findUserAccess = jest.fn();

  let service: KnowledgeAssistantService;

  beforeEach(() => {
    jest.clearAllMocks();
    findManySources.mockResolvedValue([
      {
        id: 'src-1',
        title: 'นโยบายการลา',
        sourceType: 'policy',
        content: 'ลาป่วยได้ 30 วันต่อปี',
        chunks: [{ chunkText: 'ลาป่วยได้ 30 วันต่อปี' }],
      },
    ]);
    createLog.mockResolvedValue({ id: 'log-1' });
    retrieve.mockResolvedValue([]);
    chat.mockResolvedValue({
      reply: 'ลาป่วยได้ 30 วันต่อปี',
      conversationId: 'conv-1',
      model: 'test',
      disclaimer: 'advisory',
    });
    findUserAccess.mockResolvedValue({
      userId: 'user-1',
      employeeId: 'emp-1',
      businessRole: 'employee',
      scopes: [{ companyId: 'co-1' }],
    });

    service = new KnowledgeAssistantService(
      { aiKnowledgeSource: { findMany: findManySources }, aiQueryLog: { create: createLog } } as unknown as PrismaService,
      { retrieve } as unknown as RagRetrievalService,
      { chat } as unknown as AiAssistantService,
      { now: () => new Date() } as DateProvider,
      { findUserAccess } as unknown as BusinessPermissionRepository,
    );
  });

  it('returns policy answer with citation', async () => {
    const result = await service.ask(actor, 'ลาป่วยได้กี่วัน', AiChannel.web);

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.title).toBe('นโยบายการลา');
    expect(result.answer).toContain('นโยบายการลา');
    expect(result.confidence).toBeGreaterThan(40);
    expect(createLog).toHaveBeenCalled();
  });

  it('shows no-source fallback when nothing matches', async () => {
    findManySources.mockResolvedValue([]);
    chat.mockResolvedValue({
      reply: 'ไม่ทราบ',
      conversationId: 'c2',
      model: 'test',
      disclaimer: 'advisory',
    });

    const result = await service.ask(actor, 'xyz unknown topic', AiChannel.telegram);

    expect(result.answer).toContain('ไม่พบข้อมูลในนโยบาย');
    expect(result.confidence).toBeLessThanOrEqual(25);
  });

  it('denies salary visibility for employee role', async () => {
    const result = await service.ask(actor, 'เงินเดือนของฉันเท่าไหร่', AiChannel.web);

    expect(result.deniedReason).toBe('salary_visibility_denied');
    expect(chat).not.toHaveBeenCalled();
  });

  it('allows salary question for secretary', async () => {
    findUserAccess.mockResolvedValue({
      userId: 'user-1',
      employeeId: 'emp-1',
      businessRole: 'secretary',
      scopes: [{ companyId: 'co-1' }],
    });

    await service.ask(actor, 'เงินเดือนพนักงาน A', AiChannel.web);

    expect(chat).toHaveBeenCalled();
  });
});
