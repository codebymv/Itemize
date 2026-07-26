import api from '@/lib/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disconnectChannel,
  getChannels,
  getConversation,
  getConversations,
  getFacebookConnectUrl,
  getSocialAnalytics,
  sendMessage,
  updateConversation,
} from './socialApi';
import {
  disconnectSocialChannelViaGraphql,
  getSocialAnalyticsViaGraphql,
  getSocialChannelsViaGraphql,
  getSocialConversationsViaGraphql,
  openSocialConversationViaGraphql,
  sendSocialMessageViaGraphql,
  updateSocialConversationViaGraphql,
} from './socialGraphql';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./socialGraphql', () => ({
  getSocialChannelsViaGraphql: vi.fn(),
  disconnectSocialChannelViaGraphql: vi.fn(),
  getSocialConversationsViaGraphql: vi.fn(),
  openSocialConversationViaGraphql: vi.fn(),
  updateSocialConversationViaGraphql: vi.fn(),
  sendSocialMessageViaGraphql: vi.fn(),
  getSocialAnalyticsViaGraphql: vi.fn(),
}));

describe('Social transport boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retains only OAuth initiation on HTTP', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { auth_url: 'https://facebook.example/oauth' },
    });
    await expect(getFacebookConnectUrl(3)).resolves.toEqual({
      auth_url: 'https://facebook.example/oauth',
    });
    expect(api.get).toHaveBeenCalledWith('/api/social/connect/facebook', {
      headers: { 'x-organization-id': '3' },
    });
  });

  it('routes the complete authenticated application surface through GraphQL', async () => {
    vi.mocked(getSocialChannelsViaGraphql).mockResolvedValue([]);
    vi.mocked(disconnectSocialChannelViaGraphql).mockResolvedValue({
      success: true,
    });
    vi.mocked(getSocialConversationsViaGraphql).mockResolvedValue({
      conversations: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    vi.mocked(openSocialConversationViaGraphql).mockResolvedValue({ id: 9 } as never);
    vi.mocked(updateSocialConversationViaGraphql).mockResolvedValue({ id: 9 } as never);
    vi.mocked(sendSocialMessageViaGraphql).mockResolvedValue({ id: 12 } as never);
    vi.mocked(getSocialAnalyticsViaGraphql).mockResolvedValue({
      period: 7,
      channels: [],
      messages_over_time: [],
      status_distribution: [],
    });

    await getChannels({ channel_type: 'facebook' }, 3);
    await disconnectChannel(4, 3);
    await getConversations({ status: 'open' }, 3);
    await getConversation(9, 3);
    await updateConversation(9, { status: 'closed' }, 3);
    await sendMessage(9, 'Hello', 3);
    await getSocialAnalytics(7, 3);

    expect(getSocialChannelsViaGraphql).toHaveBeenCalledWith('facebook', 3);
    expect(disconnectSocialChannelViaGraphql).toHaveBeenCalledWith(4, 3);
    expect(getSocialConversationsViaGraphql).toHaveBeenCalledWith(
      { status: 'open' },
      3,
    );
    expect(openSocialConversationViaGraphql).toHaveBeenCalledWith(9, 3);
    expect(updateSocialConversationViaGraphql).toHaveBeenCalledWith(
      9,
      { status: 'closed' },
      3,
    );
    expect(sendSocialMessageViaGraphql).toHaveBeenCalledWith(9, 'Hello', 3);
    expect(getSocialAnalyticsViaGraphql).toHaveBeenCalledWith(7, 3);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
