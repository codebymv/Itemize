import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
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

vi.mock('./graphqlClient', () => ({
  graphqlRequest: vi.fn(),
  graphqlMutationRequest: vi.fn(),
}));

const widget = {
  id: 4,
  organizationId: 3,
  widgetKey: 'cw_public',
  name: 'Support',
  primaryColor: '#3B82F6',
  textColor: '#FFFFFF',
  position: 'bottom-right' as const,
  iconStyle: 'chat',
  customIconUrl: null,
  welcomeTitle: 'Hello',
  welcomeMessage: 'How can we help?',
  placeholderText: 'Type...',
  requireEmail: true,
  requireName: false,
  requirePhone: false,
  customFields: [],
  isActive: true,
  autoOpenDelay: 0,
  showBranding: true,
  notificationSound: true,
  businessHours: null,
  offlineMessage: 'Offline',
  defaultAssignedTo: null,
  autoAssignAvailable: false,
  totalConversations: 2,
  totalMessages: 3,
  allowedDomains: ['example.com'],
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
};

const message = {
  id: 12,
  sessionId: 9,
  organizationId: 3,
  senderType: 'agent' as const,
  senderUserId: 8,
  content: 'Hello',
  contentType: 'text' as const,
  attachmentUrl: null,
  attachmentName: null,
  attachmentSize: null,
  isRead: false,
  readAt: null,
  agentName: 'Ada',
  createdAt: '2026-07-26T00:00:00.000Z',
};

const session = {
  id: 9,
  organizationId: 3,
  widgetId: 4,
  visitorName: 'Grace',
  visitorEmail: 'grace@example.test',
  visitorPhone: null,
  customData: {},
  ipAddress: null,
  userAgent: null,
  referrerUrl: null,
  currentPageUrl: null,
  country: null,
  city: null,
  timezone: null,
  contactId: null,
  conversationId: null,
  status: 'active' as const,
  isOnline: true,
  lastSeenAt: '2026-07-26T00:00:00.000Z',
  startedAt: '2026-07-26T00:00:00.000Z',
  endedAt: null,
  widgetName: 'Support',
  unreadCount: 1,
  lastMessage: 'Hi',
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  messages: [message],
};

describe('chat widget GraphQL consumer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps widget reads, writes, and embed code to the retained shape', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({ chatWidget: widget })
      .mockResolvedValueOnce({
        chatWidgetEmbedCode: {
          widgetKey: 'cw_public',
          embedCode: '<script>safe</script>',
        },
      });
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({ createChatWidget: widget })
      .mockResolvedValueOnce({ updateChatWidget: widget });

    await expect(getChatWidgetViaGraphql(3)).resolves.toMatchObject({
      organization_id: 3,
      widget_key: 'cw_public',
      primary_color: '#3B82F6',
      custom_icon_url: undefined,
    });
    await createChatWidgetViaGraphql(
      {
        name: 'Support',
        primary_color: '#3B82F6',
        is_active: false,
      },
      3,
      'create-widget-key',
    );
    await updateChatWidgetViaGraphql(
      { business_hours: undefined, default_assigned_to: 8 },
      3,
    );
    await expect(getChatWidgetEmbedCodeViaGraphql(3)).resolves.toEqual({
      widget_key: 'cw_public',
      embed_code: '<script>safe</script>',
    });
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('mutation CreateChatWidget'),
      {
        input: {
          name: 'Support',
          primaryColor: '#3B82F6',
          isActive: false,
        },
        idempotencyKey: 'create-widget-key',
      },
      3,
    );
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('mutation UpdateChatWidget'),
      { input: { defaultAssignedTo: 8 } },
      3,
    );
  });

  it('maps paged sessions and detail without manufacturing capability tokens', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({
        chatSessions: {
          sessions: [session],
          page: 2,
          limit: 10,
          total: 11,
          totalPages: 2,
        },
      })
      .mockResolvedValueOnce({ chatSession: session });
    const page = await getChatSessionsViaGraphql(
      { status: 'active', page: 2, limit: 10 },
      3,
    );
    expect(page).toMatchObject({
      sessions: [
        {
          id: 9,
          visitor_name: 'Grace',
          unread_count: 1,
        },
      ],
      pagination: { page: 2, limit: 10, total: 11, totalPages: 2 },
    });
    expect(page.sessions[0]).not.toHaveProperty('session_token');
    await expect(getChatSessionViaGraphql(9, 3)).resolves.toMatchObject({
      id: 9,
      messages: [
        {
          id: 12,
          sender_type: 'agent',
          sender_user_id: 8,
          agent_name: 'Ada',
        },
      ],
    });
    expect(graphqlRequest).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('query ChatSessions'),
      { status: 'active', page: 2, limit: 10 },
      3,
    );
  });

  it('maps agent reply and conversion mutations', async () => {
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({
        sendAgentChatMessage: { replayed: false, message },
      })
      .mockResolvedValueOnce({
        convertChatSession: {
          success: true,
          contactId: 21,
          conversationId: 22,
        },
      });
    await expect(
      sendAgentChatMessageViaGraphql(9, 'Hello', 3, 'chat-reply-9'),
    ).resolves.toMatchObject({
      id: 12,
      session_id: 9,
      content: 'Hello',
    });
    await expect(convertChatSessionViaGraphql(9, 3)).resolves.toEqual({
      success: true,
      contact_id: 21,
      conversation_id: 22,
    });
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('mutation SendAgentChatMessage'),
      {
        sessionId: 9,
        input: {
          content: 'Hello',
          idempotencyKey: 'chat-reply-9',
        },
      },
      3,
    );
  });
});
