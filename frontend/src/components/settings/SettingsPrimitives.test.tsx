import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AvailabilitySettingRow } from './SettingsPrimitives';

describe('AvailabilitySettingRow', () => {
  it('associates an effect-focused label with one right-aligned switch', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <AvailabilitySettingRow
        id="calendar-active"
        label="Accept new bookings"
        checked={false}
        onCheckedChange={onCheckedChange}
        help="Inactive calendars cannot accept new bookings."
        helpLabel="About calendar availability"
      />,
    );

    const availability = screen.getByRole('switch', { name: 'Accept new bookings' });
    expect(availability).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'About calendar availability' })).toBeInTheDocument();

    await act(async () => user.click(availability));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
