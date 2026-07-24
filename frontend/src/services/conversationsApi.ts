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
    assigned_to?: number;
    contact_id?: number;
    page?: number;
    limit?: number;
    organization_id?: number;
}

const CONVERSATION_FIELDS = `
    fragment ConversationFields on Conversation {
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
    }
`;

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

export const getConversations = async (
    params: ConversationsQueryParams = {}
): Promise<ConversationsResponse> => {
    const data = await graphqlRequest<{
        conversations: {
            conversations: Conversation[];
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }, {
        status?: string;
        assignedTo?: number;
        contactId?: number;
        page?: number;
        limit?: number;
    }>(
        `
            ${CONVERSATION_FIELDS}
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
        `,
        {
            ...(params.status && params.status !== 'all'
                ? { status: params.status }
                : {}),
            ...(params.assigned_to === undefined
                ? {}
                : { assignedTo: params.assigned_to }),
            ...(params.contact_id === undefined
                ? {}
                : { contactId: params.contact_id }),
            ...(params.page === undefined ? {} : { page: params.page }),
            ...(params.limit === undefined ? {} : { limit: params.limit }),
        },
        params.organization_id,
    );
    const { conversations, page, limit, total, totalPages } = data.conversations;
    return {
        conversations,
        pagination: { page, limit, total, totalPages },
    };
};

export const getConversation = async (
    id: number,
    organizationId?: number
): Promise<Conversation> => {
    const data = await graphqlRequest<{ conversation: Conversation }, { id: number }>(
        `
            ${CONVERSATION_FIELDS}
            ${MESSAGE_FIELDS}
            query Conversation($id: Int!) {
                conversation(id: $id) {
                    ...ConversationFields
                    messages { ...ConversationMessageFields }
                }
            }
        `,
        { id },
        organizationId,
    );
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
            ${CONVERSATION_FIELDS}
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
            ${CONVERSATION_FIELDS}
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
            ${CONVERSATION_FIELDS}
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
            ${CONVERSATION_FIELDS}
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
