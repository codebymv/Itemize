import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GleamIntegration } from './GleamIntegration';
import { createGleamPairing, changeGleamPairing, getGleamPairing } from '@/services/gleamPairingGraphql';
vi.mock('@/services/gleamPairingGraphql', () => ({createGleamPairing: vi.fn(), changeGleamPairing: vi.fn(), getGleamPairing: vi.fn()}));
const initial = {enabled: true, organizationId: 1, organizationName: 'Itemize A', assignees: [{id: 2, name: 'Sam'}], pairing: null};
beforeEach(() => {vi.resetAllMocks(); vi.mocked(getGleamPairing).mockResolvedValue(initial);});
it('freezes the code, assignee and request key across uncertain creation', async () => {
  render(<GleamIntegration organizationId={1} />);
  fireEvent.change(await screen.findByLabelText('Assign new tasks to'), {target: {value: '2'}});
  vi.mocked(createGleamPairing).mockRejectedValue(new Error('response lost'));
  fireEvent.click(screen.getByRole('button', {name: 'Create new pairing code'}));
  await screen.findByRole('button', {name: 'Retry creating code'});
  fireEvent.click(screen.getByRole('button', {name: 'Retry creating code'}));
  await waitFor(() => expect(createGleamPairing).toHaveBeenCalledTimes(2));
  expect(vi.mocked(createGleamPairing).mock.calls[1]).toEqual(vi.mocked(createGleamPairing).mock.calls[0]);
  expect(vi.mocked(createGleamPairing).mock.calls[0][1].code).toMatch(/^[a-f0-9]{64}$/);
});
it('requires explicit approval of the verified source organization and shows the saved assignee', async () => {
  const pending = {...initial, pairing: {id: 'request-id', state: 'claimed', source_name: 'Gleam A', connection_id: 'connection-id',
    connection_state: 'pending', expires_at: new Date(Date.now()+600000).toISOString(), default_assignee_id: 2, due_after_minutes: 1440}};
  vi.mocked(getGleamPairing).mockResolvedValue(pending);
  vi.mocked(changeGleamPairing).mockResolvedValue({...pending, pairing: {...pending.pairing, state: 'approved'}});
  render(<GleamIntegration organizationId={1} />);
  await screen.findByText(/New tasks will be assigned to Sam/);
  expect(changeGleamPairing).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Approve connection to Gleam A'}));
  await screen.findByText(/Approved for Gleam A/);
  expect(changeGleamPairing).toHaveBeenCalledWith(1, 'approveGleamPairing', 'request-id', expect.any(String));
});
it('shows the active delivery state and saved task defaults', async () => {
  vi.mocked(getGleamPairing).mockResolvedValue({...initial, pairing: {
    id: 'request-id', state: 'approved', source_name: 'Gleam A', connection_id: 'connection-id',
    connection_state: 'active', expires_at: new Date(Date.now()+600000).toISOString(),
    default_assignee_id: 2, due_after_minutes: 1440,
  }});
  render(<GleamIntegration organizationId={1} />);
  expect(await screen.findByText('Connected to Gleam A')).toBeInTheDocument();
  expect(screen.getByText('New Gleam voice follow-ups can create assigned tasks in Itemize.')).toBeInTheDocument();
  expect(screen.getByText('Tasks are assigned to Sam, due within 24 hours.')).toBeInTheDocument();
  expect(screen.queryByText(/Finish connecting in Gleam/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Disconnect in Itemize'})).toBeInTheDocument();
});
