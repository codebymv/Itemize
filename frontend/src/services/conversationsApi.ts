/**
 * Conversations API Service
 */
import api from '@/lib/api';
import { Conversation, ConversationsResponse, Message } from '@/types';

// ======================
// Conversations API
// ======================

export interface ConversationsQueryParams {
    status?: 'open' | 'closed' | 'snoozed' | 'all';
    assigned_to?: number;
    contact_id?: number;
    page?: number;
    limit?: number;
    organization_id?: number;
}

export const getConversations = async (
    params: ConversationsQueryParams = {}
): Promise<ConversationsResponse> => {
    const response = await api.get('/api/conversations', {
        params,
        headers: params.organization_id ? { 'x-organization-id': params.organization_id.toString() } : {},
    });
    return response.data;
};

export const getConversation = async (
    id: number,
    organizationId?: number
): Promise<Conversation> => {
    const response = await api.get(`/api/conversations/${id}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
};

export interface CreateConversationData {
    contact_id: number;
    subject?: string;
    channel?: string;
    initial_message?: string;
    organization_id?: number;
}

export const createConversation = async (
    data: CreateConversationData
): Promise<Conversation> => {
    const response = await api.post('/api/conversations', data, {
        headers: data.organization_id ? { 'x-organization-id': data.organization_id.toString() } : {},
    });
    return response.data;
};

export const updateConversation = async (
    id: number,
    data: { status?: string; snoozed_until?: string },
    organizationId?: number
): Promise<Conversation> => {
    const response = await api.patch(`/api/conversations/${id}`, data, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
};

export const assignConversation = async (
    id: number,
    assignedTo: number | null,
    organizationId?: number
): Promise<Conversation> => {
    const response = await api.post(
        `/api/conversations/${id}/assign`,
        { assigned_to: assignedTo },
        { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
    );
    return response.data;
};

export const markConversationRead = async (
    id: number,
    organizationId?: number
): Promise<Conversation> => {
    const response = await api.patch(`/api/conversations/${id}/read`, {}, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
};

// ======================
// Messages API
// ======================

export interface SendMessageData {
    content: string;
    channel?: string;
    content_html?: string;
    metadata?: Record<string, any>;
}

export const sendMessage = async (
    conversationId: number,
    data: SendMessageData,
    organizationId?: number
): Promise<Message> => {
    const response = await api.post(`/api/conversations/${conversationId}/messages`, data, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
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
