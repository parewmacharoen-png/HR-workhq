// ============================================================================
// test/helpers/mock-telegram-gateway.ts
// ============================================================================

export const mockTelegramGateway = {
  sendMessage: jest.fn().mockResolvedValue(1),
  editMessageText: jest.fn().mockResolvedValue(undefined),
  answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
  onModuleInit: jest.fn(),
};
