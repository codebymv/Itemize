import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarSettingsPage from './CalendarSettingsPage';

const apiMocks = vi.hoisted(() => ({
    getCalendar: vi.fn(),
    updateCalendar: vi.fn(),
    updateCalendarAvailability: vi.fn(),
}));

const toastMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/calendarsApi', () => apiMocks);
vi.mock('@/hooks/useOrganization', () => ({
    useOrganization: () => ({
        organizationId: 42,
        organization: { id: 42, name: 'Test organization' },
        isLoading: false,
        error: null,
        refresh: vi.fn(),
    }),
}));
vi.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: toastMock }),
}));
vi.mock('@/contexts/HeaderContext', () => ({
    useHeader: () => ({ setHeaderContent: vi.fn() }),
}));

const calendar = {
    id: 7,
    organization_id: 42,
    name: 'Consultation',
    description: 'A focused call',
    slug: 'consultation-a1b2c3d4',
    timezone: 'America/Phoenix',
    duration_minutes: 30,
    buffer_before_minutes: 5,
    buffer_after_minutes: 10,
    min_notice_hours: 24,
    max_future_days: 60,
    assigned_to: 9,
    assigned_to_name: 'Ada',
    assignment_mode: 'specific' as const,
    confirmation_email: true,
    reminder_email: true,
    reminder_hours: 24,
    color: '#3B82F6',
    is_active: true,
    created_at: '2026-07-18T12:00:00.000Z',
    updated_at: '2026-07-18T12:01:00.000Z',
    availability_windows: [
        {
            id: 11,
            calendar_id: 7,
            day_of_week: 1,
            start_time: '09:00:00',
            end_time: '17:00:00',
            is_active: true,
        },
    ],
    date_overrides: [
        {
            id: 15,
            calendar_id: 7,
            override_date: '2026-08-01',
            is_available: false,
            reason: 'Holiday',
            created_at: '2026-07-18T12:00:00.000Z',
        },
    ],
};

const renderPage = () => render(
    <MemoryRouter initialEntries={['/calendars/7']}>
        <Routes>
            <Route path="/calendars/:id" element={<CalendarSettingsPage />} />
        </Routes>
    </MemoryRouter>,
);

describe('CalendarSettingsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiMocks.getCalendar.mockResolvedValue(calendar);
        apiMocks.updateCalendar.mockImplementation(async (_id, update) => ({
            ...calendar,
            ...update,
        }));
        apiMocks.updateCalendarAvailability.mockImplementation(async (_id, windows) => ({
            availability_windows: windows,
        }));
    });

    it('loads calendar detail and renders availability and overrides', async () => {
        renderPage();

        expect(await screen.findByDisplayValue('Consultation')).toBeInTheDocument();
        expect(apiMocks.getCalendar).toHaveBeenCalledWith(7, 42);
        expect(screen.getByLabelText('Monday start')).toHaveValue('09:00');
        expect(screen.getByText('Holiday')).toBeInTheDocument();
    });

    it('saves calendar settings through the REST mutation adapter', async () => {
        renderPage();

        const name = await screen.findByLabelText('Name');
        fireEvent.change(name, { target: { value: 'Strategy call' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

        await waitFor(() => expect(apiMocks.updateCalendar).toHaveBeenCalledWith(
            7,
            expect.objectContaining({
                name: 'Strategy call',
                assigned_to: 9,
                duration_minutes: 30,
                is_active: true,
            }),
            42,
        ));
        expect(toastMock).toHaveBeenCalledWith({ title: 'Calendar settings saved' });
    });

    it('saves the edited recurring schedule through the REST availability adapter', async () => {
        renderPage();

        const mondayStart = await screen.findByLabelText('Monday start');
        fireEvent.change(mondayStart, { target: { value: '10:00' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save availability' }));

        await waitFor(() => expect(apiMocks.updateCalendarAvailability).toHaveBeenCalledWith(
            7,
            [{
                day_of_week: 1,
                start_time: '10:00',
                end_time: '17:00:00',
                is_active: true,
            }],
            42,
        ));
        expect(toastMock).toHaveBeenCalledWith({ title: 'Availability saved' });
    });
});
