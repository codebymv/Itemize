import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarBookingPreview, type CalendarBookingPreviewConfig } from './CalendarBookingPreview';

const config: CalendarBookingPreviewConfig = {
  name: 'Discovery call',
  description: 'Find the right next step.',
  timezone: 'America/Phoenix',
  durationMinutes: 30,
  bufferAfterMinutes: 10,
  color: '#2563EB',
  isActive: true,
  liveIsActive: true,
  organizationName: 'Example Company',
  publicPath: '/book/cal_example',
};

const availability = Array.from({ length: 7 }, (_, day) => ({
  id: day + 1,
  calendar_id: 7,
  day_of_week: day,
  start_time: '09:00:00',
  end_time: '12:00:00',
  is_active: true,
}));

describe('CalendarBookingPreview', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the current calendar draft and supports device and booking interactions', async () => {
    const user = userEvent.setup();
    render(<CalendarBookingPreview config={config} availability={availability} />);

    expect(screen.getByText('Live Preview')).toBeInTheDocument();
    expect(screen.getByText('Discovery call')).toBeInTheDocument();
    expect(screen.getByText('Find the right next step.')).toBeInTheDocument();
    expect(screen.getByText('Example Company')).toBeInTheDocument();
    expect(screen.getByText('9:00 AM')).toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Mobile calendar preview' }));
    });
    expect(screen.getByRole('button', { name: 'Mobile calendar preview' })).toHaveAttribute('aria-pressed', 'true');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: '9:00 AM' }));
    });
    expect(screen.getByText('Your details')).toBeInTheDocument();
    expect(screen.getByText('Confirm booking')).toBeInTheDocument();
  });

  it('keeps the public page secondary and unavailable while the calendar is inactive', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { rerender } = render(<CalendarBookingPreview config={config} availability={availability} />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Open live booking page' }));
    });
    expect(open).toHaveBeenCalledWith('/book/cal_example', '_blank', 'noopener,noreferrer');

    rerender(<CalendarBookingPreview config={{ ...config, isActive: false, liveIsActive: false }} availability={availability} />);
    expect(screen.getByText('Previewing an inactive calendar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save an active calendar to open its live booking page' })).toBeDisabled();
  });

  it('does not present an unsaved active draft as a live public calendar', () => {
    render(<CalendarBookingPreview config={{ ...config, liveIsActive: false }} availability={availability} />);

    expect(screen.queryByText('Previewing an inactive calendar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save an active calendar to open its live booking page' })).toBeDisabled();
  });
});
