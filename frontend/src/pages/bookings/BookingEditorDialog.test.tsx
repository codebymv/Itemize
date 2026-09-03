import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingEditorDialog } from './BookingEditorDialog';

const api = vi.hoisted(() => ({
  createBooking: vi.fn(),
  rescheduleBooking: vi.fn(),
}));

vi.mock('@/services/calendarsApi', () => api);

const calendar = {
  id: 7,
  organization_id: 42,
  name: 'Strategy call',
  slug: 'strategy-call',
  public_id: 'cal_public',
  timezone: 'America/Phoenix',
  duration_minutes: 30,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  min_notice_hours: 4,
  max_future_days: 60,
  assignment_mode: 'specific' as const,
  confirmation_email: true,
  reminder_email: true,
  reminder_hours: 24,
  color: '#3B82F6',
  is_active: true,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

const booking = {
  id: 19,
  organization_id: 42,
  calendar_id: 7,
  start_time: '2026-09-01T16:00:00.000Z',
  end_time: '2026-09-01T16:30:00.000Z',
  timezone: 'America/Phoenix',
  attendee_name: 'Maya Patel',
  attendee_email: 'maya@example.com',
  status: 'confirmed' as const,
  custom_fields: {},
  source: 'manual' as const,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

describe('BookingEditorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.createBooking.mockResolvedValue(booking);
    api.rescheduleBooking.mockResolvedValue({ ...booking, start_time: '2026-09-02T17:00:00.000Z' });
  });

  it('creates a manual booking in the selected calendar timezone', async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    render(
      <BookingEditorDialog
        open
        onOpenChange={onOpenChange}
        organizationId={42}
        calendars={[calendar]}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '09:30' } });
    fireEvent.change(screen.getByLabelText('Attendee name'), { target: { value: 'Maya Patel' } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'maya@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create booking' }));

    await waitFor(() => expect(api.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 42,
        calendar_id: 7,
        start_time: '2026-09-01T16:30:00.000Z',
        end_time: '2026-09-01T17:00:00.000Z',
        timezone: 'America/Phoenix',
        attendee_name: 'Maya Patel',
        attendee_email: 'maya@example.com',
      }),
      expect.any(String),
    ));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('reschedules while preserving the original duration', async () => {
    render(
      <BookingEditorDialog
        open
        onOpenChange={vi.fn()}
        organizationId={42}
        calendars={[calendar]}
        booking={booking}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-02' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }));

    await waitFor(() => expect(api.rescheduleBooking).toHaveBeenCalledWith(19, {
      start_time: '2026-09-02T17:00:00.000Z',
      end_time: '2026-09-02T17:30:00.000Z',
      timezone: 'America/Phoenix',
    }, 42));
  });

  it('single-flights creation and blocks dismissal while saving', async () => {
    let resolveCreate: ((value: typeof booking) => void) | undefined;
    api.createBooking.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    const onOpenChange = vi.fn();
    render(
      <BookingEditorDialog
        open
        onOpenChange={onOpenChange}
        organizationId={42}
        calendars={[calendar]}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '09:30' } });
    fireEvent.change(screen.getByLabelText('Attendee name'), { target: { value: 'Maya Patel' } });
    const submit = screen.getByRole('button', { name: 'Create booking' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(api.createBooking).toHaveBeenCalledTimes(1);
    expect(submit).toHaveAttribute('aria-busy', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveCreate?.(booking);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('reuses the same creation key when an unchanged request is retried', async () => {
    api.createBooking
      .mockRejectedValueOnce(new Error('Network response was lost'))
      .mockResolvedValueOnce(booking);
    render(
      <BookingEditorDialog
        open
        onOpenChange={vi.fn()}
        organizationId={42}
        calendars={[calendar]}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '09:30' } });
    fireEvent.change(screen.getByLabelText('Attendee name'), { target: { value: 'Maya Patel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create booking' }));
    await screen.findByText('Network response was lost');

    fireEvent.click(screen.getByRole('button', { name: 'Create booking' }));
    await waitFor(() => expect(api.createBooking).toHaveBeenCalledTimes(2));
    expect(api.createBooking.mock.calls[1][1]).toBe(
      api.createBooking.mock.calls[0][1],
    );
  });
});
