import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsSeen,
} from './notificationsGraphql';

vi.mock('./graphqlClient', () => ({
  graphqlMutationRequest: vi.fn(),
  graphqlRequest: vi.fn(),
}));

describe('notification GraphQL adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads a tenant-scoped cursor page', async () => {
    const page = {
      nodes: [],
      pageInfo: { endCursor: 'next', hasNextPage: true },
      unreadCount: 2,
      unseenCount: 1,
    };
    vi.mocked(graphqlRequest).mockResolvedValue({ notificationsCenter: page });
    await expect(getNotifications(4, {
      first: 25,
      after: 'cursor',
      unreadOnly: true,
    })).resolves.toEqual(page);
    expect(vi.mocked(graphqlRequest).mock.calls[0][1]).toEqual({
      first: 25,
      after: 'cursor',
      unreadOnly: true,
    });
    expect(vi.mocked(graphqlRequest).mock.calls[0][2]).toBe(4);
  });

  it('uses CSRF-protected mutations for seen and read state', async () => {
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({ markNotificationsSeen: 3 })
      .mockResolvedValueOnce({ markNotificationRead: true })
      .mockResolvedValueOnce({ markAllNotificationsRead: 4 });

    await expect(markNotificationsSeen(4)).resolves.toBe(3);
    await expect(markNotificationRead(4, '42')).resolves.toBe(true);
    await expect(markAllNotificationsRead(4)).resolves.toBe(4);
    expect(vi.mocked(graphqlMutationRequest).mock.calls[1][1])
      .toEqual({ notificationId: '42' });
    expect(vi.mocked(graphqlMutationRequest).mock.calls[1][2]).toBe(4);
  });
});
