/**
 * Email Campaigns API Service
 * Handles campaign CRUD, scheduling, and sending
 */
import api from '@/lib/api';
import {
    createCampaignViaGraphql,
    deleteCampaignViaGraphql,
    duplicateCampaignViaGraphql,
    getCampaignViaGraphql,
    getCampaignsViaGraphql,
    scheduleCampaignViaGraphql,
    unscheduleCampaignViaGraphql,
    updateCampaignViaGraphql,
} from './campaignsGraphql';
import {
    isCampaignGraphqlMutationsEnabled,
    isCampaignGraphqlReadsEnabled,
} from './graphqlClient';

type CampaignJson = Record<string, unknown>;

const unwrapResponse = <T>(payload: unknown): T => {
    if (payload && typeof payload === 'object' && 'data' in payload) {
        return payload.data as T;
    }
    return payload as T;
};

// ======================
// Types
// ======================

export interface EmailCampaign {
    id: number;
    organization_id: number;
    
    // Campaign info
    name: string;
    subject: string;
    from_name?: string | null;
    from_email?: string | null;
    reply_to?: string | null;
    
    // Content
    template_id?: number | null;
    content_html?: string | null;
    content_text?: string | null;
    
    // Targeting
    segment_type: 'all' | 'tag' | 'status' | 'custom' | 'segment';
    segment_id?: number | null;
    segment_filter: CampaignJson;
    tag_ids: number[];
    excluded_tag_ids: number[];
    
    // Status
    status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled' | 'failed';
    
    // Scheduling
    scheduled_at?: string | null;
    send_immediately: boolean;
    timezone: string;
    
    // A/B Testing
    is_ab_test: boolean;
    ab_variants?: unknown;
    ab_winner_criteria?: string | null;
    ab_test_duration_hours?: number | null;
    
    // Stats
    total_recipients: number;
    total_sent: number;
    total_delivered: number;
    total_opened: number;
    total_clicked: number;
    total_bounced: number;
    total_unsubscribed: number;
    total_complained: number;
    
    // Rates
    open_rate: number;
    click_rate: number;
    bounce_rate: number;
    
    // Metadata
    created_by?: number | null;
    sent_by?: number | null;
    
    // Timestamps
    started_at?: string | null;
    completed_at?: string | null;
    created_at: string;
    updated_at: string;
    
    // From joins
    template_name?: string | null;
    created_by_name?: string | null;
    sent_by_name?: string | null;
    template_html?: string | null;
    links?: CampaignLink[];
}

export interface CampaignLink {
    id: number;
    campaign_id: number;
    original_url: string;
    tracking_url?: string | null;
    link_text?: string | null;
    link_position?: number | null;
    total_clicks: number;
    unique_clicks: number;
    created_at: string;
}

export interface CampaignRecipient {
    id: number;
    campaign_id: number;
    contact_id: number;
    organization_id: number;
    
    email: string;
    first_name?: string;
    last_name?: string;
    
    status: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed' | 'unsubscribed' | 'complained';
    
    sent_at?: string;
    delivered_at?: string;
    opened_at?: string;
    clicked_at?: string;
    bounced_at?: string;
    unsubscribed_at?: string;
    
    open_count: number;
    click_count: number;
    clicked_links?: unknown[];
    
    error_message?: string;
    bounce_type?: string;
    
    ab_variant?: string;
    
    created_at: string;
    updated_at: string;
    
    // From joins
    contact_first_name?: string;
    contact_last_name?: string;
}

export interface CampaignPreview {
    recipientCount: number;
    segmentType: string;
    segmentId?: number | null;
    tagIds: number[];
    excludedTagIds: number[];
}

// ======================
// API Functions
// ======================

/**
 * Get campaigns list
 */
