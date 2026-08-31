import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IntegrationStatusRow } from '@/components/integrations/IntegrationStatusRow';

describe('IntegrationStatusRow', () => {
  it('presents a disconnected provider with one primary connection action', () => {
    render(
      <IntegrationStatusRow
        name="Google Calendar"
        description="Sync availability and bookings."
        status="disconnected"
        icon={<span>G</span>}
        primaryLabel="Connect"
        onPrimary={() => undefined}
      />,
    );

    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  });

  it('confirms destructive disconnects before invoking the action', () => {
    const onDisconnect = vi.fn();
    render(
      <IntegrationStatusRow
        name="Facebook"
        description="Bring Page messages into the inbox."
        status="connected"
        icon={<span>f</span>}
        onDisconnect={onDisconnect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Disconnect Facebook?' })).toBeInTheDocument();
    expect(onDisconnect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('does not misrepresent an unavailable status read as disconnected', () => {
    render(
      <IntegrationStatusRow
        name="Stripe"
        description="Accept invoice payments."
        status="unavailable"
        icon={<span>S</span>}
        primaryLabel="Retry"
        onPrimary={() => undefined}
      />,
    );

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Not connected')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });
});
