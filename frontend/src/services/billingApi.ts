/**
 * Billing API Client
 * Simplified API methods for subscription and billing management
 * Following gleamai pattern
 */

import api from '../lib/api';
import type { Plan } from '@/lib/subscription';

// ============================================
// Types
// ============================================

export interface BillingStatus {
    plan: Plan;
    subscription_status: string;
    billing_period: 'monthly' | 'yearly';
    billing_period_start: string | null;
    billing_period_end: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    emails_used: number;
    emails_limit: number;
    sms_used: number;
    sms_limit: number;
    api_calls_used: number;
    api_calls_limit: number;
    contacts_limit: number;
    users_limit: number;
    workflows_limit: number;
    landing_pages_limit: number;
    forms_limit: number;
    calendars_limit: number;
    trial_ends_at: string | null;
    cancel_at_period_end: boolean;
    canceled_at: string | null;
}

export interface PlanInfo {
    id: Plan;
    name: string;
    displayName: string;
    tagline: string;
    description: string;
    icon: string;
    color: string;
    bgColor: string;
    borderColor: string;
    popular?: boolean;
    pricing: {
        monthly: number;
        yearly: number;
        yearlyMonthly: number;
    };
    tier: number;
    limits: {
        organizations: number;
        contacts: number;
        users: number;
        workflows: number;
        emails: number;
        sms: number;
        landingPages: number;
        forms: number;
        calendars: number;
        apiCalls: number;
        storage: number;
    };
}

export interface UsageStats {
    period: {
        start: string | null;
        end: string | null;
    };
    usage: {
        emails: {
            used: number;
            limit: number | 'unlimited';
            percentage: number;
        };
        sms: {
            used: number;
            limit: number | 'unlimited';
            percentage: number;
        };
        apiCalls: {
            used: number;
            limit: number | 'unlimited';
            percentage: number;
        };
    };
    resources: {
        contacts: number;
        workflows: number;
        forms: number;
        landingPages: number;
    };
}

interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// ============================================
// API Methods
// ============================================

/**
 * Get current billing status
 */
export async function getBillingStatus(): Promise<ApiResponse<BillingStatus>> {
    try {
        const response = await api.get('/api/billing');
        return response.data;
    } catch (error: any) {
        return {
            success: false,
            error: error.response?.data?.error || error.message
        };
    }
}

/**
 * Get all available plans
 */
export async function getPlans(): Promise<ApiResponse<PlanInfo[]>> {
    try {
        const response = await api.get('/api/billing/plans');
        return response.data;
    } catch (error: any) {
        return {
            success: false,
            error: error.response?.data?.error || error.message
        };
    }
}

/**
 * Create checkout session for subscription
 */
export async function createCheckoutSession(params: {
    planId?: Plan;
    priceId?: string;
    billingPeriod?: 'monthly' | 'yearly';
    mode?: 'subscription' | 'payment';
    successUrl: string;
    cancelUrl: string;
}): Promise<ApiResponse<{ url: string }>> {
    try {
        const response = await api.post('/api/billing/checkout', params);
        return response.data;
    } catch (error: any) {
        return {
            success: false,
            error: error.response?.data?.error || error.message
        };
    }
}

/**
 * Create billing portal session
 */
export async function createPortalSession(returnUrl: string): Promise<ApiResponse<{ url: string }>> {
    try {
        const response = await api.post('/api/billing/portal', { returnUrl });
        return response.data;
    } catch (error: any) {
        return {
            success: false,
            error: error.response?.data?.error || error.message
        };
    }
}

/**
 * Get current usage stats
 */
export async function getUsageStats(): Promise<ApiResponse<UsageStats>> {
    try {
        const response = await api.get('/api/billing/usage');
        return response.data;
    } catch (error: any) {
        return {
            success: false,
            error: error.response?.data?.error || error.message
        };
    }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Redirect to Stripe checkout
 */
export async function redirectToCheckout(params: {
    planId: Plan;
    billingPeriod?: 'monthly' | 'yearly';
}): Promise<void> {
    const { planId, billingPeriod = 'monthly' } = params;
    
    const result = await createCheckoutSession({
        planId,
        billingPeriod,
        mode: 'subscription',
        successUrl: `${window.location.origin}/settings?tab=billing&success=true`,
        cancelUrl: `${window.location.origin}/settings?tab=billing&canceled=true`
    });

    if (result.success && result.data?.url) {
        window.location.href = result.data.url;
    } else {
        throw new Error(result.error || 'Failed to create checkout session');
    }
}

/**
 * Redirect to billing portal
 */
export async function redirectToPortal(): Promise<void> {
    const result = await createPortalSession(
        `${window.location.origin}/settings?tab=billing`
    );

    if (result.success && result.data?.url) {
        window.location.href = result.data.url;
    } else {
        throw new Error(result.error || 'Failed to create portal session');
    }
}

// Export all functions as a namespace for convenience
export const billingApi = {
    getBillingStatus,
    getPlans,
    createCheckoutSession,
    createPortalSession,
    getUsageStats,
    redirectToCheckout,
    redirectToPortal
};

export default billingApi;
