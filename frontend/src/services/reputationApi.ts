/**
 * Reputation Management API Service
 * Handles reviews, requests, widgets, and analytics
 */
import api from '@/lib/api';
import {
    createWidgetViaGraphql,
    deletePlatformViaGraphql,
    deleteWidgetViaGraphql,
    getPlatformsViaGraphql,
    getReputationSettingsViaGraphql,
    getWidgetEmbedCodeViaGraphql,
    getWidgetsViaGraphql,
    updateReputationSettingsViaGraphql,
    updateWidgetViaGraphql,
    upsertPlatformViaGraphql,
} from './reputationConfigurationGraphql';
import { getReputationAnalyticsViaGraphql } from './reputationAnalyticsGraphql';
import {
    deleteReviewRequestViaGraphql,
    getReviewRequestsViaGraphql,
    resendReviewRequestViaGraphql,
    sendBulkReviewRequestsViaGraphql,
    sendReviewRequestViaGraphql,
} from './reputationRequestsGraphql';
import {
    createReviewViaGraphql,
    deleteReviewViaGraphql,
    getReviewViaGraphql,
    getReviewsViaGraphql,
    updateReviewViaGraphql
} from './reputationReviewsGraphql';

const unwrapResponse = <T>(payload: unknown): T => {
    if (payload && typeof payload === 'object' && 'data' in payload) {
        return (payload as { data: unknown }).data as T;
    }
    return payload as T;
};

// ======================
// Types
// ======================

