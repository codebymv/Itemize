/**
 * Reputation Management API Service
 * Handles reviews, requests, widgets, and analytics
 */
import api from '@/lib/api';

// ======================
// Types
// ======================

export interface ReviewPlatform {
    id: number;
    organization_id: number;
    platform: 'google' | 'facebook' | 'yelp' | 'trustpilot' | 'g2' | 'capterra' | 'custom';
    platform_name?: string;
    place_id?: string;
    page_id?: string;
    business_url?: string;
    review_url?: string;
    total_reviews: number;
    average_rating: number;
    last_synced_at?: string;
    is_active: boolean;
    is_connected: boolean;
    created_at: string;
    updated_at: string;
}

export interface Review {
    id: number;
    organization_id: number;
    platform_id?: number;
    platform: string;
    external_review_id?: string;
    rating: number;
    review_text?: string;
    reviewer_name?: string;
    reviewer_email?: string;
    reviewer_phone?: string;
    reviewer_avatar_url?: string;
    reviewer_profile_url?: string;
    contact_id?: number;
    status: 'new' | 'read' | 'responded' | 'flagged' | 'hidden';
    response_text?: string;
    responded_at?: string;
    responded_by?: number;
    internal_notes?: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
    sentiment_score?: number;
    source: 'sync' | 'manual' | 'request' | 'widget';
    review_request_id?: number;
    review_date: string;
    created_at: string;
    updated_at: string;
    // From joins
    platform_name?: string;
    contact_first_name?: string;
    contact_last_name?: string;
    contact_email?: string;
}

export interface ReviewRequest {
    id: number;
    organization_id: number;
    contact_id?: number;
    contact_email?: string;
    contact_phone?: string;
    contact_name?: string;
    channel: 'email' | 'sms' | 'both';
    template_id?: number;
    email_sent: boolean;
    email_sent_at?: string;
    email_opened: boolean;
    email_opened_at?: string;
    sms_sent: boolean;
    sms_sent_at?: string;
    clicked: boolean;
    clicked_at?: string;
    rating_given?: number;
    review_submitted: boolean;
    review_submitted_at?: string;
    review_id?: number;
    preferred_platform?: string;
    redirect_url?: string;
    status: 'pending' | 'sent' | 'opened' | 'clicked' | 'completed' | 'failed' | 'unsubscribed';
    scheduled_at?: string;
    expires_at?: string;
    custom_message?: string;
    unique_token?: string;
    created_at: string;
    updated_at: string;
    // From joins
    first_name?: string;
    last_name?: string;
    email?: string;
}

