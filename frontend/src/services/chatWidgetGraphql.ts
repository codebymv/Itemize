import type {
  BusinessHours,
  ChatMessage,
  ChatSession,
  ChatWidgetConfig,
  CustomField,
  EmbedCode,
} from './chatWidgetApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlChatWidget = {
  id: number;
  organizationId: number;
  widgetKey: string;
  name: string;
  primaryColor: string;
  textColor: string;
  position: ChatWidgetConfig['position'];
  iconStyle: string;
  customIconUrl: string | null;
  welcomeTitle: string;
  welcomeMessage: string;
  placeholderText: string;
  requireEmail: boolean;
  requireName: boolean;
  requirePhone: boolean;
  customFields: CustomField[];
  isActive: boolean;
  autoOpenDelay: number;
  showBranding: boolean;
  notificationSound: boolean;
  businessHours: BusinessHours | null;
  offlineMessage: string;
  defaultAssignedTo: number | null;
  autoAssignAvailable: boolean;
  totalConversations: number;
  totalMessages: number;
  allowedDomains: string[];
  createdAt: string;
  updatedAt: string;
};

type GraphqlChatMessage = {
  id: number;
  sessionId: number;
  organizationId: number;
  senderType: ChatMessage['sender_type'];
  senderUserId: number | null;
  content: string;
  contentType: ChatMessage['content_type'];
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentSize: number | null;
  isRead: boolean;
  readAt: string | null;
  agentName: string | null;
  createdAt: string;
};

type GraphqlChatSession = {
  id: number;
  organizationId: number;
  widgetId: number;
  visitorName: string | null;
  visitorEmail: string | null;
  visitorPhone: string | null;
  customData: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  referrerUrl: string | null;
  currentPageUrl: string | null;
  country: string | null;
  city: string | null;
  timezone: string | null;
  contactId: number | null;
  conversationId: number | null;
  status: ChatSession['status'];
  isOnline: boolean;
  lastSeenAt: string;
  startedAt: string;
  endedAt: string | null;
  widgetName: string | null;
  unreadCount: number | null;
  lastMessage: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: GraphqlChatMessage[] | null;
};

const widgetFields = `
  id organizationId widgetKey name primaryColor textColor position iconStyle
  customIconUrl welcomeTitle welcomeMessage placeholderText requireEmail
  requireName requirePhone customFields isActive autoOpenDelay showBranding
  notificationSound businessHours offlineMessage defaultAssignedTo
  autoAssignAvailable totalConversations totalMessages allowedDomains
  createdAt updatedAt
`;

const messageFields = `
  id sessionId organizationId senderType senderUserId content contentType
  attachmentUrl attachmentName attachmentSize isRead readAt agentName createdAt
`;

const sessionFields = `
  id organizationId widgetId visitorName visitorEmail visitorPhone customData
  ipAddress userAgent referrerUrl currentPageUrl country city timezone contactId
  conversationId status isOnline lastSeenAt startedAt endedAt widgetName
  unreadCount lastMessage createdAt updatedAt
`;

const optional = <T>(value: T | null): T | undefined => value ?? undefined;

const mapWidget = (row: GraphqlChatWidget): ChatWidgetConfig => ({
  id: row.id,
  organization_id: row.organizationId,
  widget_key: row.widgetKey,
  name: row.name,
  primary_color: row.primaryColor,
  text_color: row.textColor,
  position: row.position,
  icon_style: row.iconStyle,
  custom_icon_url: optional(row.customIconUrl),
  welcome_title: row.welcomeTitle,
  welcome_message: row.welcomeMessage,
  placeholder_text: row.placeholderText,
  require_email: row.requireEmail,
  require_name: row.requireName,
  require_phone: row.requirePhone,
  custom_fields: row.customFields,
  is_active: row.isActive,
  auto_open_delay: row.autoOpenDelay,
  show_branding: row.showBranding,
  notification_sound: row.notificationSound,
  business_hours: optional(row.businessHours),
  offline_message: row.offlineMessage,
  default_assigned_to: optional(row.defaultAssignedTo),
  auto_assign_available: row.autoAssignAvailable,
  total_conversations: row.totalConversations,
  total_messages: row.totalMessages,
  allowed_domains: row.allowedDomains,
  created_at: row.createdAt,
  updated_at: row.updatedAt,
});

