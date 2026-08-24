import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactDetailPage } from '@/pages/contacts/ContactDetailPage';
import { EstimateEditorPage } from './EstimateEditorPage';

const contactsApi = vi.hoisted(() => ({
  getContact: vi.fn(),
  getContacts: vi.fn(),
  deleteContact: vi.fn(),
  getContactActivities: vi.fn(),
  addContactActivity: vi.fn(),
  getContactContent: vi.fn(),
}));

const invoicesApi = vi.hoisted(() => ({
  getProducts: vi.fn(),
}));

const estimatesApi = vi.hoisted(() => ({
  convertEstimateToInvoice: vi.fn(),
  createEstimate: vi.fn(),
  getEstimate: vi.fn(),
  sendEstimate: vi.fn(),
  updateEstimate: vi.fn(),
}));

const toast = vi.hoisted(() => vi.fn());

vi.mock('@/services/contactsApi', () => contactsApi);
vi.mock('@/services/invoicesApi', () => invoicesApi);
vi.mock('@/services/estimatesApi', () => estimatesApi);
vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({ organizationId: 42 }),
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));
vi.mock('@/components/layout/PageLayout', () => ({
  PageLayout: ({
    children,
    headerActions,
    mobileActions,
  }: {
    children: React.ReactNode;
    headerActions?: React.ReactNode;
    mobileActions?: React.ReactNode;
  }) => (
    <>
      <div data-testid="header-actions">{headerActions}</div>
      <div data-testid="mobile-actions">{mobileActions}</div>
      {children}
    </>
  ),
}));

const contact = {
  id: 17,
  organization_id: 42,
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  phone: '602-555-0117',
  company: 'Analytical Engines',
  job_title: 'Founder',
  address: {
    street: '123 Main St',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
    country: 'US',
  },
  source: 'manual' as const,
  status: 'active' as const,
  custom_fields: {},
  tags: [],
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

describe('contact to estimate handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contactsApi.getContact.mockResolvedValue(contact);
    contactsApi.getContacts.mockResolvedValue([]);
    contactsApi.getContactActivities.mockResolvedValue([]);
    contactsApi.getContactContent.mockResolvedValue({
      lists: [],
      notes: [],
      whiteboards: [],
    });
    invoicesApi.getProducts.mockResolvedValue([]);
  });

  it('promotes Create Estimate across responsive actions and passes only contactId', async () => {
    render(
      <MemoryRouter initialEntries={['/contacts/17']}>
        <Routes>
          <Route path="/contacts/:id" element={<ContactDetailPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const createEstimateActions = await screen.findAllByRole('button', {
      name: /create estimate/i,
    });
    expect(createEstimateActions).toHaveLength(3);
    expect(screen.getByTestId('header-actions')).toContainElement(createEstimateActions[0]);
    expect(screen.getByTestId('mobile-actions')).toContainElement(createEstimateActions[1]);

    fireEvent.click(createEstimateActions[1]);

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/estimates/new?contactId=17',
    );
    expect(screen.getByTestId('location')).not.toHaveTextContent('ada@example.com');
  });

  it('loads the authoritative contact and prefills the new estimate', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/new?contactId=17']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(contactsApi.getContact).toHaveBeenCalledWith(17, 42);
    });

    expect(document.querySelector('#estimate-customer-name')).toHaveValue('Ada Lovelace');
    expect(document.querySelector('#estimate-customer-email')).toHaveValue('ada@example.com');
    expect(document.querySelector('#estimate-customer-phone')).toHaveValue('602-555-0117');
    expect(document.querySelector('#estimate-customer-address')).toHaveValue(
      '123 Main St, Phoenix, AZ, 85001, US',
    );
  });

  it('ignores malformed contact identifiers', async () => {
    render(
      <MemoryRouter initialEntries={['/estimates/new?contactId=17-invalid']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(contactsApi.getContacts).toHaveBeenCalled());
    expect(contactsApi.getContact).not.toHaveBeenCalled();
    expect(document.querySelector('#estimate-customer-name')).toHaveValue('');
  });
});
