import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactDetailPage } from '@/pages/contacts/ContactDetailPage';
import { TooltipProvider } from '@/components/ui/tooltip';
import { EstimateEditorPage } from './EstimateEditorPage';

const contactsApi = vi.hoisted(() => ({
  getContact: vi.fn(),
  getContactDetailBootstrap: vi.fn(),
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

const editorApi = vi.hoisted(() => ({
  getEstimateEditorBootstrapViaGraphql: vi.fn(),
}));

const toast = vi.hoisted(() => vi.fn());

vi.mock('@/services/contactsApi', () => contactsApi);
vi.mock('@/services/invoicesApi', () => invoicesApi);
vi.mock('@/services/estimatesApi', () => estimatesApi);
vi.mock('@/services/salesDocumentEditorGraphql', () => editorApi);
vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({ organizationId: 42 }),
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));
vi.mock('@/components/layout/PageLayout', () => ({
  PageLayout: ({
    children,
    pageActions,
    headerTools,
  }: {
    children: React.ReactNode;
    pageActions?: React.ReactNode;
    headerTools?: { secondaryAction?: React.ReactNode; primaryAction?: React.ReactNode };
  }) => (
    <TooltipProvider>
      <div data-testid="page-actions">{pageActions ?? headerTools?.primaryAction}</div>
      <div data-testid="secondary-actions">{headerTools?.secondaryAction}</div>
      {children}
    </TooltipProvider>
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

const renderApp = (ui: React.ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
};

describe('contact to estimate handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contactsApi.getContact.mockResolvedValue(contact);
    contactsApi.getContactDetailBootstrap.mockResolvedValue({
      contact,
      activities: [],
      relatedContent: {
        lists: [],
        notes: [],
        whiteboards: [],
        wireframes: [],
      },
    });
    contactsApi.getContacts.mockResolvedValue([]);
    contactsApi.getContactActivities.mockResolvedValue([]);
    contactsApi.getContactContent.mockResolvedValue({
      lists: [],
      notes: [],
      whiteboards: [],
      wireframes: [],
    });
    invoicesApi.getProducts.mockResolvedValue([]);
    editorApi.getEstimateEditorBootstrapViaGraphql.mockResolvedValue({
      contacts: [],
      products: [],
      estimate: null,
      initialContact: null,
    });
  });

  it('promotes one responsive Create Estimate shell action and passes only contactId', async () => {
    renderApp(
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
    expect(contactsApi.getContactDetailBootstrap).toHaveBeenCalledWith(
      17,
      42,
      expect.any(AbortSignal),
    );
    expect(createEstimateActions).toHaveLength(2);
    expect(screen.getByTestId('page-actions')).toContainElement(createEstimateActions[0]);

    fireEvent.click(createEstimateActions[0]);

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/estimates/new?contactId=17',
    );
    expect(screen.getByTestId('location')).not.toHaveTextContent('ada@example.com');
  });

  it('loads the authoritative contact and prefills the new estimate', async () => {
    editorApi.getEstimateEditorBootstrapViaGraphql.mockResolvedValue({
      contacts: [],
      products: [],
      estimate: null,
      initialContact: contact,
    });
    renderApp(
      <MemoryRouter initialEntries={['/estimates/new?contactId=17']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(editorApi.getEstimateEditorBootstrapViaGraphql)
        .toHaveBeenCalledWith(42, null, 17, expect.any(AbortSignal));
    });

    await waitFor(() => {
      expect(document.querySelector('#estimate-customer-name')).toHaveValue('Ada Lovelace');
      expect(document.querySelector('#estimate-customer-email')).toHaveValue('ada@example.com');
      expect(document.querySelector('#estimate-customer-phone')).toHaveValue('602-555-0117');
      expect(document.querySelector('#estimate-customer-address')).toHaveValue(
        '123 Main St, Phoenix, AZ, 85001, US',
      );
    });
  });

  it('ignores malformed contact identifiers', async () => {
    renderApp(
      <MemoryRouter initialEntries={['/estimates/new?contactId=17-invalid']}>
        <Routes>
          <Route path="/estimates/:id" element={<EstimateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(editorApi.getEstimateEditorBootstrapViaGraphql)
        .toHaveBeenCalledWith(42, null, null, expect.any(AbortSignal));
    });
    await waitFor(() => {
      expect(document.querySelector('#estimate-customer-name')).toHaveValue('');
    });
  });
});
