/**
 * GraphQL adapter for the authenticated unified inbox.
 *
 * The public service contract remains snake_case so existing page components
 * do not need transport-specific data transformations.
 */
import { Conversation, ConversationsResponse, Message } from '@/types';
import {
    graphqlMutationRequest,
    graphqlRequest,
} from '@/services/graphqlClient';

export interface ConversationsQueryParams {
    status?: 'open' | 'closed' | 'snoozed' | 'all';
    channel?: 'email' | 'sms' | 'chat' | 'facebook' | 'instagram' | 'internal' | 'all';
    assigned_to?: number;
    contact_id?: number;
    page?: number;
    limit?: number;
    organization_id?: number;
}

const BASE_CONVERSATION_FIELD_SELECTION = `
        id
        organization_id: organizationId
        contact_id: contactId
        assigned_to: assignedTo
        assigned_to_name: assignedToName
        status
        snoozed_until: snoozedUntil
        channel
        subject
        last_message_at: lastMessageAt
        last_message_preview: lastMessagePreview
        unread_count: unreadCount
        created_at: createdAt
        updated_at: updatedAt
        contact_first_name: contactFirstName
        contact_last_name: contactLastName
        contact_email: contactEmail
        contact_phone: contactPhone
`;

const PROVIDER_CONVERSATION_FIELD_SELECTION = `
        ${BASE_CONVERSATION_FIELD_SELECTION}
        social_conversation_id: socialConversationId
        provider_account_name: providerAccountName
        provider_participant_name: providerParticipantName
        provider_participant_username: providerParticipantUsername
        provider_participant_profile_pic: providerParticipantProfilePic
        chat_session_id: chatSessionId
        chat_session_status: chatSessionStatus
        chat_visitor_name: chatVisitorName
        chat_visitor_email: chatVisitorEmail
        chat_visitor_phone: chatVisitorPhone
        chat_widget_name: chatWidgetName
`;

const BASE_CONVERSATION_FIELDS = `
    fragment ConversationFields on Conversation {
        ${BASE_CONVERSATION_FIELD_SELECTION}
    }
`;

const PROVIDER_CONVERSATION_FIELDS = `
    fragment ConversationFields on Conversation {
        ${PROVIDER_CONVERSATION_FIELD_SELECTION}
    }
`;

const providerFieldsUnavailable = (error: unknown): boolean =>
    error instanceof Error
    && /Cannot query field "(?:socialConversationId|providerAccountName|providerParticipantName|providerParticipantUsername|providerParticipantProfilePic|chatSessionId|chatSessionStatus|chatVisitorName|chatVisitorEmail|chatVisitorPhone|chatWidgetName)"/.test(error.message);

const channelFilterUnavailable = (error: unknown): boolean =>
    error instanceof Error
    && /Unknown argument "channel"|Unknown type "ConversationChannel"/.test(error.message);

const MESSAGE_FIELDS = `
    fragment ConversationMessageFields on ConversationMessage {
        id
        conversation_id: conversationId
        organization_id: organizationId
        sender_type: senderType
        sender_user_id: senderUserId
        sender_contact_id: senderContactId
        sender_user_name: senderUserName
        sender_contact_first_name: senderContactFirstName
        sender_contact_last_name: senderContactLastName
        channel
        content
        content_html: contentHtml
        metadata
        is_read: isRead
        created_at: createdAt
    }
`;

const providerConversationsWithChannelQuery = `
    ${PROVIDER_CONVERSATION_FIELDS}
    query Conversations(
        $status: String
        $channel: String
        $assignedTo: Int
        $contactId: Int
        $page: Int
        $limit: Int
    ) {
        conversations(
            status: $status
            channel: $channel
            assignedTo: $assignedTo
            contactId: $contactId
            page: $page
            limit: $limit
        ) {
            conversations { ...ConversationFields }
            page
            limit
            total
            totalPages
        }
    }
`;

const baseConversationsWithChannelQuery = `
    ${BASE_CONVERSATION_FIELDS}
    query Conversations(
        $status: String
        $channel: String
        $assignedTo: Int
        $contactId: Int
        $page: Int
        $limit: Int
    ) {
        conversations(
            status: $status
            channel: $channel
            assignedTo: $assignedTo
            contactId: $contactId
            page: $page
            limit: $limit
        ) {
            conversations { ...ConversationFields }
            page
            limit
            total
            totalPages
        }
    }
`;

const providerConversationsWithoutChannelQuery = `
    ${PROVIDER_CONVERSATION_FIELDS}
    query Conversations(
        $status: String
        $assignedTo: Int
        $contactId: Int
        $page: Int
        $limit: Int
    ) {
        conversations(
            status: $status
            assignedTo: $assignedTo
            contactId: $contactId
            page: $page
            limit: $limit
        ) {
            conversations { ...ConversationFields }
            page
            limit
            total
            totalPages
        }
    }
`;