export const getCampaigns = async (
    params: {
        status?: EmailCampaign['status'] | 'all';
        page?: number;
        limit?: number;
        search?: string;
    } = {},
    organizationId?: number
): Promise<{ campaigns: EmailCampaign[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    if (isCampaignGraphqlReadsEnabled()) {
        return getCampaignsViaGraphql(params, organizationId);
    }
    const response = await api.get('/api/campaigns', {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    const payload = response.data as {
        data?: EmailCampaign[];
        pagination?: { page: number; limit: number; total: number; totalPages: number };
    };
    return {
        campaigns: Array.isArray(payload?.data) ? payload.data : [],
        pagination: payload?.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 },
    };
};

/**
 * Get single campaign
 */
export const getCampaign = async (
    campaignId: number,
    organizationId?: number
): Promise<EmailCampaign> => {
    if (isCampaignGraphqlReadsEnabled()) {
        return getCampaignViaGraphql(campaignId, organizationId);
    }
    const response = await api.get(`/api/campaigns/${campaignId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<EmailCampaign>(response.data);
};

/**
 * Create campaign
 */
export const createCampaign = async (
    campaign: Partial<EmailCampaign>,
    organizationId?: number
): Promise<EmailCampaign> => {
    if (isCampaignGraphqlMutationsEnabled()) {
        return createCampaignViaGraphql(campaign, organizationId);
    }
    const response = await api.post('/api/campaigns', campaign, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<EmailCampaign>(response.data);
};

/**
 * Update campaign
 */
export const updateCampaign = async (
    campaignId: number,
    campaign: Partial<EmailCampaign>,
    organizationId?: number
): Promise<EmailCampaign> => {
    if (isCampaignGraphqlMutationsEnabled()) {
        return updateCampaignViaGraphql(campaignId, campaign, organizationId);
    }
    const response = await api.put(`/api/campaigns/${campaignId}`, campaign, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<EmailCampaign>(response.data);
};

/**
 * Delete campaign
 */
export const deleteCampaign = async (
    campaignId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    if (isCampaignGraphqlMutationsEnabled()) {
        return deleteCampaignViaGraphql(campaignId, organizationId);
    }
    const response = await api.delete(`/api/campaigns/${campaignId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<{ success: boolean }>(response.data);
};

/**
 * Duplicate campaign
 */
export const duplicateCampaign = async (
    campaignId: number,
    organizationId?: number
): Promise<EmailCampaign> => {
    if (isCampaignGraphqlMutationsEnabled()) {
        return duplicateCampaignViaGraphql(campaignId, organizationId);
    }
    const response = await api.post(`/api/campaigns/${campaignId}/duplicate`, {}, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<EmailCampaign>(response.data);
};

/**
 * Schedule campaign
 */
export const scheduleCampaign = async (
    campaignId: number,
    scheduledAt: string,
    timezone?: string,
    organizationId?: number
): Promise<EmailCampaign> => {
    if (isCampaignGraphqlMutationsEnabled()) {
        return scheduleCampaignViaGraphql(campaignId, scheduledAt, timezone, organizationId);
    }
    const response = await api.post(`/api/campaigns/${campaignId}/schedule`, {
        scheduled_at: scheduledAt,
        timezone
    }, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<EmailCampaign>(response.data);
};

/**
 * Unschedule campaign (back to draft)
 */
export const unscheduleCampaign = async (
    campaignId: number,
    organizationId?: number
): Promise<EmailCampaign> => {
    if (isCampaignGraphqlMutationsEnabled()) {
        return unscheduleCampaignViaGraphql(campaignId, organizationId);
    }
    const response = await api.post(`/api/campaigns/${campaignId}/unschedule`, {}, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<EmailCampaign>(response.data);
};

/**
 * Send campaign immediately
 */
export const sendCampaign = async (
    campaignId: number,
    organizationId?: number
): Promise<{ campaign: EmailCampaign; recipientCount: number; message: string }> => {
    const response = await api.post(`/api/campaigns/${campaignId}/send`, {}, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<{ campaign: EmailCampaign; recipientCount: number; message: string }>(response.data);
};

/**
 * Pause sending campaign
 */
export const pauseCampaign = async (
    campaignId: number,
    organizationId?: number
): Promise<EmailCampaign> => {
    const response = await api.post(`/api/campaigns/${campaignId}/pause`, {}, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<EmailCampaign>(response.data);
};

/**
 * Resume paused campaign
 */
export const resumeCampaign = async (
    campaignId: number,
    organizationId?: number
): Promise<{ message: string; pendingRecipients?: number }> => {
    const response = await api.post(`/api/campaigns/${campaignId}/resume`, {}, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<{ message: string; pendingRecipients?: number }>(response.data);
};

/**
 * Get campaign recipients
 */
export const getCampaignRecipients = async (
    campaignId: number,
    params: {
        status?: CampaignRecipient['status'] | 'all';
        page?: number;
        limit?: number;
    } = {},
    organizationId?: number
): Promise<{ recipients: CampaignRecipient[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    const response = await api.get(`/api/campaigns/${campaignId}/recipients`, {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<{ recipients: CampaignRecipient[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(response.data);
};

/**
 * Preview campaign recipient count
 */
export const previewCampaign = async (
    campaignId: number,
    organizationId?: number
): Promise<CampaignPreview> => {
    const response = await api.get(`/api/campaigns/${campaignId}/preview`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<CampaignPreview>(response.data);
};

/**
 * Send test email for campaign
 */
export const sendTestEmail = async (
    campaignId: number,
    testEmail: string,
    organizationId?: number
): Promise<{ success: boolean; message: string; emailId?: string }> => {
    const response = await api.post(`/api/campaigns/${campaignId}/send-test`, {
        test_email: testEmail
    }, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return unwrapResponse<{ success: boolean; message: string; emailId?: string }>(response.data);
};

export default {
    getCampaigns,
    getCampaign,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    duplicateCampaign,
    scheduleCampaign,
    unscheduleCampaign,
    sendCampaign,
    pauseCampaign,
    resumeCampaign,
    getCampaignRecipients,
    previewCampaign,
    sendTestEmail
};
