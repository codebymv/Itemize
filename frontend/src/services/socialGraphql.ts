import type {
  SocialAnalytics,
  SocialChannel,
  SocialConversation,
  SocialMessage,
} from './socialApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlSocialChannel = {
  id: number;
  organizationId: number;
  channelType: SocialChannel['channel_type'];
  externalId: string;
  name: string;
  username: string | null;
  profilePictureUrl: string | null;
  pageId: string | null;
  instagramBusinessAccountId: string | null;
  permissions: string[];
  isActive: boolean;
  isConnected: boolean;
  connectionError: string | null;
  lastSyncedAt: string | null;
  webhookVerified: boolean;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

type GraphqlSocialMessage = {
  id: number;
  organizationId: number;
  conversationId: number;
  channelId: number;
  externalMessageId: string | null;
  messageType: SocialMessage['message_type'];
  textContent: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaFilename: string | null;
  direction: SocialMessage['direction'];
  senderId: string | null;
  senderName: string | null;
  sentBy: number | null;
  sentByName: string | null;
  status: SocialMessage['status'];
  errorMessage: string | null;
  messageTimestamp: string;
  readAt: string | null;
  createdAt: string;
};

type GraphqlSocialConversation = {
  id: number;
  organizationId: number;
  channelId: number;
  threadId: string | null;
  participantId: string;
  participantName: string | null;
  participantUsername: string | null;
  participantProfilePic: string | null;
  contactId: number | null;
  status: SocialConversation['status'];
  assignedTo: number | null;
  assignedToName: string | null;
  unreadCount: number;
  messageCount: number;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  lastMessageFrom: string | null;
  tags: string[];
  channelType: SocialChannel['channel_type'];
  channelName: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: GraphqlSocialMessage[] | null;
};

const channelFields = `
  id organizationId channelType externalId name username profilePictureUrl
  pageId instagramBusinessAccountId permissions isActive isConnected
  connectionError lastSyncedAt webhookVerified createdBy createdByName
  createdAt updatedAt
`;

const messageFields = `
  id organizationId conversationId channelId externalMessageId messageType
  textContent mediaUrl mediaType mediaFilename direction senderId senderName
  sentBy sentByName status errorMessage messageTimestamp readAt createdAt
`;

const conversationFields = `
  id organizationId channelId threadId participantId participantName
  participantUsername participantProfilePic contactId status assignedTo
  assignedToName unreadCount messageCount lastMessageText lastMessageAt
  lastMessageFrom tags channelType channelName contactFirstName contactLastName
  contactEmail createdAt updatedAt
`;

const optional = <T>(value: T | null): T | undefined => value ?? undefined;

const mapChannel = (row: GraphqlSocialChannel): SocialChannel => ({
  id: row.id,
  organization_id: row.organizationId,
  channel_type: row.channelType,
  external_id: row.externalId,
  name: row.name,
  username: optional(row.username),
  profile_picture_url: optional(row.profilePictureUrl),
  page_id: optional(row.pageId),
  instagram_business_account_id: optional(row.instagramBusinessAccountId),
  permissions: row.permissions,
  is_active: row.isActive,
  is_connected: row.isConnected,
  connection_error: optional(row.connectionError),
  last_synced_at: optional(row.lastSyncedAt),
  webhook_verified: row.webhookVerified,
  created_by: optional(row.createdBy),
  created_by_name: optional(row.createdByName),
  created_at: row.createdAt,
  updated_at: row.updatedAt,
});

const mapMessage = (row: GraphqlSocialMessage): SocialMessage => ({
  id: row.id,
  organization_id: row.organizationId,
  conversation_id: row.conversationId,
  channel_id: row.channelId,
  external_message_id: optional(row.externalMessageId),
  message_type: row.messageType,
  text_content: optional(row.textContent),
  media_url: optional(row.mediaUrl),
  media_type: optional(row.mediaType),
  media_filename: optional(row.mediaFilename),
  direction: row.direction,
  sender_id: optional(row.senderId),
  sender_name: optional(row.senderName),
  sent_by: optional(row.sentBy),
  sent_by_name: optional(row.sentByName),
  status: row.status,
  error_message: optional(row.errorMessage),
  message_timestamp: row.messageTimestamp,
  read_at: optional(row.readAt),
  created_at: row.createdAt,
});

