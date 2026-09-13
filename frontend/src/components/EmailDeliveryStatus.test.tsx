import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EmailDeliveryStatus } from './EmailDeliveryStatus';
import { hasPendingEmailOutcome } from '@/lib/emailDelivery';

describe('email provider outcomes', () => {
  it('distinguishes event, acceptance and delivery from booking status', () => {
    const { rerender } = render(<><span>Confirmed</span><EmailDeliveryStatus status="sent" event="confirmed" /></>);
    expect(screen.getByText('Confirmed')).toBeTruthy();
    expect(screen.getByText('Confirmation email accepted')).toBeTruthy();
    rerender(<EmailDeliveryStatus status="bounced" event="cancelled" />);
    expect(screen.getByText('Cancellation email bounced')).toBeTruthy();
  });
  it('does not invent outcomes for absent or unsupported evidence', () => {
    const { container, rerender } = render(<EmailDeliveryStatus status={null} />);
    expect(container.textContent).toBe('');
    rerender(<EmailDeliveryStatus status="unknown" />);
    expect(container.textContent).toBe('');
  });
  it('bounds pending refresh to ten minutes', () => {
    expect(hasPendingEmailOutcome({updated_at:new Date().toISOString()})).toBe(true);
    expect(hasPendingEmailOutcome({updated_at:new Date(Date.now()-600001).toISOString()})).toBe(false);
    expect(hasPendingEmailOutcome({updated_at:new Date().toISOString(),email_delivery_status:'delivered'})).toBe(false);
  });
});
