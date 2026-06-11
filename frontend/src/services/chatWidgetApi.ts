/**
 * Chat Widget API Service
 * Handles chat widget configuration and session management
 */
import api from '@/lib/api';

// ======================
// Types
// ======================

export interface ChatWidgetConfig {
    id: number;
    organization_id: number;
    widget_key: string;
    name: string;
    
    // Appearance
    primary_color: string;
    text_color: string;
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    icon_style: string;
    custom_icon_url?: string;
    
    // Messages
    welcome_title: string;
    welcome_message: string;
    placeholder_text: string;
    
    // Pre-chat form
    require_email: boolean;
    require_name: boolean;
    require_phone: boolean;
    custom_fields: CustomField[];
    
    // Behavior
    is_active: boolean;
    auto_open_delay: number;
    show_branding: boolean;
    notification_sound: boolean;
    
    // Business hours
    business_hours?: BusinessHours;
    offline_message: string;
    
    // Routing
    default_assigned_to?: number;
    auto_assign_available: boolean;
    
    // Stats
    total_conversations: number;
    total_messages: number;
    
    // Domains
    allowed_domains: string[];
    
    created_at: string;
    updated_at: string;
}

export interface CustomField {
    id: string;
    label: string;
    type: 'text' | 'email' | 'phone' | 'select';
    required: boolean;
    options?: string[];
}

export interface BusinessHours {
    monday?: { start: string; end: string } | null;
    tuesday?: { start: string; end: string } | null;
    wednesday?: { start: string; end: string } | null;
    thursday?: { start: string; end: string } | null;
    friday?: { start: string; end: string } | null;
    saturday?: { start: string; end: string } | null;
    sunday?: { start: string; end: string } | null;
}

export interface ChatSession {
    id: number;
    organization_id: number;
    widget_id: number;
    session_token: string;
    
    // Visitor info
    visitor_name?: string;
    visitor_email?: string;
    visitor_phone?: string;
    custom_data: Record<string, unknown>;
    
    // Metadata
    ip_address?: string;
    user_agent?: string;
    referrer_url?: string;
    current_page_url?: string;
    country?: string;
    city?: string;
    
    // Links
    contact_id?: number;
    conversation_id?: number;
    
    // Status
    status: 'active' | 'ended' | 'converted';
    is_online: boolean;
    last_seen_at: string;
    
    // Extra fields from joins
    widget_name?: string;
    unread_count?: number;
    last_message?: string;
    
    // Timestamps
    started_at: string;
    ended_at?: string;
    created_at: string;
    updated_at: string;
}

export interface ChatMessage {
    id: number;
    session_id: number;
    organization_id: number;
    sender_type: 'visitor' | 'agent' | 'system';
    sender_user_id?: number;
    content: string;
    content_type: 'text' | 'image' | 'file' | 'system';
    attachment_url?: string;
    attachment_name?: string;
    attachment_size?: number;
    is_read: boolean;
    read_at?: string;
    created_at: string;
    
    // From joins
    agent_name?: string;
}

export interface EmbedCode {
    widget_key: string;
    embed_code: string;
}

export interface PublicChatWidgetConfig {
    widget_key: string;
    name: string;
    primary_color: string;
    text_color: string;
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    icon_style: string;
    custom_icon_url?: string;
    welcome_title: string;
    welcome_message: string;
    placeholder_text: string;
    require_email: boolean;
    require_name: boolean;
    require_phone: boolean;
    custom_fields: CustomField[];
    is_active: boolean;
    is_online: boolean;
    auto_open_delay: number;
    show_branding: boolean;
    business_hours?: BusinessHours;
    offline_message: string;
}

export interface CreatePublicChatSessionPayload {
    widget_key: string;
    visitor_name?: string;
    visitor_email?: string;
    visitor_phone?: string;
    custom_data?: Record<string, unknown>;
    current_page_url?: string;
    referrer_url?: string;
}

