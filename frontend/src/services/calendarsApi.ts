/**
 * Calendars & Bookings API Service
 * Handles all calendar and booking-related API calls
 */
import api from '@/lib/api';
import type { JsonRecord } from '@/types';
import {
    createCalendarViaGraphql,
    deleteCalendarDateOverrideViaGraphql,
    getCalendarViaGraphql,
    getCalendarsViaGraphql,
    replaceCalendarAvailabilityViaGraphql,
    upsertCalendarDateOverrideViaGraphql,
    updateCalendarViaGraphql,
} from './calendarsGraphql';
import {
    isCalendarGraphqlAvailabilityMutationsEnabled,
    isCalendarGraphqlMutationsEnabled,
    isCalendarGraphqlReadsEnabled,
} from './graphqlClient';

const unwrapResponse = <T>(payload: unknown): T => {
    if (payload && typeof payload === 'object' && 'data' in payload) {
        return payload.data as T;
    }
    return payload as T;
};
import {
    Calendar,
    CalendarsResponse,
    Booking,
    BookingsResponse,
    AvailabilityWindow,
    CalendarDateOverride,
    PublicCalendarInfo,
    AvailableSlotsResponse,
} from '@/types';

// ======================
// Calendars API
// ======================

export interface CalendarCreateData {
    name: string;
    description?: string | null;
    timezone?: string;
    duration_minutes?: number;
    buffer_before_minutes?: number;
    buffer_after_minutes?: number;
    min_notice_hours?: number;
    max_future_days?: number;
    assigned_to?: number | null;
    assignment_mode?: 'specific' | 'round_robin';
    confirmation_email?: boolean;
    reminder_email?: boolean;
    reminder_hours?: number;
    color?: string;
    is_active?: boolean;
    availability_windows?: AvailabilityWindow[];
    organization_id?: number;
}

