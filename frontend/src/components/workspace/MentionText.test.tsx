import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MentionText } from './MentionText';
import type { WorkspaceReference } from '@/types';

const invoice: WorkspaceReference = {
  entityType: 'invoice',
  entityId: 4,
  label: 'INV-0012',
  status: 'sent',
  total: '1250.50',
  currency: 'USD',
  sentAt: '2026-09-04T12:00:00.000Z',
  viewedAt: '2026-09-05T12:00:00.000Z',
  paidAt: null,
  acceptedAt: null,
  declinedAt: null,
};

describe('MentionText', () => {
  it('renders plain text untouched', () => {
    render(<MentionText text="Measure cabinets" />);
    expect(screen.getByText('Measure cabinets')).toBeInTheDocument();
  });

  it('renders client and money tokens as pills with their sigils', () => {
    render(<MentionText text="Call @[Casey Sanchez](contact:1) about $[INV-0012](invoice:4)" />);
    expect(screen.getByText('@Casey Sanchez')).toHaveAttribute('data-entity-type', 'contact');
    expect(screen.getByText('$INV-0012')).toHaveAttribute('data-entity-type', 'invoice');
  });

  it('shows a money pill with its live state from the hydrated references', () => {
    render(<MentionText text="Chase $[INV-0012](invoice:4)" references={[invoice]} />);
    const pill = screen.getByText(/\$INV-0012/);
    expect(pill).toHaveTextContent(/sent · viewed/);
    expect(pill).toHaveAttribute('title', expect.stringMatching(/^INV-0012 · sent · viewed/));
  });

  it('prefers the hydrated label over the stored one', () => {
    render(<MentionText text="Chase $[old-number](invoice:4)" references={[invoice]} />);
    expect(screen.getByText(/\$INV-0012/)).toBeInTheDocument();
    expect(screen.queryByText(/old-number/)).not.toBeInTheDocument();
  });
});