const mapConversation = (
  row: GraphqlSocialConversation,
): SocialConversation => ({
  id: row.id,
  organization_id: row.organizationId,
  channel_id: row.channelId,
  thread_id: optional(row.threadId),
  participant_id: row.participantId,
  participant_name: optional(row.participantName),
  participant_username: optional(row.participantUsername),
  participant_profile_pic: optional(row.participantProfilePic),
  contact_id: optional(row.contactId),
  status: row.status,
  assigned_to: optional(row.assignedTo),
  unread_count: row.unreadCount,
  message_count: row.messageCount,
  last_message_text: optional(row.lastMessageText),
  last_message_at: optional(row.lastMessageAt),
  last_message_from: optional(row.lastMessageFrom),
  tags: row.tags,
  created_at: row.createdAt,
  updated_at: row.updatedAt,
  channel_type: row.channelType,
  channel_name: row.channelName,
  contact_first_name: optional(row.contactFirstName),
  contact_last_name: optional(row.contactLastName),
  assigned_to_name: optional(row.assignedToName),
  messages: row.messages?.map(mapMessage),
});

export const getSocialChannelsViaGraphql = async (
  channelType?: SocialChannel['channel_type'],
  organizationId?: number,
): Promise<SocialChannel[]> => {
  const data = await graphqlRequest<
    { socialChannels: GraphqlSocialChannel[] },
    { channelType?: string }
  >(
    `query SocialChannels($channelType: String) {
      socialChannels(channelType: $channelType) { ${channelFields} }
    }`,
    { ...(channelType ? { channelType } : {}) },
    organizationId,
  );
  return data.socialChannels.map(mapChannel);
};

export const disconnectSocialChannelViaGraphql = async (
  channelId: number,
  organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<
    { disconnectSocialChannel: { success: boolean } },
    { channelId: number }
  >(
    `mutation DisconnectSocialChannel($channelId: Int!) {
      disconnectSocialChannel(channelId: $channelId) { success }
    }`,
    { channelId },
    organizationId,
  );
  return data.disconnectSocialChannel;
};

