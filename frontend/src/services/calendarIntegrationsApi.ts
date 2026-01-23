/**
 * Calendar Integrations API Service
 * Handles external calendar connections (Google, Outlook) on the frontend
 */
import api from '@/lib/api';

// ======================
// Types
// ======================

export interface CalendarConnection {
    id: number;
    provider: 'google' | 'outlook' | 'apple';
    provider_email: string;
    sync_enabled: boolean;
    sync_direction: 'push' | 'pull' | 'both';
    last_sync_at: string | null;
    is_active: boolean;
    error_message: string | null;
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
    results: {
        created: number;
        updated: number;
        failed: number;
        errors?: { bookingId: number; error: string }[];
    };
}

export interface SyncStatus {
    connection: {
        id: number;
        last_sync_at: string | null;
        error_message: string | null;
        error_count: number;
        sync_enabled: boolean;
    };
    stats: {
        total_synced: number;
        pushed: number;
        pulled: number;
        last_event_sync: string | null;
    };
}

// ======================
// API Functions
// ======================

/**
 * Get all calendar connections for the current user
 */
export const getCalendarConnections = async (organizationId?: number): Promise<CalendarConnection[]> => {
    const response = await api.get('/api/calendar-integrations/connections', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
    return response.data;
};

/**
 * Disconnect a calendar integration
 */
export const disconnectCalendar = async (connectionId: number, organizationId?: number): Promise<void> => {
    await api.delete(`/api/calendar-integrations/connections/${connectionId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {}
    });
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
    const response = await api.patch(
        `/api/calendar-integrations/connections/${connectionId}`,
        updates,
        { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
    );
    return response.data;
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
    const response = await api.post(
        `/api/calendar-integrations/sync/${connectionId}`,
        {},
        { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
    );
    return response.data;
};

/**
 * Get sync status for a connection
 */
export const getSyncStatus = async (
    connectionId: number,
    organizationId?: number
): Promise<SyncStatus> => {
    const response = await api.get(
        `/api/calendar-integrations/sync-status/${connectionId}`,
        { headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {} }
    );
    return response.data;
};

export default {
    getCalendarConnections,
    disconnectCalendar,
    updateCalendarConnection,
    getGoogleAuthUrl,
    listGoogleCalendars,
    syncCalendar,
    getSyncStatus,
};
