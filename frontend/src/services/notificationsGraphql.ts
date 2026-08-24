import { graphqlMutationRequest, graphqlRequest } from '@/services/graphqlClient';

export type AppNotification = {
  id: string;
  eventType: string;
  category: string;
  priority: string;
  title: string;
  body: string;
  href: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
  seenAt: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPage = {
  nodes: AppNotification[];
  pageInfo: {
    endCursor: string | null;
    hasNextPage: boolean;
  };
  unreadCount: number;
  unseenCount: number;
};

const NOTIFICATIONS_QUERY = `
  query NotificationCenter($first: Int!, $after: String, $unreadOnly: Boolean!) {
    notificationsCenter(first: $first, after: $after, unreadOnly: $unreadOnly) {
      nodes {
        id
        eventType
        category
        priority
        title
        body
        href
        entityType
        entityId
        payload
        occurredAt
        seenAt
        readAt
        createdAt
      }
      pageInfo { endCursor hasNextPage }
      unreadCount
      unseenCount
    }
  }
`;

const MARK_SEEN_MUTATION = `
  mutation MarkNotificationsSeen {
    markNotificationsSeen
  }
`;

const MARK_READ_MUTATION = `
  mutation MarkNotificationRead($notificationId: ID!) {
    markNotificationRead(notificationId: $notificationId)
  }
`;

const MARK_ALL_READ_MUTATION = `
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;

export async function getNotifications(
  organizationId: number,
  options: { first?: number; after?: string | null; unreadOnly?: boolean } = {},
): Promise<NotificationPage> {
  const data = await graphqlRequest<
    { notificationsCenter: NotificationPage },
    { first: number; after?: string; unreadOnly: boolean }
  >(
    NOTIFICATIONS_QUERY,
    {
      first: options.first ?? 25,
      ...(options.after ? { after: options.after } : {}),
      unreadOnly: Boolean(options.unreadOnly),
    },
    organizationId,
  );
  return data.notificationsCenter;
}

export async function markNotificationsSeen(organizationId: number): Promise<number> {
  const data = await graphqlMutationRequest<
    { markNotificationsSeen: number },
    Record<string, never>
  >(MARK_SEEN_MUTATION, {}, organizationId);
  return data.markNotificationsSeen;
}

export async function markNotificationRead(
  organizationId: number,
  notificationId: string,
): Promise<boolean> {
  const data = await graphqlMutationRequest<
    { markNotificationRead: boolean },
    { notificationId: string }
  >(MARK_READ_MUTATION, { notificationId }, organizationId);
  return data.markNotificationRead;
}

export async function markAllNotificationsRead(organizationId: number): Promise<number> {
  const data = await graphqlMutationRequest<
    { markAllNotificationsRead: number },
    Record<string, never>
  >(MARK_ALL_READ_MUTATION, {}, organizationId);
  return data.markAllNotificationsRead;
}
