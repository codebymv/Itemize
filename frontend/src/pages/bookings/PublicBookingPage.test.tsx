import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicBookingPage from './PublicBookingPage';

const api = vi.hoisted(() => ({
  getPublicCalendar: vi.fn(),
  getAvailableSlots: vi.fn(),
  submitPublicBooking: vi.fn(),
  cancelPublicBooking: vi.fn(),
}));

vi.mock('@/services/calendarsApi', () => api);
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

const calendar = {
  id: 7,
  name: 'Strategy call',
  description: 'Talk through your next project.',
  slug: 'strategy-call-test',
  public_id: 'cal_public',
  timezone: 'America/Phoenix',
  duration_minutes: 30,
  min_notice_hours: 4,
  max_future_days: 60,
  color: '#3B82F6',
  is_active: true,
  organization_name: 'Northstar Studio',
  availability: [{ day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' }],
};

const slot = {
  start_time: '2026-09-01T16:00:00.000Z',
  end_time: '2026-09-01T16:30:00.000Z',
};

const renderPage = () => render(
  <MemoryRouter initialEntries={['/book/cal_public']}>
    <Routes>
      <Route path="/book/:identifier" element={<PublicBookingPage />} />
    </Routes>
  </MemoryRouter>,
);

describe('PublicBookingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPublicCalendar.mockResolvedValue(calendar);
    api.getAvailableSlots.mockResolvedValue({
      calendar: {
        id: 7,
        duration_minutes: 30,
        min_notice_hours: 4,
        max_future_days: 60,
        timezone: 'America/Phoenix',
      },
      slots: [slot],
    });
    api.submitPublicBooking.mockResolvedValue({
      success: true,
      message: 'Booking confirmed',
      booking: {
        id: 44,
        ...slot,
        timezone: 'America/Phoenix',
        attendee_name: 'Maya Patel',
        attendee_email: 'maya@example.com',
        status: 'confirmed',
        cancellation_token: 'ab'.repeat(32),
      },
    });
    api.cancelPublicBooking.mockResolvedValue({ success: true, message: 'Cancelled' });
  });

  it('loads the public calendar and server-approved slots in the branded shell', async () => {
    const { container } = renderPage();

    expect(await screen.findByText('Northstar Studio')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Strategy call' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Itemize home' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '9:00 AM' })).toBeInTheDocument();
    expect(api.getPublicCalendar).toHaveBeenCalledWith('cal_public');
    expect(api.getAvailableSlots).toHaveBeenCalledWith('cal_public', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(container.querySelector('main')).toHaveClass('bg-background', 'text-foreground');
  });

  it('submits attendee details for the explicitly selected slot', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '9:00 AM' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Maya Patel' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'maya@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));

    await waitFor(() => expect(api.submitPublicBooking).toHaveBeenCalledWith('cal_public', expect.objectContaining({
      start_time: slot.start_time,
      end_time: slot.end_time,
      attendee_name: 'Maya Patel',
      attendee_email: 'maya@example.com',
      timezone: 'America/Phoenix',
    })));
    expect(await screen.findByRole('heading', { name: 'You’re booked' })).toBeInTheDocument();
  });

  it('retains the one-time cancellation capability after confirmation', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '9:00 AM' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Maya Patel' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'maya@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    expect(screen.getByRole('heading', { name: 'Cancel this booking?' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel booking' }).at(-1)!);

    await waitFor(() => expect(api.cancelPublicBooking).toHaveBeenCalledWith('cal_public', 'ab'.repeat(32)));
    expect(await screen.findByRole('heading', { name: 'Booking cancelled' })).toBeInTheDocument();
  });
});
