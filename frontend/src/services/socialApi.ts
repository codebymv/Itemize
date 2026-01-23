/**
 * Social Media Integration API Service
 * Handles Facebook/Instagram messaging and connections
 */
import api from '@/lib/api';

// ======================
// Types
// ======================

export interface SocialChannel {
    id: number;
    organization_id: number;
    channel_type: 'facebook' | 'instagram' | 'whatsapp' | 'twitter';
    external_id: string;
    name: string;
    username?: string;
    profile_picture_url?: string;
    page_id?: string;
    instagram_business_account_id?: string;
    user_id?: string;
    permissions?: string[];
    is_active: boolean;
    is_connected: boolean;
    connection_error?: string;
    last_synced_at?: string;
    webhook_verified: boolean;
    created_by?: number;
    created_by_name?: string;
    created_at: string;
    updated_at: string;
}

export interface SocialConversation {
    id: number;
    organization_id: number;
    channel_id: number;
    thread_id?: string;
    participant_id: string;
    participant_name?: string;
    participant_username?: string;
    participant_profile_pic?: string;
    contact_id?: number;
    status: 'open' | 'closed' | 'pending' | 'spam';
    assigned_to?: number;
    unread_count: number;
    message_count: number;
    last_message_text?: string;
    last_message_at?: string;
    last_message_from?: string;
    tags?: string[];
    created_at: string;
    updated_at: string;
    // From joins
    channel_type?: SocialChannel['channel_type'];
    channel_name?: string;
    contact_first_name?: string;
    contact_last_name?: string;
    assigned_to_name?: string;
    messages?: SocialMessage[];
}

export interface SocialMessage {
    id: number;
    organization_id: number;
    conversation_id: number;
    channel_id: number;
    external_message_id?: string;
    message_type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'sticker' | 'story_mention' | 'story_reply' | 'reaction';
    text_content?: string;
    media_url?: string;
    media_type?: string;
    media_filename?: string;
    direction: 'inbound' | 'outbound';
    sender_id?: string;
    sender_name?: string;
    sent_by?: number;
    sent_by_name?: string;
    status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
    error_message?: string;
    message_timestamp: string;
    read_at?: string;
    created_at: string;
}

export interface SocialAnalytics {
    period: number;
    channels: Array<{
        channel_type: string;
        conversation_count: number;
        message_count: number;
        inbound_count: number;
        outbound_count: number;
    }>;
    avg_response_time_minutes?: number;
    messages_over_time: Array<{
        date: string;
        inbound: number;
        outbound: number;
    }>;
    status_distribution: Array<{
        status: string;
        count: number;
    }>;
}

// ======================
// OAuth & Connection
// ======================

export const getFacebookConnectUrl = async (organizationId?: number): Promise<{ auth_url: string }> => {
    const response = await api.get('/api/social/connect/facebook', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// ======================
// Channel API Functions
// ======================

export const getChannels = async (
    params: { channel_type?: SocialChannel['channel_type'] } = {},
    organizationId?: number
): Promise<SocialChannel[]> => {
    const response = await api.get('/api/social/channels', {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const disconnectChannel = async (
    channelId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    const response = await api.delete(`/api/social/channels/${channelId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// ======================
// Conversation API Functions
// ======================

export const getConversations = async (
    params: {
        channel_id?: number;
        channel_type?: SocialChannel['channel_type'];
        status?: SocialConversation['status'] | 'all';
        assigned_to?: number;
        page?: number;
        limit?: number;
    } = {},
    organizationId?: number
): Promise<{ conversations: SocialConversation[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    const response = await api.get('/api/social/conversations', {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const getConversation = async (
    conversationId: number,
    organizationId?: number
): Promise<SocialConversation> => {
    const response = await api.get(`/api/social/conversations/${conversationId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const updateConversation = async (
    conversationId: number,
    update: Partial<Pick<SocialConversation, 'status' | 'assigned_to' | 'contact_id' | 'tags'>>,
    organizationId?: number
): Promise<SocialConversation> => {
    const response = await api.put(`/api/social/conversations/${conversationId}`, update, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// ======================
// Messaging API Functions
// ======================

export const sendMessage = async (
    conversationId: number,
    text: string,
    organizationId?: number
): Promise<SocialMessage> => {
    const response = await api.post(`/api/social/conversations/${conversationId}/messages`, { text }, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// ======================
// Analytics API Functions
// ======================

export const getSocialAnalytics = async (
    period: number = 30,
    organizationId?: number
): Promise<SocialAnalytics> => {
    const response = await api.get('/api/social/analytics', {
        params: { period },
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export default {
    // OAuth
    getFacebookConnectUrl,
    // Channels
    getChannels,
    disconnectChannel,
    // Conversations
    getConversations,
    getConversation,
    updateConversation,
    // Messaging
    sendMessage,
    // Analytics
    getSocialAnalytics
};
