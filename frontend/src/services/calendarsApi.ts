/**
 * Calendars & Bookings API Service
 * Handles all calendar and booking-related API calls
 */
import api from '@/lib/api';
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
    description?: string;
    timezone?: string;
    duration_minutes?: number;
    buffer_before_minutes?: number;
    buffer_after_minutes?: number;
    min_notice_hours?: number;
    max_future_days?: number;
    assigned_to?: number;
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
    const response = await api.get('/api/calendars', {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
};

export const getCalendar = async (id: number, organizationId?: number): Promise<Calendar> => {
    const response = await api.get(`/api/calendars/${id}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
};

export const createCalendar = async (data: CalendarCreateData): Promise<Calendar> => {
    const response = await api.post('/api/calendars', data, {
        headers: data.organization_id ? { 'x-organization-id': data.organization_id.toString() } : {},
    });
    return response.data;
};

export const updateCalendar = async (
    id: number,
    data: Partial<CalendarCreateData>,
    organizationId?: number
): Promise<Calendar> => {
    const response = await api.put(`/api/calendars/${id}`, data, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
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
    const response = await api.put(
        `/api/calendars/${id}/availability`,
        { availability_windows },
        {
            headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
        }
    );
    return response.data;
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
    const response = await api.post(`/api/calendars/${calendarId}/date-override`, data, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
};

export const removeDateOverride = async (
    calendarId: number,
    overrideId: number,
    organizationId?: number
): Promise<void> => {
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
    return response.data;
};

export const getBooking = async (id: number, organizationId?: number): Promise<Booking> => {
    const response = await api.get(`/api/bookings/${id}`, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
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
    custom_fields?: Record<string, any>;
    organization_id?: number;
}

export const createBooking = async (data: BookingCreateData): Promise<Booking> => {
    const response = await api.post('/api/bookings', data, {
        headers: data.organization_id ? { 'x-organization-id': data.organization_id.toString() } : {},
    });
    return response.data;
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
    return response.data;
};

export const rescheduleBooking = async (
    id: number,
    data: { start_time: string; end_time: string; timezone?: string },
    organizationId?: number
): Promise<Booking> => {
    const response = await api.patch(`/api/bookings/${id}/reschedule`, data, {
        headers: organizationId ? { 'x-organization-id': organizationId.toString() } : {},
    });
    return response.data;
};

// ======================
// Public Booking API (no auth required)
// ======================

export const getPublicCalendar = async (slug: string): Promise<PublicCalendarInfo> => {
    const response = await api.get(`/api/public/book/${slug}`);
    return response.data;
};

export const getAvailableSlots = async (
    slug: string,
    startDate: string,
    endDate?: string
): Promise<AvailableSlotsResponse> => {
    const response = await api.get(`/api/public/book/${slug}/slots`, {
        params: { start_date: startDate, end_date: endDate },
    });
    return response.data;
};

export interface PublicBookingData {
    start_time: string;
    end_time?: string;
    timezone: string;
    attendee_name: string;
    attendee_email: string;
    attendee_phone?: string;
    notes?: string;
    custom_fields?: Record<string, any>;
}

export const submitPublicBooking = async (
    slug: string,
    data: PublicBookingData
): Promise<{ success: boolean; booking: Booking; message: string }> => {
    const response = await api.post(`/api/public/book/${slug}`, data);
    return response.data;
};

export const cancelPublicBooking = async (
    slug: string,
    token: string,
    reason?: string
): Promise<{ success: boolean; message: string }> => {
    const response = await api.post(`/api/public/book/${slug}/cancel/${token}`, { reason });
    return response.data;
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