const baseConversationsWithoutChannelQuery = `
    ${BASE_CONVERSATION_FIELDS}
    query Conversations(
        $status: String
        $assignedTo: Int
        $contactId: Int
        $page: Int
        $limit: Int
    ) {
        conversations(
            status: $status
            assignedTo: $assignedTo
            contactId: $contactId
            page: $page
            limit: $limit
        ) {
            conversations { ...ConversationFields }
            page
            limit
            total
            totalPages
        }
    }
`;

const providerConversationQuery = `
    ${PROVIDER_CONVERSATION_FIELDS}
    ${MESSAGE_FIELDS}
    query Conversation($id: Int!) {
        conversation(id: $id) {
            ...ConversationFields
            messages { ...ConversationMessageFields }
        }
    }
`;

const baseConversationQuery = `
    ${BASE_CONVERSATION_FIELDS}
    ${MESSAGE_FIELDS}
    query Conversation($id: Int!) {
        conversation(id: $id) {
            ...ConversationFields
            messages { ...ConversationMessageFields }
        }
    }
`;

const conversationListDocuments = [
    { document: providerConversationsWithChannelQuery, includesChannel: true },
    { document: baseConversationsWithChannelQuery, includesChannel: true },
    { document: providerConversationsWithoutChannelQuery, includesChannel: false },
    { document: baseConversationsWithoutChannelQuery, includesChannel: false },
] as const;

let conversationListCapability: number | null = null;
let conversationDetailCapability: 'provider' | 'base' | null = null;

/** Test-only reset for the process-local schema capability memory. */
export const resetConversationCapabilities = () => {
    conversationListCapability = null;
    conversationDetailCapability = null;
};