export const getCalendars = async (organizationId?: number): Promise<CalendarsResponse> => {
    if (isCalendarGraphqlReadsEnabled()) {
        return getCalendarsViaGraphql(organizationId);
    }
    const response = await api.get('/api/calendars', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return unwrapResponse<CalendarsResponse>(response.data);
};

export const getCalendar = async (id: number, organizationId?: number): Promise<Calendar> => {
    if (isCalendarGraphqlReadsEnabled()) {
        return getCalendarViaGraphql(id, organizationId);
    }
    const response = await api.get(`/api/calendars/${id}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return unwrapResponse<Calendar>(response.data);
};

export const createCalendar = async (data: CalendarCreateData): Promise<Calendar> => {
    if (isCalendarGraphqlMutationsEnabled()) {
        return createCalendarViaGraphql(data);
    }
    const response = await api.post('/api/calendars', data, {
        headers: data.organization_id ? { 'x-organization-id': data.organization_id.toString() } : {},
    });
    return unwrapResponse<Calendar>(response.data);
};

export const updateCalendar = async (
    id: number,
    data: Partial<CalendarCreateData>,
    organizationId?: number
): Promise<Calendar> => {
    if (isCalendarGraphqlMutationsEnabled()) {
        return updateCalendarViaGraphql(id, data, organizationId);
    }
    const response = await api.put(`/api/calendars/${id}`, data, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return unwrapResponse<Calendar>(response.data);
};

export const deleteCalendar = async (id: number, organizationId?: number): Promise<void> => {
    await api.delete(`/api/calendars/${id}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
};

export const updateCalendarAvailability = async (
    id: number,
    availability_windows: AvailabilityWindow[],
    organizationId?: number
): Promise<{ availability_windows: AvailabilityWindow[] }> => {
    if (isCalendarGraphqlAvailabilityMutationsEnabled()) {
        return replaceCalendarAvailabilityViaGraphql(id, availability_windows, organizationId);
    }
    const response = await api.put(
        `/api/calendars/${id}/availability`,
        { availability_windows },
        {
            headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
        }
    );
    return unwrapResponse<{ availability_windows: AvailabilityWindow[] }>(response.data);
};

export const addDateOverride = async (
    calendarId: number,
    data: {
        override_date: string;
        is_available?: boolean;
        start_time?: string;
        end_time?: string;
        reason?: string;
    },
    organizationId?: number
): Promise<CalendarDateOverride> => {
    if (isCalendarGraphqlAvailabilityMutationsEnabled()) {
        return upsertCalendarDateOverrideViaGraphql(calendarId, data, organizationId);
    }
    const response = await api.post(`/api/calendars/${calendarId}/date-override`, data, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return unwrapResponse<CalendarDateOverride>(response.data);
};

export const removeDateOverride = async (
    calendarId: number,
    overrideId: number,
    organizationId?: number
): Promise<void> => {
    if (isCalendarGraphqlAvailabilityMutationsEnabled()) {
        return deleteCalendarDateOverrideViaGraphql(calendarId, overrideId, organizationId);
    }
    await api.delete(`/api/calendars/${calendarId}/date-override/${overrideId}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
};

// ======================
// Bookings API
// ======================

export interface BookingsQueryParams {
    calendar_id?: number;
    contact_id?: number;
    assigned_to?: number;
    status?: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
    start_date?: string;
    end_date?: string;
    page?: number;
    limit?: number;
    organization_id?: number;
}

export const getBookings = async (params: BookingsQueryParams = {}): Promise<BookingsResponse> => {
    const response = await api.get('/api/bookings', {
        params,
        headers: params.organization_id ? { 'x-organization-id': params.organization_id.toString() } : {},
    });
    return unwrapResponse<BookingsResponse>(response.data);
};

export const getBooking = async (id: number, organizationId?: number): Promise<Booking> => {
    const response = await api.get(`/api/bookings/${id}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return unwrapResponse<Booking>(response.data);
};

export interface BookingCreateData {
    calendar_id: number;
    contact_id?: number;
    title?: string;
    start_time: string;
    end_time: string;
    timezone?: string;
    attendee_name?: string;
    attendee_email?: string;
    attendee_phone?: string;
    assigned_to?: number;
    notes?: string;
    internal_notes?: string;
    custom_fields?: JsonRecord;
    organization_id?: number;
}

export const createBooking = async (data: BookingCreateData): Promise<Booking> => {
    const response = await api.post('/api/bookings', data, {
        headers: data.organization_id ? { 'x-organization-id': data.organization_id.toString() } : {},
    });
    return unwrapResponse<Booking>(response.data);
};

export const cancelBooking = async (
    id: number,
    reason?: string,
    organizationId?: number
): Promise<Booking> => {
    const response = await api.patch(
        `/api/bookings/${id}/cancel`,
        { reason },
        {
            headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
        }
    );
    return unwrapResponse<Booking>(response.data);
};

export const rescheduleBooking = async (
    id: number,
    data: { start_time: string; end_time: string; timezone?: string },
    organizationId?: number
): Promise<Booking> => {
    const response = await api.patch(`/api/bookings/${id}/reschedule`, data, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return unwrapResponse<Booking>(response.data);
};

// ======================
// Public Booking API (no auth required)
// ======================

export const getPublicCalendar = async (slug: string): Promise<PublicCalendarInfo> => {
    const response = await api.get(`/api/bookings/public/book/${slug}`);
    return unwrapResponse<PublicCalendarInfo>(response.data);
};

export const getAvailableSlots = async (
    slug: string,
    startDate: string,
    endDate?: string
): Promise<AvailableSlotsResponse> => {
    const response = await api.get(`/api/bookings/public/book/${slug}/slots`, {
        params: { start_date: startDate, end_date: endDate },
    });
    return unwrapResponse<AvailableSlotsResponse>(response.data);
};

export interface PublicBookingData {
    start_time: string;
    end_time?: string;
    timezone: string;
    attendee_name: string;
    attendee_email: string;
    attendee_phone?: string;
    notes?: string;
    custom_fields?: JsonRecord;
}

export const submitPublicBooking = async (
    slug: string,
    data: PublicBookingData
): Promise<{ success: boolean; booking: Booking; message: string }> => {
    const response = await api.post(`/api/bookings/public/book/${slug}`, data);
    return unwrapResponse<{ success: boolean; booking: Booking; message: string }>(response.data);
};

export const cancelPublicBooking = async (
    slug: string,
    token: string,
    reason?: string
): Promise<{ success: boolean; message: string }> => {
    const response = await api.post(`/api/bookings/public/book/${slug}/cancel/${token}`, { reason });
    return unwrapResponse<{ success: boolean; message: string }>(response.data);
};

// Export all
export default {
    // Calendars
    getCalendars,
    getCalendar,
    createCalendar,
    updateCalendar,
    deleteCalendar,
    updateCalendarAvailability,
    addDateOverride,
    removeDateOverride,
    // Bookings
    getBookings,
    getBooking,
    createBooking,
    cancelBooking,
    rescheduleBooking,
    // Public
    getPublicCalendar,
    getAvailableSlots,
    submitPublicBooking,
    cancelPublicBooking,
};