const mapMessage = (row: GraphqlChatMessage): ChatMessage => ({
  id: row.id,
  session_id: row.sessionId,
  organization_id: row.organizationId,
  sender_type: row.senderType,
  sender_user_id: optional(row.senderUserId),
  content: row.content,
  content_type: row.contentType,
  attachment_url: optional(row.attachmentUrl),
  attachment_name: optional(row.attachmentName),
  attachment_size: optional(row.attachmentSize),
  is_read: row.isRead,
  read_at: optional(row.readAt),
  agent_name: optional(row.agentName),
  created_at: row.createdAt,
});

const mapSession = (row: GraphqlChatSession): ChatSession => ({
  id: row.id,
  organization_id: row.organizationId,
  widget_id: row.widgetId,
  visitor_name: optional(row.visitorName),
  visitor_email: optional(row.visitorEmail),
  visitor_phone: optional(row.visitorPhone),
  custom_data: row.customData,
  ip_address: optional(row.ipAddress),
  user_agent: optional(row.userAgent),
  referrer_url: optional(row.referrerUrl),
  current_page_url: optional(row.currentPageUrl),
  country: optional(row.country),
  city: optional(row.city),
  timezone: optional(row.timezone),
  contact_id: optional(row.contactId),
  conversation_id: optional(row.conversationId),
  status: row.status,
  is_online: row.isOnline,
  last_seen_at: row.lastSeenAt,
  started_at: row.startedAt,
  ended_at: optional(row.endedAt),
  widget_name: optional(row.widgetName),
  unread_count: optional(row.unreadCount),
  last_message: optional(row.lastMessage),
  created_at: row.createdAt,
  updated_at: row.updatedAt,
});

const mapConfigInput = (config: Partial<ChatWidgetConfig>) => ({
  ...(config.name === undefined ? {} : { name: config.name }),
  ...(config.primary_color === undefined
    ? {}
    : { primaryColor: config.primary_color }),
  ...(config.text_color === undefined ? {} : { textColor: config.text_color }),
  ...(config.position === undefined ? {} : { position: config.position }),
  ...(config.icon_style === undefined ? {} : { iconStyle: config.icon_style }),
  ...(config.custom_icon_url === undefined
    ? {}
    : { customIconUrl: config.custom_icon_url }),
  ...(config.welcome_title === undefined
    ? {}
    : { welcomeTitle: config.welcome_title }),
  ...(config.welcome_message === undefined
    ? {}
    : { welcomeMessage: config.welcome_message }),
  ...(config.placeholder_text === undefined
    ? {}
    : { placeholderText: config.placeholder_text }),
  ...(config.require_email === undefined
    ? {}
    : { requireEmail: config.require_email }),
  ...(config.require_name === undefined
    ? {}
    : { requireName: config.require_name }),
  ...(config.require_phone === undefined
    ? {}
    : { requirePhone: config.require_phone }),
  ...(config.custom_fields === undefined
    ? {}
    : { customFields: config.custom_fields }),
  ...(config.is_active === undefined ? {} : { isActive: config.is_active }),
  ...(config.auto_open_delay === undefined
    ? {}
    : { autoOpenDelay: config.auto_open_delay }),
  ...(config.show_branding === undefined
    ? {}
    : { showBranding: config.show_branding }),
  ...(config.notification_sound === undefined
    ? {}
    : { notificationSound: config.notification_sound }),
  ...(config.business_hours === undefined
    ? {}
    : { businessHours: config.business_hours }),
  ...(config.offline_message === undefined
    ? {}
    : { offlineMessage: config.offline_message }),
  ...(config.default_assigned_to === undefined
    ? {}
    : { defaultAssignedTo: config.default_assigned_to }),
  ...(config.auto_assign_available === undefined
    ? {}
    : { autoAssignAvailable: config.auto_assign_available }),
  ...(config.allowed_domains === undefined
    ? {}
    : { allowedDomains: config.allowed_domains }),
});

export const getChatWidgetViaGraphql = async (
  organizationId?: number,
): Promise<ChatWidgetConfig | null> => {
  const data = await graphqlRequest<
    { chatWidget: GraphqlChatWidget | null },
    Record<string, never>
  >(`query ChatWidget { chatWidget { ${widgetFields} } }`, {}, organizationId);
  return data.chatWidget ? mapWidget(data.chatWidget) : null;
};

export const createChatWidgetViaGraphql = async (
  config: Partial<ChatWidgetConfig>,
  organizationId?: number,
): Promise<ChatWidgetConfig> => {
  const input = mapConfigInput(config);
  const data = await graphqlMutationRequest<
    { createChatWidget: GraphqlChatWidget },
    { input: typeof input }
  >(
    `mutation CreateChatWidget($input: ChatWidgetConfigInput!) {
      createChatWidget(input: $input) { ${widgetFields} }
    }`,
    { input },
    organizationId,
  );
  return mapWidget(data.createChatWidget);
};

