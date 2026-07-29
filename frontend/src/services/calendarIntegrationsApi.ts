/**
 * Calendar Integrations API Service
 * Handles external calendar connections (Google, Outlook) on the frontend
 */
import api from '@/lib/api';
import {
    disconnectCalendarViaGraphql,
    getCalendarConnectionsViaGraphql,
    getCalendarSyncStatusViaGraphql,
    requestCalendarSyncViaGraphql,
    updateCalendarConnectionViaGraphql,
} from './calendarIntegrationsGraphql';

// ======================
// Types
// ======================

export interface CalendarConnection {
    id: number;
    provider: 'google' | 'outlook' | 'apple';
    provider_email: string | null;
    sync_enabled: boolean;
    sync_direction: 'push' | 'pull' | 'both';
    last_sync_at: string | null;
    is_active: boolean;
    error_message: string | null;
    error_count: number;
    selected_calendars: string[];
    created_at: string;
    updated_at: string;
}

export interface ExternalCalendar {
    id: string;
    summary: string;
    description?: string;
    primary: boolean;
    backgroundColor?: string;
    accessRole: string;
}

export interface SyncResult {
    message: string;
    created: boolean;
    job: CalendarSyncJob;
}

export interface CalendarSyncJob {
    id: number;
    connection_id: number;
    direction: 'push' | 'pull' | 'both';
    status: 'queued' | 'processing' | 'retry' | 'succeeded' | 'dead_letter';
    attempt_count: number;
    next_attempt_at: string;
    result: Record<string, unknown> | null;
    last_error: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface SyncStatus {
    connection: CalendarConnection;
    stats: {
        total_synced: number;
        pushed: number;
        pulled: number;
        last_event_sync: string | null;
    };
    jobs: CalendarSyncJob[];
}

// ======================
// API Functions
// ======================

/**
 * Get all calendar connections for the current user
 */
export const getCalendarConnections = async (organizationId?: number): Promise<CalendarConnection[]> => {
    return getCalendarConnectionsViaGraphql(organizationId);
};

/**
 * Disconnect a calendar integration
 */
export const disconnectCalendar = async (connectionId: number, organizationId?: number): Promise<void> => {
    return disconnectCalendarViaGraphql(connectionId, organizationId);
};

/**
 * Update connection settings
 */
export const updateCalendarConnection = async (
    connectionId: number,
    updates: {
        sync_enabled?: boolean;
        sync_direction?: 'push' | 'pull' | 'both';
        selected_calendars?: string[];
    },
    organizationId?: number
): Promise<CalendarConnection> => {
    return updateCalendarConnectionViaGraphql(connectionId, updates, organizationId);
};

/**
 * Get Google OAuth authorization URL
 */
export const getGoogleAuthUrl = async (
    returnUrl?: string,
    organizationId?: number
): Promise<{ authUrl: string }> => {
    const response = await api.get('/api/calendar-integrations/google/auth', {
        params: { return_url: returnUrl },
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Initiate Google OAuth flow (alias for getGoogleAuthUrl with organizationId as first param)
 */
export const initiateGoogleAuth = async (
    organizationId?: number,
    returnUrl?: string
): Promise<{ authUrl: string }> => {
    return getGoogleAuthUrl(returnUrl, organizationId);
};

/**
 * List available Google calendars for a connection
 */
export const listGoogleCalendars = async (
    connectionId: number,
    organizationId?: number
): Promise<ExternalCalendar[]> => {
    const response = await api.get(
        `/api/calendar-integrations/google/calendars/${connectionId}`,
        { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
    );
    return response.data;
};

/**
 * Trigger sync for a connection
 */
export const syncCalendar = async (
    connectionId: number,
    organizationId?: number
): Promise<SyncResult> => {
    return requestCalendarSyncViaGraphql(connectionId, organizationId);
};

/**
 * Get sync status for a connection
 */
export const getSyncStatus = async (
    connectionId: number,
    organizationId?: number
): Promise<SyncStatus> => {
    return getCalendarSyncStatusViaGraphql(connectionId, organizationId);
};

export default {
    getCalendarConnections,
    disconnectCalendar,
    updateCalendarConnection,
    getGoogleAuthUrl,
    initiateGoogleAuth,
    listGoogleCalendars,
    syncCalendar,
    getSyncStatus,
};