export interface ReviewWidget {
    id: number;
    organization_id: number;
    widget_key: string;
    name: string;
    widget_type: 'carousel' | 'grid' | 'list' | 'badge' | 'floating';
    theme: 'light' | 'dark' | 'auto';
    primary_color: string;
    background_color: string;
    text_color: string;
    border_radius: number;
    show_rating_stars: boolean;
    show_reviewer_photo: boolean;
    show_review_date: boolean;
    show_platform_icon: boolean;
    min_rating: number;
    platforms: string[];
    max_reviews: number;
    hide_no_text_reviews: boolean;
    auto_refresh: boolean;
    refresh_interval_hours: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface ReputationSettings {
    id?: number;
    organization_id?: number;
    auto_request_enabled: boolean;
    auto_request_delay_days: number;
    auto_request_channel: string;
    auto_request_trigger: string;
    email_template_id?: number;
    sms_template_text?: string;
    negative_threshold: number;
    negative_alert_email?: string;
    negative_route_internal: boolean;
    positive_route_url?: string;
    default_review_url?: string;
    google_place_id?: string;
    new_review_notify_email: boolean;
    new_review_notify_slack: boolean;
    slack_webhook_url?: string;
    created_at?: string;
    updated_at?: string;
}

export interface ReputationAnalytics {
    overall: {
        total_reviews: number;
        average_rating: number;
        positive_reviews: number;
        negative_reviews: number;
        new_reviews: number;
        responded_reviews: number;
    };
    period: {
        days: number;
        reviews_count: number;
        average_rating: number;
    };
    rating_distribution: Array<{ rating: number; count: number }>;
    platform_distribution: Array<{ platform: string; count: number; avg_rating: number }>;
    reviews_over_time: Array<{ date: string; count: number; avg_rating: number }>;
    request_stats: {
        total_sent: number;
        clicked: number;
        converted: number;
    };
}

// ======================
// Platform API Functions
// ======================

export const getPlatforms = async (organizationId?: number): Promise<ReviewPlatform[]> => {
    const response = await api.get('/api/reputation/platforms', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const addPlatform = async (
    platform: Partial<ReviewPlatform>,
    organizationId?: number
): Promise<ReviewPlatform> => {
    const response = await api.post('/api/reputation/platforms', platform, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const removePlatform = async (
    platformId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    const response = await api.delete(`/api/reputation/platforms/${platformId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// ======================
// Review API Functions
// ======================

export const getReviews = async (
    params: {
        platform?: string;
        rating?: number;
        status?: Review['status'] | 'all';
        sentiment?: Review['sentiment'] | 'all';
        page?: number;
        limit?: number;
        search?: string;
    } = {},
    organizationId?: number
): Promise<{ reviews: Review[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    const response = await api.get('/api/reputation/reviews', {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const getReview = async (
    reviewId: number,
    organizationId?: number
): Promise<Review> => {
    const response = await api.get(`/api/reputation/reviews/${reviewId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const createReview = async (
    review: Partial<Review>,
    organizationId?: number
): Promise<Review> => {
    const response = await api.post('/api/reputation/reviews', review, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const updateReview = async (
    reviewId: number,
    update: Partial<Pick<Review, 'status' | 'response_text' | 'internal_notes' | 'contact_id'>>,
    organizationId?: number
): Promise<Review> => {
    const response = await api.put(`/api/reputation/reviews/${reviewId}`, update, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const deleteReview = async (
    reviewId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    const response = await api.delete(`/api/reputation/reviews/${reviewId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// ======================
// Request API Functions
// ======================

export const getReviewRequests = async (
    params: { status?: ReviewRequest['status'] | 'all'; page?: number; limit?: number } = {},
    organizationId?: number
): Promise<{ requests: ReviewRequest[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    const response = await api.get('/api/reputation/requests', {
        params,
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const sendReviewRequest = async (
    request: {
        contact_id?: number;
        contact_email?: string;
        contact_phone?: string;
        contact_name?: string;
        channel: 'email' | 'sms' | 'both';
        custom_message?: string;
        preferred_platform?: string;
        redirect_url?: string;
        scheduled_at?: string;
    },
    organizationId?: number
): Promise<ReviewRequest> => {
    const response = await api.post('/api/reputation/requests', request, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const sendBulkReviewRequests = async (
    data: {
        contact_ids: number[];
        channel: 'email' | 'sms' | 'both';
        custom_message?: string;
        preferred_platform?: string;
    },
    organizationId?: number
): Promise<{ sent: number; requests: Array<{ id: number }> }> => {
    const response = await api.post('/api/reputation/requests/bulk', data, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const deleteReviewRequest = async (
    requestId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    const response = await api.delete(`/api/reputation/requests/${requestId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// ======================
// Widget API Functions
// ======================

export const getWidgets = async (organizationId?: number): Promise<ReviewWidget[]> => {
    const response = await api.get('/api/reputation/widgets', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const createWidget = async (
    widget: Partial<ReviewWidget>,
    organizationId?: number
): Promise<ReviewWidget> => {
    const response = await api.post('/api/reputation/widgets', widget, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const updateWidget = async (
    widgetId: number,
    widget: Partial<ReviewWidget>,
    organizationId?: number
): Promise<ReviewWidget> => {
    const response = await api.put(`/api/reputation/widgets/${widgetId}`, widget, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const deleteWidget = async (
    widgetId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    const response = await api.delete(`/api/reputation/widgets/${widgetId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const getWidgetEmbedCode = async (
    widgetId: number,
    organizationId?: number
): Promise<{ embed_code: string; widget_key: string }> => {
    const response = await api.get(`/api/reputation/widgets/${widgetId}/embed-code`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// ======================
// Settings API Functions
// ======================

export const getReputationSettings = async (organizationId?: number): Promise<ReputationSettings> => {
    const response = await api.get('/api/reputation/settings', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

export const updateReputationSettings = async (
    settings: Partial<ReputationSettings>,
    organizationId?: number
): Promise<ReputationSettings> => {
    const response = await api.put('/api/reputation/settings', settings, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// ======================
// Analytics API Functions
// ======================

export const getReputationAnalytics = async (
    period: number = 30,
    organizationId?: number
): Promise<ReputationAnalytics> => {
    const response = await api.get('/api/reputation/analytics', {
        params: { period },
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

// Aliases for backward compatibility
export const getReviewWidgets = getWidgets;
export const createReviewWidget = createWidget;
export const updateReviewWidget = updateWidget;
export const deleteReviewWidget = deleteWidget;

export default {
    // Platforms
    getPlatforms,
    addPlatform,
    removePlatform,
    // Reviews
    getReviews,
    getReview,
    createReview,
    updateReview,
    deleteReview,
    // Requests
    getReviewRequests,
    sendReviewRequest,
    sendBulkReviewRequests,
    deleteReviewRequest,
    // Widgets
    getWidgets,
    createWidget,
    updateWidget,
    deleteWidget,
    getWidgetEmbedCode,
    // Aliases
    getReviewWidgets,
    createReviewWidget,
    updateReviewWidget,
    deleteReviewWidget,
    // Settings
    getReputationSettings,
    updateReputationSettings,
    // Analytics
    getReputationAnalytics
};