export const getConversations = async (
    params: ConversationsQueryParams = {}
): Promise<ConversationsResponse> => {
    type Response = {
        conversations: {
            conversations: Conversation[];
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    };
    type Variables = {
        status?: string;
        channel?: string;
        assignedTo?: number;
        contactId?: number;
        page?: number;
        limit?: number;
    };
    const variables: Variables = {
        ...(params.status && params.status !== 'all'
            ? { status: params.status }
            : {}),
        ...(params.channel && params.channel !== 'all'
            ? { channel: params.channel }
            : {}),
        ...(params.assigned_to === undefined
            ? {}
            : { assignedTo: params.assigned_to }),
        ...(params.contact_id === undefined
            ? {}
            : { contactId: params.contact_id }),
        ...(params.page === undefined ? {} : { page: params.page }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
    };
    let data: Response | null = null;
    let lastError: unknown;
    let serverAppliedChannel = true;
    const capabilityOrder = conversationListCapability === null
        ? conversationListDocuments.map((_, index) => index)
        : [
            conversationListCapability,
            ...conversationListDocuments
                .map((_, index) => index)
                .filter((index) => index !== conversationListCapability),
        ];
    for (const capabilityIndex of capabilityOrder) {
        const capability = conversationListDocuments[capabilityIndex];
        const requestVariables = capability.includesChannel
            ? variables
            : Object.fromEntries(
                Object.entries(variables).filter(([key]) => key !== 'channel'),
            ) as Variables;
        try {
            data = await graphqlRequest<Response, Variables>(
                capability.document,
                requestVariables,
                params.organization_id,
            );
            conversationListCapability = capabilityIndex;
            serverAppliedChannel = capability.includesChannel;
            break;
        } catch (error) {
            if (!providerFieldsUnavailable(error) && !channelFilterUnavailable(error)) throw error;
            lastError = error;
        }
    }
    if (!data) throw lastError;
    const { conversations, page, limit, total, totalPages } = data.conversations;
    const visibleConversations = !serverAppliedChannel && params.channel && params.channel !== 'all'
        ? conversations.filter(conversation => conversation.channel === params.channel)
        : conversations;
    return {
        conversations: visibleConversations,
        pagination: { page, limit, total, totalPages },
    };
};

export const getConversation = async (
    id: number,
    organizationId?: number
): Promise<Conversation> => {
    const requestConversation = (document: string) => graphqlRequest<
        { conversation: Conversation },
        { id: number }
    >(document, { id }, organizationId);
    const documents = conversationDetailCapability === 'base'
        ? [baseConversationQuery]
        : [providerConversationQuery, baseConversationQuery];
    let data: { conversation: Conversation } | null = null;
    let lastError: unknown;
    for (const document of documents) {
        try {
            data = await requestConversation(document);
            conversationDetailCapability = document === providerConversationQuery
                ? 'provider'
                : 'base';
            break;
        } catch (error) {
            if (!providerFieldsUnavailable(error)) throw error;
            lastError = error;
        }
    }
    if (!data) throw lastError;
    return data.conversation;
};

export interface CreateConversationData {
    contact_id: number;
    subject?: string;
    channel?: string;
    initial_message?: string;
    organization_id?: number;
}

export const createConversation = async (
    input: CreateConversationData
): Promise<Conversation> => {
    const data = await graphqlMutationRequest<
        { createConversation: Conversation },
        {
            input: {
                contactId: number;
                subject?: string;
                channel?: string;
                initialMessage?: string;
            };
        }
    >(
        `
            ${BASE_CONVERSATION_FIELDS}
            mutation CreateConversation($input: CreateConversationInput!) {
                createConversation(input: $input) { ...ConversationFields }
            }
        `,
        {
            input: {
                contactId: input.contact_id,
                ...(input.subject === undefined ? {} : { subject: input.subject }),
                ...(input.channel === undefined ? {} : { channel: input.channel }),
                ...(input.initial_message === undefined
                    ? {}
                    : { initialMessage: input.initial_message }),
            },
        },
        input.organization_id,
    );
    return data.createConversation;
};

export const updateConversation = async (
    id: number,
    input: { status?: string; snoozed_until?: string },
    organizationId?: number
): Promise<Conversation> => {
    const data = await graphqlMutationRequest<
        { updateConversation: Conversation },
        {
            id: number;
            input: { status?: string; snoozedUntil?: string };
        }
    >(
        `
            ${BASE_CONVERSATION_FIELDS}
            mutation UpdateConversation($id: Int!, $input: UpdateConversationInput!) {
                updateConversation(id: $id, input: $input) { ...ConversationFields }
            }
        `,
        {
            id,
            input: {
                ...(input.status === undefined ? {} : { status: input.status }),
                ...(input.snoozed_until === undefined
                    ? {}
                    : { snoozedUntil: input.snoozed_until }),
            },
        },
        organizationId,
    );
    return data.updateConversation;
};

export const assignConversation = async (
    id: number,
    assignedTo: number | null,
    organizationId?: number
): Promise<Conversation> => {
    const data = await graphqlMutationRequest<
        { assignConversation: Conversation },
        { id: number; assignedTo: number | null }
    >(
        `
            ${BASE_CONVERSATION_FIELDS}
            mutation AssignConversation($id: Int!, $assignedTo: Int) {
                assignConversation(id: $id, assignedTo: $assignedTo) {
                    ...ConversationFields
                }
            }
        `,
        { id, assignedTo },
        organizationId,
    );
    return data.assignConversation;
};

export const markConversationRead = async (
    id: number,
    organizationId?: number
): Promise<Conversation> => {
    const data = await graphqlMutationRequest<
        { markConversationRead: Conversation },
        { id: number }
    >(
        `
            ${BASE_CONVERSATION_FIELDS}
            mutation MarkConversationRead($id: Int!) {
                markConversationRead(id: $id) { ...ConversationFields }
            }
        `,
        { id },
        organizationId,
    );
    return data.markConversationRead;
};

export interface SendMessageData {
    content: string;
    channel?: string;
    content_html?: string;
    metadata?: Record<string, unknown>;
}

export const sendMessage = async (
    conversationId: number,
    input: SendMessageData,
    organizationId?: number
): Promise<Message> => {
    const data = await graphqlMutationRequest<
        { sendConversationMessage: Message },
        {
            conversationId: number;
            input: {
                content: string;
                channel?: string;
                contentHtml?: string;
                metadata?: Record<string, unknown>;
            };
        }
    >(
        `
            ${MESSAGE_FIELDS}
            mutation SendConversationMessage(
                $conversationId: Int!
                $input: SendConversationMessageInput!
            ) {
                sendConversationMessage(
                    conversationId: $conversationId
                    input: $input
                ) {
                    ...ConversationMessageFields
                }
            }
        `,
        {
            conversationId,
            input: {
                content: input.content,
                ...(input.channel === undefined ? {} : { channel: input.channel }),
                ...(input.content_html === undefined
                    ? {}
                    : { contentHtml: input.content_html }),
                ...(input.metadata === undefined
                    ? {}
                    : { metadata: input.metadata }),
            },
        },
        organizationId,
    );
    return data.sendConversationMessage;
};

export default {
    getConversations,
    getConversation,
    createConversation,
    updateConversation,
    assignConversation,
    markConversationRead,
    sendMessage,
};
