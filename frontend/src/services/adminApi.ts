/**
 * Admin API Client
 * API methods for admin dashboard functionality
 */

import api from '../lib/api';

// ============================================
// Types
// ============================================

export interface AdminUser {
    id: number;
    email: string;
    name: string;
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

export interface UserCountResponse {
    count: number;
}

// ============================================
// API Methods
// ============================================

/**
 * Get user count
 */
export async function getUserCount(): Promise<UserCountResponse> {
    const response = await api.get('/api/admin/users/count');
    return response.data.data;
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
    const response = await api.get('/api/admin/users/search', {
        params: { query, page, limit, plan }
    });
    return response.data.data;
}

/**
 * Get user IDs matching query
 */
export async function getUserIds(query?: string): Promise<{ ids: number[] }> {
    const response = await api.get('/api/admin/users/ids', {
        params: { query }
    });
    return response.data.data;
}

/**
 * Get users by IDs
 */
export async function getUsersByIds(ids: number[]): Promise<{ users: AdminUser[] }> {
    const response = await api.get('/api/admin/users/by-ids', {
        params: { ids: ids.join(',') }
    });
    return response.data.data;
}

/**
 * Get system statistics
 */
export async function getStats(): Promise<SystemStats> {
    const response = await api.get('/api/admin/stats');
    return response.data.data;
}

/**
 * Update admin's own plan (for testing)
 */
export async function updateMyPlan(plan: string): Promise<{ message: string; plan: string }> {
    const response = await api.patch('/api/admin/me/plan', { plan });
    return response.data.data;
}