export interface PublicChatSessionResponse {
    session_token: string;
    session_id: number;
    resumed: boolean;
}

export type PublicChatMessage = ChatMessage;

export interface SendPublicChatMessagePayload {
    session_token: string;
    content: string;
}

// ======================
// API Functions
// ======================

/**
 * Get organization's chat widget config
 */
export const getChatWidget = async (organizationId?: number): Promise<ChatWidgetConfig | null> => {
    const response = await api.get('/api/chat-widget', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Create chat widget for organization
 */
export const createChatWidget = async (
    config: Partial<ChatWidgetConfig>,
    organizationId?: number
): Promise<ChatWidgetConfig> => {
    const response = await api.post('/api/chat-widget', config, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Update chat widget configuration
 */
export const updateChatWidget = async (
    config: Partial<ChatWidgetConfig>,
    organizationId?: number
): Promise<ChatWidgetConfig> => {
    const response = await api.put('/api/chat-widget', config, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Get embed code for website
 */
export const getEmbedCode = async (organizationId?: number): Promise<EmbedCode> => {
    const response = await api.get('/api/chat-widget/embed-code', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Get public widget configuration for first-party marketing pages or external embeds.
 */
export const getPublicChatWidgetConfig = async (widgetKey: string): Promise<PublicChatWidgetConfig> => {
    const response = await api.get(`/api/chat-widget/public/config/${widgetKey}`);
    return response.data;
};

/**
 * Create or resume a public visitor chat session.
 */
export const createPublicChatSession = async (
    payload: CreatePublicChatSessionPayload
): Promise<PublicChatSessionResponse> => {
    const response = await api.post('/api/chat-widget/public/session', payload);
    return response.data;
};

/**
 * Load public visitor messages for a chat session.
 */
export const getPublicChatMessages = async (sessionToken: string): Promise<PublicChatMessage[]> => {
    const response = await api.get(`/api/chat-widget/public/messages/${sessionToken}`);
    return response.data;
};

/**
 * Send a message as a public visitor.
 */
export const sendPublicChatMessage = async (
    payload: SendPublicChatMessagePayload
): Promise<PublicChatMessage> => {
    const response = await api.post('/api/chat-widget/public/messages', payload);
    return response.data;
};

/**
 * End a public visitor chat session.
 */
export const endPublicChatSession = async (sessionToken: string): Promise<{ success: boolean }> => {
    const response = await api.post('/api/chat-widget/public/end-session', { session_token: sessionToken });
    return response.data;
};

/**
 * Get chat sessions
 */
export const getChatSessions = async (
    params: {
        status?: 'active' | 'ended' | 'converted' | 'all';
        page?: number;
        limit?: number;
    } = {},
    organizationId?: number
): Promise<{ sessions: ChatSession[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    const response = await api.get('/api/chat-widget/sessions', {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Get single chat session with messages
 */
export const getChatSession = async (
    sessionId: number,
    organizationId?: number
): Promise<ChatSession & { messages: ChatMessage[] }> => {
    const response = await api.get(`/api/chat-widget/sessions/${sessionId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Send message as agent
 */
export const sendAgentMessage = async (
    sessionId: number,
    content: string,
    organizationId?: number
): Promise<ChatMessage> => {
    const response = await api.post(`/api/chat-widget/sessions/${sessionId}/messages`, 
        { content },
        { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
    );
    return response.data;
};

/**
 * Convert chat session to contact
 */
export const convertSessionToContact = async (
    sessionId: number,
    organizationId?: number
): Promise<{ success: boolean; contact_id: number; conversation_id: number }> => {
    const response = await api.post(`/api/chat-widget/sessions/${sessionId}/convert`, 
        {},
        { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
    );
    return response.data;
};

export default {
    getChatWidget,
    createChatWidget,
    updateChatWidget,
    getEmbedCode,
    getChatSessions,
    getChatSession,
    sendAgentMessage,
    convertSessionToContact
};
