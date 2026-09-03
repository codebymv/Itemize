import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    assignConversation,
    createConversation,
    getConversation,
    getConversations,
    markConversationRead,
    resetConversationCapabilities,
    sendMessage,
    updateConversation,
} from './conversationsApi';
import {
    graphqlMutationRequest,
    graphqlRequest,
} from './graphqlClient';

vi.mock('./graphqlClient', () => ({
    graphqlMutationRequest: vi.fn(),
    graphqlRequest: vi.fn(),
}));

const conversation = {
    id: 7,
    organization_id: 42,
    contact_id: 9,
    assigned_to: 3,
    status: 'open' as const,
    channel: 'internal',
    unread_count: 0,
    created_at: '2026-07-24T00:00:00.000Z',
    updated_at: '2026-07-24T00:00:00.000Z',
};

describe('conversations GraphQL adapter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetConversationCapabilities();
    });

    it('maps the GraphQL page into the retained service response', async () => {
        vi.mocked(graphqlRequest).mockResolvedValue({
            conversations: {
                conversations: [conversation],
                page: 2,
                limit: 25,
                total: 26,
                totalPages: 2,
            },
        });

        await expect(getConversations({
            status: 'open',
            assigned_to: 3,
            contact_id: 9,
            page: 2,
            limit: 25,
            organization_id: 42,
        })).resolves.toEqual({
            conversations: [conversation],
            pagination: { page: 2, limit: 25, total: 26, totalPages: 2 },
        });

        expect(graphqlRequest).toHaveBeenCalledWith(
            expect.stringContaining('socialConversationId'),
            {
                status: 'open',
                assignedTo: 3,
                contactId: 9,
                page: 2,
                limit: 25,
            },
            42,
        );
    });

    it('keeps Inbox readable while provider fields roll out with the API', async () => {
        vi.mocked(graphqlRequest)
            .mockRejectedValueOnce(new Error('Cannot query field "socialConversationId" on type "Conversation".'))
            .mockResolvedValueOnce({
                conversations: {
                    conversations: [conversation],
                    page: 1,
                    limit: 50,
                    total: 1,
                    totalPages: 1,
                },
            });

        await expect(getConversations({ organization_id: 42 })).resolves.toEqual({
            conversations: [conversation],
            pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        });
        expect(graphqlRequest).toHaveBeenCalledTimes(2);
        expect(vi.mocked(graphqlRequest).mock.calls[1][0]).not.toContain('socialConversationId');
    });

    it('remembers the successful Inbox list shape instead of probing on every read', async () => {
        vi.mocked(graphqlRequest)
            .mockRejectedValueOnce(new Error('Cannot query field "socialConversationId" on type "Conversation".'))
            .mockResolvedValue({
                conversations: {
                    conversations: [conversation],
                    page: 1,
                    limit: 50,
                    total: 1,
                    totalPages: 1,
                },
            });

        await getConversations({ organization_id: 42 });
        await getConversations({ organization_id: 42 });

        expect(graphqlRequest).toHaveBeenCalledTimes(3);
        expect(vi.mocked(graphqlRequest).mock.calls[2][0]).not.toContain('socialConversationId');
    });

    it('keeps channel filtering usable while the API argument rolls out', async () => {
        vi.mocked(graphqlRequest)
            .mockRejectedValueOnce(new Error('Unknown argument "channel" on field "Query.conversations".'))
            .mockResolvedValueOnce({
                conversations: {
                    conversations: [
                        conversation,
                        { ...conversation, id: 8, channel: 'sms' },
                    ],
                    page: 1,
                    limit: 50,
                    total: 2,
                    totalPages: 1,
                },
            });

        await expect(getConversations({ channel: 'sms', organization_id: 42 }))
            .resolves.toMatchObject({ conversations: [{ id: 8, channel: 'sms' }] });
        expect(graphqlRequest).toHaveBeenCalledTimes(2);
        expect(vi.mocked(graphqlRequest).mock.calls[1][0]).not.toContain('channel: $channel');
    });

    it('uses the complete validation payload to avoid redundant compatibility probes', async () => {
        const compatibilityError = Object.assign(
            new Error('Cannot query field "socialConversationId" on type "Conversation".'),
            {
                messages: [
                    'Cannot query field "socialConversationId" on type "Conversation".',
                    'Unknown argument "channel" on field "Query.conversations".',
                ],
            },
        );
        vi.mocked(graphqlRequest)
            .mockRejectedValueOnce(compatibilityError)
            .mockResolvedValueOnce({
                conversations: {
                    conversations: [conversation],
                    page: 1,
                    limit: 50,
                    total: 1,
                    totalPages: 1,
                },
            });

        await getConversations({ organization_id: 42 });

        expect(graphqlRequest).toHaveBeenCalledTimes(2);
        const fallback = vi.mocked(graphqlRequest).mock.calls[1][0];
        expect(fallback).not.toContain('socialConversationId');
        expect(fallback).not.toContain('channel: $channel');
    });

    it('uses GraphQL for the complete inbox operation surface', async () => {
        vi.mocked(graphqlRequest).mockResolvedValue({
            conversation: { ...conversation, messages: [] },
        });
        vi.mocked(graphqlMutationRequest)
            .mockResolvedValueOnce({ createConversation: conversation })
            .mockResolvedValueOnce({ updateConversation: conversation })
            .mockResolvedValueOnce({ assignConversation: conversation })
            .mockResolvedValueOnce({ markConversationRead: conversation })
            .mockResolvedValueOnce({
                sendConversationMessage: {
                    id: 10,
                    conversation_id: 7,
                    organization_id: 42,
                    sender_type: 'user',
                    channel: 'internal',
                    content: 'Hello',
                    is_read: false,
                    created_at: conversation.created_at,
                },
            });

        await getConversation(7, 42);
        await createConversation({
            contact_id: 9,
            subject: 'Subject',
            initial_message: 'Initial',
            organization_id: 42,
        }, 'conversation-create-key');
        await updateConversation(
            7,
            { status: 'snoozed', snoozed_until: '2026-07-25T00:00:00.000Z' },
            42,
        );
        await assignConversation(7, null, 42);
        await markConversationRead(7, 42);
        await sendMessage(
            7,
            {
                content: 'Hello',
                content_html: '<p>Hello</p>',
                metadata: { source: 'test' },
            },
            42,
        );

        expect(graphqlRequest).toHaveBeenCalledWith(
            expect.stringContaining('query Conversation'),
            { id: 7 },
            42,
        );
        expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining('mutation CreateConversation'),
            {
                idempotencyKey: 'conversation-create-key',
                input: {
                    contactId: 9,
                    subject: 'Subject',
                    initialMessage: 'Initial',
                },
            },
            42,
        );
        expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('mutation UpdateConversation'),
            {
                id: 7,
                input: {
                    status: 'snoozed',
                    snoozedUntil: '2026-07-25T00:00:00.000Z',
                },
            },
            42,
        );
        expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
            3,
            expect.stringContaining('mutation AssignConversation'),
            { id: 7, assignedTo: null },
            42,
        );
        expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
            4,
            expect.stringContaining('mutation MarkConversationRead'),
            { id: 7 },
            42,
        );
        expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
            5,
            expect.stringContaining('mutation SendConversationMessage'),
            {
                conversationId: 7,
                input: {
                    content: 'Hello',
                    contentHtml: '<p>Hello</p>',
                    metadata: { source: 'test' },
                },
            },
            42,
        );
    });

    it('omits the all-status filter and optional empty values', async () => {
        vi.mocked(graphqlRequest).mockResolvedValue({
            conversations: {
                conversations: [],
                page: 1,
                limit: 50,
                total: 0,
                totalPages: 0,
            },
        });
        await getConversations({ status: 'all', organization_id: 42 });
        expect(graphqlRequest).toHaveBeenCalledWith(
            expect.any(String),
            {},
            42,
        );
    });
});
