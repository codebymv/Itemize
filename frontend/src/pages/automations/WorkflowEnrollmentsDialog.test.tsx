import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowEnrollmentsDialog } from './WorkflowEnrollmentsDialog';

const api = vi.hoisted(() => ({
  cancelEnrollment: vi.fn(),
  enrollContact: vi.fn(),
  getContacts: vi.fn(),
  getWorkflowEnrollments: vi.fn(),
  pauseEnrollment: vi.fn(),
  resumeEnrollment: vi.fn(),
  retryEnrollment: vi.fn(),
}));

vi.mock('@/services/automationsApi', () => ({
  cancelEnrollment: api.cancelEnrollment,
  enrollContact: api.enrollContact,
  getWorkflowEnrollments: api.getWorkflowEnrollments,
  pauseEnrollment: api.pauseEnrollment,
  resumeEnrollment: api.resumeEnrollment,
  retryEnrollment: api.retryEnrollment,
}));

vi.mock('@/services/contactsApi', () => ({ getContacts: api.getContacts }));

const enrollment = (id: number, status: 'active' | 'paused' | 'failed') => ({
  id, workflow_id: 9, contact_id: id + 100, current_step: 1, status,
  trigger_data: {}, context: {}, enrolled_at: '2026-07-21T10:00:00Z',
  first_name: status, last_name: 'Contact', email: `${status}@example.test`,
});

describe('WorkflowEnrollmentsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.getContacts.mockResolvedValue({
      contacts: [{
        id: 22, organization_id: 4, first_name: 'Ada', last_name: 'Lovelace',
        email: 'ada@example.test', address: {}, source: 'manual', status: 'active',
        custom_fields: {}, tags: [], created_at: '2026-07-21T10:00:00Z', updated_at: '2026-07-21T10:00:00Z',
      }],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    });
    api.getWorkflowEnrollments.mockResolvedValue({
      enrollments: [enrollment(1, 'active'), enrollment(2, 'paused'), enrollment(3, 'failed')],
      pagination: { page: 1, limit: 50, total: 3, totalPages: 1 },
    });
    for (const mock of [api.enrollContact, api.pauseEnrollment, api.resumeEnrollment,
      api.retryEnrollment, api.cancelEnrollment]) mock.mockResolvedValue({});
  });

  it('enrolls a selected contact and exposes state-appropriate lifecycle actions', async () => {
    render(<WorkflowEnrollmentsDialog open onOpenChange={vi.fn()} organizationId={4} workflowId={9} />);

    expect(await screen.findByRole('dialog', { name: 'Enrollments' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /Ada Lovelace/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Contact'), { target: { value: '22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enroll' }));
    await waitFor(() => expect(api.enrollContact).toHaveBeenCalledWith(9, 22, 4, { source: 'manual' }));

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(api.pauseEnrollment).toHaveBeenCalledWith(9, 1, 4));
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(api.resumeEnrollment).toHaveBeenCalledWith(9, 2, 4));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(api.retryEnrollment).toHaveBeenCalledWith(9, 3, 4));
  });

  it('requires confirmation before terminal cancellation', async () => {
    render(<WorkflowEnrollmentsDialog open onOpenChange={vi.fn()} organizationId={4} workflowId={9} />);
    await screen.findByText('active Contact');
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    await waitFor(() => expect(api.cancelEnrollment).toHaveBeenCalledWith(9, 1, 4));
    expect(window.confirm).toHaveBeenCalledWith('Cancel this enrollment? This cannot be resumed.');
  });
});
