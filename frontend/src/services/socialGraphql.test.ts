import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import {
  disconnectSocialChannelViaGraphql,
  getSocialAnalyticsViaGraphql,
  getSocialChannelsViaGraphql,
  getSocialConversationsViaGraphql,
  openSocialConversationViaGraphql,
  sendSocialMessageViaGraphql,
  updateSocialConversationViaGraphql,
} from './socialGraphql';

vi.mock('./graphqlClient', () => ({
  graphqlRequest: vi.fn(),
  graphqlMutationRequest: vi.fn(),
}));

const channel = {
  id: 4,
  organizationId: 3,
  channelType: 'facebook' as const,
  externalId: 'external-page',
  name: 'Main page',
  username: null,
  profilePictureUrl: null,
  pageId: 'page-id',
  instagramBusinessAccountId: null,
  permissions: ['pages_messaging'],
  isActive: true,
  isConnected: true,
  connectionError: null,
  lastSyncedAt: null,
  webhookVerified: true,
  createdBy: 8,
  createdByName: 'Ada',
  createdAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-25T00:00:00.000Z',
};

const message = {
  id: 12,
  organizationId: 3,
  conversationId: 9,
  channelId: 4,
  externalMessageId: null,
  messageType: 'text' as const,
  textContent: 'Hello',
  mediaUrl: null,
  mediaType: null,
  mediaFilename: null,
  direction: 'outbound' as const,
  senderId: null,
  senderName: null,
  sentBy: 8,
  sentByName: 'Ada',
  status: 'pending' as const,
  errorMessage: null,
  messageTimestamp: '2026-07-25T00:00:00.000Z',
  readAt: null,
  createdAt: '2026-07-25T00:00:00.000Z',
};

const conversation = {
  id: 9,
  organizationId: 3,
  channelId: 4,
  threadId: null,
  participantId: 'participant',
  participantName: 'Grace',
  participantUsername: null,
  participantProfilePic: null,
  contactId: null,
  status: 'open' as const,
  assignedTo: null,
  assignedToName: null,
  unreadCount: 1,
  messageCount: 1,
  lastMessageText: 'Hello',
  lastMessageAt: '2026-07-25T00:00:00.000Z',
  lastMessageFrom: 'participant',
  tags: [],
  channelType: 'facebook' as const,
  channelName: 'Main page',
  contactFirstName: null,
  contactLastName: null,
  contactEmail: null,
  createdAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-25T00:00:00.000Z',
  messages: [message],
};

describe('social GraphQL consumer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps channel and paginated conversation reads to the retained shape', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({ socialChannels: [channel] })
      .mockResolvedValueOnce({
        socialConversations: {
          conversations: [conversation],
          page: 2,
          limit: 10,
          total: 11,
          totalPages: 2,
        },
      });
    await expect(getSocialChannelsViaGraphql('facebook', 3)).resolves.toEqual([
      expect.objectContaining({
        organization_id: 3,
        channel_type: 'facebook',
        page_id: 'page-id',
        is_connected: true,
      }),
    ]);
    await expect(
      getSocialConversationsViaGraphql(
        { channel_id: 4, status: 'open', page: 2, limit: 10 },
        3,
      ),
    ).resolves.toMatchObject({
      conversations: [
        {
          id: 9,
          participant_name: 'Grace',
          channel_type: 'facebook',
          last_message_text: 'Hello',
        },
      ],
      pagination: { page: 2, limit: 10, total: 11, totalPages: 2 },
    });
    expect(graphqlRequest).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('query SocialConversations'),
      { channelId: 4, status: 'open', page: 2, limit: 10 },
      3,
    );
  });

  it('uses mutations for disconnect, opening/read state, updates, and sends', async () => {
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({ disconnectSocialChannel: { success: true } })
      .mockResolvedValueOnce({ openSocialConversation: conversation })
      .mockResolvedValueOnce({ updateSocialConversation: conversation })
      .mockResolvedValueOnce({ sendSocialMessage: { message } });

    await expect(disconnectSocialChannelViaGraphql(4, 3)).resolves.toEqual({
      success: true,
    });
    await expect(openSocialConversationViaGraphql(9, 3)).resolves.toMatchObject({
      id: 9,
      messages: [{ id: 12, text_content: 'Hello' }],
    });
    await updateSocialConversationViaGraphql(
      9,
      { assigned_to: undefined, contact_id: undefined, tags: [] },
      3,
    );
    await sendSocialMessageViaGraphql(9, 'Hello', 3, 'social-key-1');

    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('mutation UpdateSocialConversation'),
      {
        conversationId: 9,
        input: { assignedTo: null, contactId: null, tags: [] },
      },
      3,
    );
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('mutation SendSocialMessage'),
      {
        conversationId: 9,
        input: { text: 'Hello', idempotencyKey: 'social-key-1' },
      },
      3,
    );
  });

  it('maps analytics without leaking GraphQL casing', async () => {
    vi.mocked(graphqlRequest).mockResolvedValue({
      socialAnalytics: {
        period: 7,
        channels: [
          {
            channelType: 'facebook',
            conversationCount: 2,
            messageCount: 4,
            inboundCount: 3,
            outboundCount: 1,
          },
        ],
        averageResponseTimeMinutes: null,
        messagesOverTime: [
          { date: '2026-07-25T00:00:00.000Z', inbound: 3, outbound: 1 },
        ],
        statusDistribution: [{ status: 'open', count: 2 }],
      },
    });
    await expect(getSocialAnalyticsViaGraphql(7, 3)).resolves.toEqual({
      period: 7,
      channels: [
        {
          channel_type: 'facebook',
          conversation_count: 2,
          message_count: 4,
          inbound_count: 3,
          outbound_count: 1,
        },
      ],
      avg_response_time_minutes: undefined,
      messages_over_time: [
        { date: '2026-07-25T00:00:00.000Z', inbound: 3, outbound: 1 },
      ],
      status_distribution: [{ status: 'open', count: 2 }],
    });
  });
});