export const getSocialConversationsViaGraphql = async (
  params: {
    channel_id?: number;
    channel_type?: SocialChannel['channel_type'];
    status?: SocialConversation['status'] | 'all';
    assigned_to?: number;
    page?: number;
    limit?: number;
  },
  organizationId?: number,
): Promise<{
  conversations: SocialConversation[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> => {
  const variables = {
    ...(params.channel_id === undefined ? {} : { channelId: params.channel_id }),
    ...(params.channel_type === undefined
      ? {}
      : { channelType: params.channel_type }),
    ...(params.status === undefined ? {} : { status: params.status }),
    ...(params.assigned_to === undefined
      ? {}
      : { assignedTo: params.assigned_to }),
    ...(params.page === undefined ? {} : { page: params.page }),
    ...(params.limit === undefined ? {} : { limit: params.limit }),
  };
  const data = await graphqlRequest<
    {
      socialConversations: {
        conversations: GraphqlSocialConversation[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    },
    typeof variables
  >(
    `query SocialConversations(
      $channelId: Int
      $channelType: String
      $status: String
      $assignedTo: Int
      $page: Int
      $limit: Int
    ) {
      socialConversations(
        channelId: $channelId
        channelType: $channelType
        status: $status
        assignedTo: $assignedTo
        page: $page
        limit: $limit
      ) {
        conversations { ${conversationFields} }
        page limit total totalPages
      }
    }`,
    variables,
    organizationId,
  );
  const page = data.socialConversations;
  return {
    conversations: page.conversations.map(mapConversation),
    pagination: {
      page: page.page,
      limit: page.limit,
      total: page.total,
      totalPages: page.totalPages,
    },
  };
};

export const openSocialConversationViaGraphql = async (
  conversationId: number,
  organizationId?: number,
): Promise<SocialConversation> => {
  const data = await graphqlMutationRequest<
    { openSocialConversation: GraphqlSocialConversation },
    { conversationId: number }
  >(
    `mutation OpenSocialConversation($conversationId: Int!) {
      openSocialConversation(conversationId: $conversationId) {
        ${conversationFields}
        messages { ${messageFields} }
      }
    }`,
    { conversationId },
    organizationId,
  );
  return mapConversation(data.openSocialConversation);
};

export const updateSocialConversationViaGraphql = async (
  conversationId: number,
  update: Partial<
    Pick<SocialConversation, 'status' | 'assigned_to' | 'contact_id' | 'tags'>
  >,
  organizationId?: number,
): Promise<SocialConversation> => {
  const input = {
    ...(!Object.prototype.hasOwnProperty.call(update, 'status')
      ? {}
      : { status: update.status }),
    ...(!Object.prototype.hasOwnProperty.call(update, 'assigned_to')
      ? {}
      : { assignedTo: update.assigned_to ?? null }),
    ...(!Object.prototype.hasOwnProperty.call(update, 'contact_id')
      ? {}
      : { contactId: update.contact_id ?? null }),
    ...(!Object.prototype.hasOwnProperty.call(update, 'tags')
      ? {}
      : { tags: update.tags ?? [] }),
  };
  const data = await graphqlMutationRequest<
    { updateSocialConversation: GraphqlSocialConversation },
    { conversationId: number; input: typeof input }
  >(
    `mutation UpdateSocialConversation(
      $conversationId: Int!
      $input: UpdateSocialConversationInput!
    ) {
      updateSocialConversation(conversationId: $conversationId, input: $input) {
        ${conversationFields}
      }
    }`,
    { conversationId, input },
    organizationId,
  );
  return mapConversation(data.updateSocialConversation);
};

export const sendSocialMessageViaGraphql = async (
  conversationId: number,
  text: string,
  organizationId?: number,
  idempotencyKey?: string,
): Promise<SocialMessage> => {
  const data = await graphqlMutationRequest<
    { sendSocialMessage: { message: GraphqlSocialMessage } },
    {
      conversationId: number;
      input: { text: string; idempotencyKey: string };
    }
  >(
    `mutation SendSocialMessage(
      $conversationId: Int!
      $input: SendSocialMessageInput!
    ) {
      sendSocialMessage(conversationId: $conversationId, input: $input) {
        message { ${messageFields} }
      }
    }`,
    {
      conversationId,
      input: {
        text,
        idempotencyKey:
          idempotencyKey ??
          globalThis.crypto?.randomUUID?.() ??
          `social-message-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    },
    organizationId,
  );
  return mapMessage(data.sendSocialMessage.message);
};

export const getSocialAnalyticsViaGraphql = async (
  period: number,
  organizationId?: number,
): Promise<SocialAnalytics> => {
  const data = await graphqlRequest<
    {
      socialAnalytics: {
        period: number;
        channels: Array<{
          channelType: string;
          conversationCount: number;
          messageCount: number;
          inboundCount: number;
          outboundCount: number;
        }>;
        averageResponseTimeMinutes: number | null;
        messagesOverTime: Array<{
          date: string;
          inbound: number;
          outbound: number;
        }>;
        statusDistribution: Array<{ status: string; count: number }>;
      };
    },
    { period: number }
  >(
    `query SocialAnalytics($period: Int!) {
      socialAnalytics(period: $period) {
        period
        channels {
          channelType conversationCount messageCount inboundCount outboundCount
        }
        averageResponseTimeMinutes
        messagesOverTime { date inbound outbound }
        statusDistribution { status count }
      }
    }`,
    { period },
    organizationId,
  );
  const analytics = data.socialAnalytics;
  return {
    period: analytics.period,
    channels: analytics.channels.map((row) => ({
      channel_type: row.channelType,
      conversation_count: row.conversationCount,
      message_count: row.messageCount,
      inbound_count: row.inboundCount,
      outbound_count: row.outboundCount,
    })),
    avg_response_time_minutes:
      analytics.averageResponseTimeMinutes ?? undefined,
    messages_over_time: analytics.messagesOverTime,
    status_distribution: analytics.statusDistribution,
  };
};
