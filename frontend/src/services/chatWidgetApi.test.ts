import api from '@/lib/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  convertSessionToContact,
  createChatWidget,
  createPublicChatSession,
  getChatSession,
  getChatSessions,
  getChatWidget,
  getEmbedCode,
  getPublicChatWidgetConfig,
  sendAgentMessage,
  updateChatWidget,
} from './chatWidgetApi';
import {
  convertChatSessionViaGraphql,
  createChatWidgetViaGraphql,
  getChatSessionViaGraphql,
  getChatSessionsViaGraphql,
  getChatWidgetEmbedCodeViaGraphql,
  getChatWidgetViaGraphql,
  sendAgentChatMessageViaGraphql,
  updateChatWidgetViaGraphql,
} from './chatWidgetGraphql';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./chatWidgetGraphql', () => ({
  getChatWidgetViaGraphql: vi.fn(),
  createChatWidgetViaGraphql: vi.fn(),
  updateChatWidgetViaGraphql: vi.fn(),
  getChatWidgetEmbedCodeViaGraphql: vi.fn(),
  getChatSessionsViaGraphql: vi.fn(),
  getChatSessionViaGraphql: vi.fn(),
  sendAgentChatMessageViaGraphql: vi.fn(),
  convertChatSessionViaGraphql: vi.fn(),
}));

describe('Chat Widget transport boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes the complete authenticated operator surface through GraphQL', async () => {
    vi.mocked(getChatWidgetViaGraphql).mockResolvedValue(null);
    vi.mocked(createChatWidgetViaGraphql).mockResolvedValue({ id: 4 } as never);
    vi.mocked(updateChatWidgetViaGraphql).mockResolvedValue({ id: 4 } as never);
    vi.mocked(getChatWidgetEmbedCodeViaGraphql).mockResolvedValue({
      widget_key: 'cw_public',
      embed_code: '<script />',
    });
    vi.mocked(getChatSessionsViaGraphql).mockResolvedValue({
      sessions: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });
    vi.mocked(getChatSessionViaGraphql).mockResolvedValue({ id: 9 } as never);
    vi.mocked(sendAgentChatMessageViaGraphql).mockResolvedValue({
      id: 12,
    } as never);
    vi.mocked(convertChatSessionViaGraphql).mockResolvedValue({
      success: true,
      contact_id: 21,
      conversation_id: 22,
    });

    await getChatWidget(3);
    await createChatWidget({ name: 'Support' }, 3);
    await updateChatWidget({ is_active: false }, 3);
    await getEmbedCode(3);
    await getChatSessions({ status: 'active' }, 3);
    await getChatSession(9, 3);
    await sendAgentMessage(9, 'Hello', 3);
    await convertSessionToContact(9, 3);

    expect(getChatWidgetViaGraphql).toHaveBeenCalledWith(3);
    expect(createChatWidgetViaGraphql).toHaveBeenCalledWith(
      { name: 'Support' },
      3,
    );
    expect(updateChatWidgetViaGraphql).toHaveBeenCalledWith(
      { is_active: false },
      3,
    );
    expect(getChatSessionsViaGraphql).toHaveBeenCalledWith(
      { status: 'active' },
      3,
    );
    expect(sendAgentChatMessageViaGraphql).toHaveBeenCalledWith(
      9,
      'Hello',
      3,
    );
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('keeps anonymous visitor embed/session protocols on HTTP', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { widget_key: 'cw_public', is_active: true },
    });
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { session_token: 'cs_capability', session_id: 9, resumed: false },
    });
    await getPublicChatWidgetConfig('cw_public');
    await expect(
      createPublicChatSession({ widget_key: 'cw_public' }),
    ).resolves.toMatchObject({ session_id: 9 });
    expect(api.get).toHaveBeenCalledWith(
      '/api/chat-widget/public/config/cw_public',
    );
    expect(api.post).toHaveBeenCalledWith(
      '/api/chat-widget/public/session',
      { widget_key: 'cw_public' },
    );
  });
});