export const updateChatWidgetViaGraphql = async (
  config: Partial<ChatWidgetConfig>,
  organizationId?: number,
): Promise<ChatWidgetConfig> => {
  const input = mapConfigInput(config);
  const data = await graphqlMutationRequest<
    { updateChatWidget: GraphqlChatWidget },
    { input: typeof input }
  >(
    `mutation UpdateChatWidget($input: ChatWidgetConfigInput!) {
      updateChatWidget(input: $input) { ${widgetFields} }
    }`,
    { input },
    organizationId,
  );
  return mapWidget(data.updateChatWidget);
};

export const getChatWidgetEmbedCodeViaGraphql = async (
  organizationId?: number,
): Promise<EmbedCode> => {
  const data = await graphqlRequest<
    { chatWidgetEmbedCode: { widgetKey: string; embedCode: string } },
    Record<string, never>
  >(
    `query ChatWidgetEmbedCode {
      chatWidgetEmbedCode { widgetKey embedCode }
    }`,
    {},
    organizationId,
  );
  return {
    widget_key: data.chatWidgetEmbedCode.widgetKey,
    embed_code: data.chatWidgetEmbedCode.embedCode,
  };
};

export const getChatSessionsViaGraphql = async (
  params: {
    status?: 'active' | 'ended' | 'converted' | 'all';
    page?: number;
    limit?: number;
  },
  organizationId?: number,
): Promise<{
  sessions: ChatSession[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> => {
  const variables = {
    ...(params.status === undefined ? {} : { status: params.status }),
    ...(params.page === undefined ? {} : { page: params.page }),
    ...(params.limit === undefined ? {} : { limit: params.limit }),
  };
  const data = await graphqlRequest<
    {
      chatSessions: {
        sessions: GraphqlChatSession[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    },
    typeof variables
  >(
    `query ChatSessions($status: String, $page: Int, $limit: Int) {
      chatSessions(status: $status, page: $page, limit: $limit) {
        sessions { ${sessionFields} }
        page limit total totalPages
      }
    }`,
    variables,
    organizationId,
  );
  return {
    sessions: data.chatSessions.sessions.map(mapSession),
    pagination: {
      page: data.chatSessions.page,
      limit: data.chatSessions.limit,
      total: data.chatSessions.total,
      totalPages: data.chatSessions.totalPages,
    },
  };
};

export const getChatSessionViaGraphql = async (
  sessionId: number,
  organizationId?: number,
): Promise<ChatSession & { messages: ChatMessage[] }> => {
  const data = await graphqlRequest<
    { chatSession: GraphqlChatSession },
    { sessionId: number }
  >(
    `query ChatSession($sessionId: Int!) {
      chatSession(sessionId: $sessionId) {
        ${sessionFields}
        messages { ${messageFields} }
      }
    }`,
    { sessionId },
    organizationId,
  );
  return {
    ...mapSession(data.chatSession),
    messages: (data.chatSession.messages ?? []).map(mapMessage),
  };
};

export const sendAgentChatMessageViaGraphql = async (
  sessionId: number,
  content: string,
  organizationId?: number,
): Promise<ChatMessage> => {
  const input = { content, idempotencyKey: crypto.randomUUID() };
  const data = await graphqlMutationRequest<
    {
      sendAgentChatMessage: {
        replayed: boolean;
        message: GraphqlChatMessage;
      };
    },
    { sessionId: number; input: typeof input }
  >(
    `mutation SendAgentChatMessage(
      $sessionId: Int!
      $input: SendAgentChatMessageInput!
    ) {
      sendAgentChatMessage(sessionId: $sessionId, input: $input) {
        replayed
        message { ${messageFields} }
      }
    }`,
    { sessionId, input },
    organizationId,
  );
  return mapMessage(data.sendAgentChatMessage.message);
};

export const convertChatSessionViaGraphql = async (
  sessionId: number,
  organizationId?: number,
): Promise<{ success: boolean; contact_id: number; conversation_id: number }> => {
  const data = await graphqlMutationRequest<
    {
      convertChatSession: {
        success: boolean;
        contactId: number;
        conversationId: number;
      };
    },
    { sessionId: number }
  >(
    `mutation ConvertChatSession($sessionId: Int!) {
      convertChatSession(sessionId: $sessionId) {
        success contactId conversationId
      }
    }`,
    { sessionId },
    organizationId,
  );
  return {
    success: data.convertChatSession.success,
    contact_id: data.convertChatSession.contactId,
    conversation_id: data.convertChatSession.conversationId,
  };
};
