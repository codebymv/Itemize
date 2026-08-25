import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationSettings } from './OrganizationSettings';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: vi.fn(),
  refresh: vi.fn(),
  organization: {
    id: 7,
    name: 'Ada Studio',
    slug: 'ada-studio',
    settings: {
      timezone: 'America/Phoenix',
      locale: 'en-US',
      defaultBusinessId: 12,
    },
    role: 'owner' as const,
    is_default: true,
    created_at: '2026-08-24T00:00:00.000Z',
    updated_at: '2026-08-24T00:00:00.000Z',
  },
  getMembers: vi.fn(),
  getBusinesses: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuthState: () => ({ currentUser: { uid: '4', name: 'Ada', email: 'ada@example.com' } }),
}));
vi.mock('@/contexts/organization-context', () => ({
  useOrganizationContext: () => ({
    organization: mocks.organization,
    organizationId: mocks.organization.id,
    organizations: [mocks.organization],
    refresh: mocks.refresh,
  }),
}));
vi.mock('@/services/contactsApi', () => ({
  deleteOrganization: vi.fn(),
  getOrganizationMembers: (...args: unknown[]) => mocks.getMembers(...args),
  inviteMember: vi.fn(),
  leaveOrganization: vi.fn(),
  removeMember: vi.fn(),
  updateMemberRole: vi.fn(),
  updateOrganization: vi.fn(),
}));
vi.mock('@/services/invoicesApi', () => ({
  getBusinesses: (...args: unknown[]) => mocks.getBusinesses(...args),
}));

describe('OrganizationSettings', () => {
  beforeEach(() => {
    mocks.getMembers.mockResolvedValue([
      {
        id: 21,
        organization_id: 7,
        user_id: 4,
        role: 'owner',
        invited_at: '2026-08-24T00:00:00.000Z',
        joined_at: '2026-08-24T00:00:00.000Z',
        user_name: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    ]);
    mocks.getBusinesses.mockResolvedValue([
      {
        id: 12,
        organization_id: 7,
        name: 'Ada Consulting',
        is_active: true,
        created_at: '2026-08-24T00:00:00.000Z',
        updated_at: '2026-08-24T00:00:00.000Z',
      },
    ]);
  });

  it('presents workspace identity, regional defaults, business identity, and members', async () => {
    render(<OrganizationSettings />);

    expect(screen.getByDisplayValue('Ada Studio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Time zone')).toHaveTextContent('America/Phoenix');
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.getByLabelText('Default business identity')).toHaveTextContent('Ada Consulting');
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete organization/i })).toBeInTheDocument();
  });
});
