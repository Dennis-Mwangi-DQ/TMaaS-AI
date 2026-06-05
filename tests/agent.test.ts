import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  appendTurnMock,
  createChatCompletionMock,
  getOrCreateSessionMock,
  lookupFaqMock,
  resolveUserIdentityMock,
  updateSessionMock,
} = vi.hoisted(() => ({
  appendTurnMock: vi.fn(),
  createChatCompletionMock: vi.fn(),
  getOrCreateSessionMock: vi.fn(),
  lookupFaqMock: vi.fn(),
  resolveUserIdentityMock: vi.fn(),
  updateSessionMock: vi.fn(),
}));

vi.mock('../src/lib/qwenClient', () => ({
  hasLlmConfig: true,
  createChatCompletion: createChatCompletionMock,
}));

vi.mock('../src/tools/faq', () => ({
  lookupFaq: lookupFaqMock,
}));

vi.mock('../src/memory/sessionManager', () => ({
  appendTurn: appendTurnMock,
  getOrCreateSession: getOrCreateSessionMock,
  resolveUserIdentity: resolveUserIdentityMock,
  updateSession: updateSessionMock,
}));

import { runAgent } from '../src/agent/agent';

describe('runAgent', () => {
  const baseSession = {
    sessionId: '11111111-1111-4111-8111-111111111111',
    channel: 'web' as const,
    userTier: 'visitor' as const,
    clientId: null,
    whatsappNumber: null,
    conversationHistory: [],
    lastIntent: null,
    lastBookingRef: null,
    status: 'active' as const,
    clarificationCount: 0,
    createdAt: '2026-06-05T11:47:00.000Z',
    updatedAt: '2026-06-05T11:47:00.000Z',
  };

  beforeEach(() => {
    appendTurnMock.mockReset();
    createChatCompletionMock.mockReset();
    getOrCreateSessionMock.mockReset();
    lookupFaqMock.mockReset();
    resolveUserIdentityMock.mockReset();
    updateSessionMock.mockReset();

    resolveUserIdentityMock.mockResolvedValue({
      userTier: 'visitor',
      clientId: null,
    });
    getOrCreateSessionMock.mockResolvedValue(baseSession);
    updateSessionMock.mockResolvedValue(baseSession);
    appendTurnMock.mockResolvedValue(undefined);
  });

  it('falls back to the tool result when Ollama returns an empty provider envelope', async () => {
    createChatCompletionMock
      .mockResolvedValueOnce(
        JSON.stringify({
          action: 'lookup_faq',
          tool_name: 'lookup_faq',
          tool_args: { query: 'services offered' },
        }),
      )
      .mockResolvedValueOnce('');

    lookupFaqMock.mockResolvedValue({
      success: true,
      data: {
        answer: 'We offer brow, lash, skin, and injectable services across our branches.',
      },
    });

    const result = await runAgent({
      message: 'What services do you offer?',
      sessionId: baseSession.sessionId,
      channel: 'web',
    });

    expect(result.toolCalls).toEqual([
      {
        name: 'lookup_faq',
        args: { query: 'services offered' },
      },
    ]);
    expect(result.response).toBe(
      'We offer brow, lash, skin, and injectable services across our branches.',
    );
    expect(result.response).not.toContain('"model":"llama3.2"');
  });
});
