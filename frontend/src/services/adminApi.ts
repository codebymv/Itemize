/**
 * Admin API Client
 * API methods for admin dashboard functionality
 */

import {
    getAdminActivationFunnelViaGraphql,
    getAdminOperationsSnapshotViaGraphql,
    getAdminStatsViaGraphql,
    getAdminUserCountViaGraphql,
    getAdminUserIdsViaGraphql,
    getAdminUsersByIdsViaGraphql,
    searchAdminUsersViaGraphql,
    updateAdminOwnPlanViaGraphql,
} from './adminGraphql';

// ============================================
// Types
// ============================================

export interface AdminUser {
    id: number;
    email: string;
    name: string | null;
    role: 'USER' | 'ADMIN';
    plan: string;
    createdAt: string;
}

export interface SearchUsersResponse {
    users: AdminUser[];
    total: number;
    hasMore: boolean;
}

export interface SystemStats {
    users: number;
    contacts: number;
    invoices: number;
}

export interface ActivationFunnel {
    asOf: string;
    cohortStartedAt: string;
    cohortDays: number;
    organizationsCreated: number;
    organizationsSent: number;
    organizationsAdvanced: number;
    organizationsReturned: number;
    trialOrganizationsSent: number;
    organizationsTrialToPaid: number;
    sendRate: number;
    advanceRate: number;
    returnRate: number;
    trialToPaidRate: number;
}

export interface UserCountResponse {
    count: number;
}

export type AdminOperationalStatus =
    | 'healthy'
    | 'degraded'
    | 'action_required'
    | 'operational'
    | 'configured'
    | 'incomplete'
    | 'disabled';

export interface ProviderHealth {
    id: string;
    name: string;
    status: AdminOperationalStatus;
    detail: string;
    required: boolean;
}

export interface JobQueueHealth {
    id: string;
    name: string;
    status: AdminOperationalStatus;
    available: boolean;
    queued: number;
    processing: number;
    retrying: number;
    actionRequired: number;
    active: number;
    oldestPendingAt: string | null;
}

export interface OperationsSnapshot {
    asOf: string;
    status: AdminOperationalStatus;
    activeJobs: number;
    retryingJobs: number;
    actionRequiredJobs: number;
    providers: ProviderHealth[];
    queues: JobQueueHealth[];
}

// ============================================
// API Methods
// ============================================

/**
 * Get user count
 */
export async function getUserCount(): Promise<UserCountResponse> {
    return getAdminUserCountViaGraphql();
}

/**
 * Search users with pagination
 */
export async function searchUsers(params: {
    query?: string;
    page?: number;
    limit?: number;
    plan?: string;
}): Promise<SearchUsersResponse> {
    const { query = '', page = 0, limit = 50, plan } = params;
    return searchAdminUsersViaGraphql({ query, page, limit, plan });
}

/**
 * Get user IDs matching query
 */
export async function getUserIds(query?: string, plan?: string): Promise<{ ids: number[] }> {
    return getAdminUserIdsViaGraphql(query, plan);
}

/**
 * Get users by IDs
 */
export async function getUsersByIds(ids: number[]): Promise<{ users: AdminUser[] }> {
    return getAdminUsersByIdsViaGraphql(ids);
}

/**
 * Get system statistics
 */
export async function getStats(): Promise<SystemStats> {
    return getAdminStatsViaGraphql();
}

export async function getActivationFunnel(days = 30): Promise<ActivationFunnel> {
    return getAdminActivationFunnelViaGraphql(days);
}

export async function getOperationsSnapshot(): Promise<OperationsSnapshot> {
    return getAdminOperationsSnapshotViaGraphql();
}

/**
 * Update admin's own plan (for testing)
 */
export async function updateMyPlan(plan: string): Promise<{ message: string; plan: string }> {
    return updateAdminOwnPlanViaGraphql(plan);
}
