import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceContactLink } from './WorkspaceContactLink';

const hasFeature = vi.fn();

vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ hasFeature }),
}));

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({ organizationId: 9 }),
}));

vi.mock('@/components/subscription/UpgradeCTA', () => ({
  UpgradeCTA: ({ children }: { children?: React.ReactNode }) => (
    <button type="button" data-testid="upgrade-cta">{children}</button>
  ),
}));

vi.mock('@/components/ContactCatalogPicker', () => ({
  ContactCatalogPicker: ({
    onSelect,
  }: {
    onSelect: (contact: { id: number; first_name: string; last_name: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSelect({ id: 5, first_name: 'Casey', last_name: 'Client' })}
    >
      Pick Casey
    </button>
  ),
}));

describe('WorkspaceContactLink', () => {
  beforeEach(() => {
    hasFeature.mockReset();
    hasFeature.mockReturnValue(true);
  });

  it('shows the linked client and unlinks through onChange', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<WorkspaceContactLink contactId={5} contactName="Casey Client" onChange={onChange} />);

    expect(screen.getByText('Casey Client')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink client' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null, null));
  });

  it('opens the picker from the + beside a linked chip so cards without text can change clients', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<WorkspaceContactLink contactId={5} contactName="Casey Sanchez" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change linked client' }));
    expect(await screen.findByText('Change linked client', { selector: 'h2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pick Casey' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link client' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(5, 'Casey Client'));
  });

  it('links a picked client with its display name', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<WorkspaceContactLink contactId={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /link to client/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pick Casey' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link client' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(5, 'Casey Client'));
  });

  it('offers the upgrade instead of a picker when contacts are not part of the plan', () => {
    hasFeature.mockReturnValue(false);
    render(<WorkspaceContactLink contactId={null} onChange={vi.fn()} />);

    expect(screen.getByTestId('upgrade-cta')).toHaveTextContent('Link to a client');
    expect(screen.queryByRole('button', { name: /^link to client$/i })).not.toBeInTheDocument();
  });

  it('keeps an existing link visible but immutable without the feature', () => {
    hasFeature.mockReturnValue(false);
    render(<WorkspaceContactLink contactId={5} contactName="Casey Client" onChange={vi.fn()} />);

    expect(screen.getByText('Casey Client')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlink client' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change linked client/i })).not.toBeInTheDocument();
  });
});