export interface ReviewPlatform {
    id: number;
    organization_id: number;
    platform: 'google' | 'facebook' | 'yelp' | 'trustpilot' | 'g2' | 'capterra' | 'custom';
    platform_name?: string | null;
    place_id?: string | null;
    page_id?: string | null;
    business_url?: string | null;
    review_url?: string | null;
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
    review_url?: string;
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

export interface PublicReviewRequest {
    organization_name: string;
    contact_name?: string;
    redirect_url?: string;
    preferred_platform?: string;
}

export type SendReviewRequestInput = {
    contact_id?: number;
    contact_email?: string;
    contact_phone?: string;
    contact_name?: string;
    channel: 'email' | 'sms' | 'both';
    custom_message?: string;
    preferred_platform?: string;
    redirect_url?: string;
    scheduled_at?: string;
};

export type SendBulkReviewRequestsInput = {
    contact_ids: number[];
    channel: 'email' | 'sms' | 'both';
    custom_message?: string;
    preferred_platform?: string;
};

export interface ReviewRequestDeliveryAcceptance {
    batchId?: number;
    status: 'queued' | 'processing' | 'sent' | 'failed' | 'reconciliation_required';
    replayed: boolean;
    accepted: number;
    sent: number;
    requests: ReviewRequest[];
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
    email_template_id?: number | null;
    sms_template_text?: string | null;
    negative_threshold: number;
    negative_alert_email?: string | null;
    negative_route_internal: boolean;
    positive_route_url?: string | null;
    default_review_url?: string | null;
    google_place_id?: string | null;
    new_review_notify_email: boolean;
    new_review_notify_slack: boolean;
    slack_webhook_url?: string | null;
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
    return getPlatformsViaGraphql(organizationId);
};

export const resendReviewRequest = async (
    requestId: number,
    organizationId?: number,
    idempotencyKey?: string
): Promise<ReviewRequestDeliveryAcceptance> => {
    return resendReviewRequestViaGraphql(requestId, organizationId, idempotencyKey);
};

export const addPlatform = async (
    platform: Partial<ReviewPlatform>,
    organizationId?: number
): Promise<ReviewPlatform> => {
    return upsertPlatformViaGraphql(platform, organizationId);
};

export const removePlatform = async (
    platformId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    return deletePlatformViaGraphql(platformId, organizationId);
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
    return getReviewsViaGraphql(params, organizationId);
};

export const getReview = async (
    reviewId: number,
    organizationId?: number
): Promise<Review> => {
    return getReviewViaGraphql(reviewId, organizationId);
};

export const createReview = async (
    review: Partial<Review>,
    organizationId: number,
    idempotencyKey: string,
): Promise<Review> => {
    return createReviewViaGraphql(review, idempotencyKey, organizationId);
};

export const updateReview = async (
    reviewId: number,
    update: Partial<Pick<Review, 'status' | 'response_text' | 'internal_notes' | 'contact_id'>>,
    organizationId?: number
): Promise<Review> => {
    return updateReviewViaGraphql(reviewId, update, organizationId);
};

export const deleteReview = async (
    reviewId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    return deleteReviewViaGraphql(reviewId, organizationId);
};

// ======================
// Request API Functions
// ======================

export const getReviewRequests = async (
    params: { status?: ReviewRequest['status'] | 'all'; page?: number; limit?: number } = {},
    organizationId?: number
): Promise<{ requests: ReviewRequest[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
    return getReviewRequestsViaGraphql(params, organizationId);
};

export const sendReviewRequest = async (
    request: SendReviewRequestInput,
    organizationId?: number,
    idempotencyKey?: string
): Promise<ReviewRequestDeliveryAcceptance> => {
    return sendReviewRequestViaGraphql(request, organizationId, idempotencyKey);
};

export const sendBulkReviewRequests = async (
    data: SendBulkReviewRequestsInput,
    organizationId?: number,
    idempotencyKey?: string
): Promise<ReviewRequestDeliveryAcceptance> => {
    return sendBulkReviewRequestsViaGraphql(data, organizationId, idempotencyKey);
};

export const deleteReviewRequest = async (
    requestId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    return deleteReviewRequestViaGraphql(requestId, organizationId);
};

export const getPublicReviewRequest = async (token: string): Promise<PublicReviewRequest> => {
    const response = await api.get(
        `/api/reputation/public/review/${encodeURIComponent(token)}`,
        { publicRequest: true, withCredentials: false }
    );
    return unwrapResponse<PublicReviewRequest>(response.data);
};

export const submitPublicReview = async (
    token: string,
    input: { rating: number; review_text?: string; platform?: string }
): Promise<{ success: boolean; redirect_url?: string }> => {
    const response = await api.post(
        `/api/reputation/public/review/${encodeURIComponent(token)}`,
        input,
        {
            publicRequest: true,
            retryOnNetworkError: true,
            withCredentials: false,
        }
    );
    return unwrapResponse<{ success: boolean; redirect_url?: string }>(response.data);
};

// ======================
// Widget API Functions
// ======================

export const getWidgets = async (organizationId?: number): Promise<ReviewWidget[]> => {
    return getWidgetsViaGraphql(organizationId);
};

export const createWidget = async (
    widget: Partial<ReviewWidget>,
    organizationId: number,
    idempotencyKey: string
): Promise<ReviewWidget> => {
    return createWidgetViaGraphql(widget, organizationId, idempotencyKey);
};

export const updateWidget = async (
    widgetId: number,
    widget: Partial<ReviewWidget>,
    organizationId?: number
): Promise<ReviewWidget> => {
    return updateWidgetViaGraphql(widgetId, widget, organizationId);
};

export const deleteWidget = async (
    widgetId: number,
    organizationId?: number
): Promise<{ success: boolean }> => {
    return deleteWidgetViaGraphql(widgetId, organizationId);
};

export const getWidgetEmbedCode = async (
    widgetId: number,
    organizationId?: number
): Promise<{ embed_code: string; widget_key: string }> => {
    return getWidgetEmbedCodeViaGraphql(widgetId, organizationId);
};

// ======================
// Settings API Functions
// ======================

export const getReputationSettings = async (organizationId?: number): Promise<ReputationSettings> => {
    return getReputationSettingsViaGraphql(organizationId);
};

export const updateReputationSettings = async (
    settings: Partial<ReputationSettings>,
    organizationId?: number
): Promise<ReputationSettings> => {
    return updateReputationSettingsViaGraphql(settings, organizationId);
};

// ======================
// Analytics API Functions
// ======================

export const getReputationAnalytics = async (
    period: number = 30,
    organizationId?: number
): Promise<ReputationAnalytics> => {
    return getReputationAnalyticsViaGraphql(period, organizationId);
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
    resendReviewRequest,
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
