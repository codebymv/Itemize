/**
 * @deprecated Use ./billingApi.ts instead (simplified gleamai pattern)
 * This file is kept for backward compatibility.
 * 
 * Subscriptions API Service
 * Handles subscription management, billing, and usage tracking
 */

import api from '../lib/api';

// Types
export interface SubscriptionPlan {
  id: number;
  name: string;
  displayName: string;
  description: string;
  tierLevel: number;
  pricing: {
    monthly: number;
    yearly: number;
    yearlyMonthly: number;
  };
  features: Record<string, boolean>;
  limits: Record<string, number>;
  trialDays: number;
  isDefault: boolean;
}

export interface Subscription {
  hasSubscription: boolean;
  status: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
  planName?: string;
  displayName?: string;
  tierLevel?: number;
  billingPeriod?: 'monthly' | 'yearly';
  currentPeriod?: {
    start: string;
    end: string;
  };
  trial?: {
    endsAt: string;
    isActive: boolean;
  } | null;
  cancelAtPeriodEnd?: boolean;
  features?: Record<string, boolean>;
  limits?: Record<string, number>;
}

export interface UsageStats {
  hasSubscription: boolean;
  planName?: string;
  tierLevel?: number;
  period: {
    start: string;
    end: string;
  };
  usage: Record<string, {
    current: number;
    limit: number | 'unlimited';
    unlimited: boolean;
    percentage: number;
    remaining: number | 'unlimited';
  }>;
  realTimeCounts?: {
    contacts: number;
    landing_pages: number;
    forms: number;
    workflows: number;
  };
}

export interface UsageHistoryItem {
  period_start: string;
  period_end: string;
  count: number;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
}

export interface PortalSession {
  url: string;
}

// API functions

/**
 * Get all available subscription plans
 */
export async function getPlans(): Promise<SubscriptionPlan[]> {
  const response = await api.get('/subscriptions/plans');
  return response.data.data;
}

/**
 * Get current organization's subscription status
 */
export async function getCurrentSubscription(): Promise<Subscription> {
  const response = await api.get('/subscriptions/current');
  return response.data.data;
}

/**
 * Get current usage stats
 */
export async function getUsageStats(): Promise<UsageStats> {
  const response = await api.get('/subscriptions/usage');
  return response.data.data;
}

/**
 * Get usage history for analytics
 */
export async function getUsageHistory(
  resourceType?: string,
  months?: number
): Promise<UsageHistoryItem[]> {
  const params = new URLSearchParams();
  if (resourceType) params.append('resourceType', resourceType);
  if (months) params.append('months', months.toString());
  
  const response = await api.get(`/subscriptions/usage/history?${params.toString()}`);
  return response.data.data;
}

/**
 * Create checkout session for subscription
 */
export async function createCheckoutSession(
  planName: 'starter' | 'unlimited' | 'pro',
  billingPeriod: 'monthly' | 'yearly',
  successUrl: string,
  cancelUrl: string
): Promise<CheckoutSession> {
  const response = await api.post('/subscriptions/checkout', {
    planName,
    billingPeriod,
    successUrl,
    cancelUrl
  });
  return response.data.data;
}

/**
 * Create billing portal session
 */
export async function createPortalSession(returnUrl: string): Promise<PortalSession> {
  const response = await api.post('/subscriptions/portal', { returnUrl });
  return response.data.data;
}

/**
 * Change subscription plan
 */
export async function updatePlan(
  planName: 'starter' | 'unlimited' | 'pro',
  billingPeriod: 'monthly' | 'yearly'
): Promise<{ status: string; planName: string }> {
  const response = await api.put('/subscriptions/plan', { planName, billingPeriod });
  return response.data.data;
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(
  immediate: boolean = false
): Promise<{ status: string; cancelAtPeriodEnd: boolean; canceledAt?: string }> {
  const response = await api.post('/subscriptions/cancel', { immediate });
  return response.data.data;
}

/**
 * Resume a subscription set to cancel at period end
 */
export async function resumeSubscription(): Promise<{ status: string; cancelAtPeriodEnd: boolean }> {
  const response = await api.post('/subscriptions/resume');
  return response.data.data;
}

/**
 * Get available features for current plan
 */
export async function getFeatures(): Promise<{
  tierLevel: number;
  planName?: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
}> {
  const response = await api.get('/subscriptions/features');
  return response.data.data;
}

export default {
  getPlans,
  getCurrentSubscription,
  getUsageStats,
  getUsageHistory,
  createCheckoutSession,
  createPortalSession,
  updatePlan,
  cancelSubscription,
  resumeSubscription,
  getFeatures
};
