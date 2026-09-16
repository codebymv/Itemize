import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import ClientTaskOrganizationGate from './ClientTaskOrganizationGate';

let organizationId: number | null = 20;
let loading = false;
vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({ organizationId, isLoading: loading, error: null }),
}));
vi.mock('@/components/AppShell', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/layout/PageLayout', () => ({ PageLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('./ClientTasksPanel', () => ({ ClientTasksPanel: () => <p data-testid="task-panel">Task data</p> }));

beforeEach(() => { organizationId = 20; loading = false; });
const page = (query: string) => <MemoryRouter initialEntries={[`/contacts?${query}`]}>
  <ClientTaskOrganizationGate><p>Organization plan gate</p></ClientTaskOrganizationGate>
</MemoryRouter>;

it('shows the organization prompt before a Free organization upgrade gate, then restores plan checks', () => {
  const view = render(page('view=follow-ups&taskId=42&organizationId=21'));
  expect(screen.getByRole('alert')).toHaveTextContent('Select organization 21');
  expect(screen.queryByText('Organization plan gate')).not.toBeInTheDocument();
  expect(screen.queryByTestId('task-panel')).not.toBeInTheDocument();

  organizationId = 21;
  view.rerender(page('view=follow-ups&taskId=42&organizationId=21'));
  expect(screen.getByText('Organization plan gate')).toBeInTheDocument();
  expect(screen.queryByTestId('task-panel')).not.toBeInTheDocument();
});

it('waits for organization bootstrap without loading task data', () => {
  organizationId = null; loading = true;
  render(page('view=follow-ups&taskId=42&organizationId=21'));
  expect(screen.getByRole('status')).toHaveTextContent('Loading organization');
  expect(screen.queryByText('Organization plan gate')).not.toBeInTheDocument();
  expect(screen.queryByTestId('task-panel')).not.toBeInTheDocument();
});

it.each(['', 'view=follow-ups', 'view=follow-ups&taskId=42&organizationId=20'])('retains plan checks for %s', (query) => {
  render(page(query));
  expect(screen.getByText('Organization plan gate')).toBeInTheDocument();
});
