import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  createBusiness,
  deleteBusiness,
  getBusiness,
  getBusinesses,
  updateBusiness,
  uploadBusinessLogo,
} from './invoicesApi';
import {
  isInvoiceBusinessGraphqlMutationsEnabled,
  isInvoiceBusinessGraphqlReadsEnabled,
} from './graphqlClient';
import {
  createInvoiceBusinessViaGraphql,
  deleteInvoiceBusinessViaGraphql,
  getInvoiceBusinessesViaGraphql,
  getInvoiceBusinessViaGraphql,
  updateInvoiceBusinessViaGraphql,
} from './invoiceBusinessesGraphql';

vi.mock('@/lib/api', () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));
vi.mock('./graphqlClient', () => ({
  isInvoiceBusinessGraphqlMutationsEnabled: vi.fn(),
  isInvoiceBusinessGraphqlReadsEnabled: vi.fn(),
}));
vi.mock('./invoiceBusinessesGraphql', () => ({
  createInvoiceBusinessViaGraphql: vi.fn(),
  deleteInvoiceBusinessViaGraphql: vi.fn(),
  getInvoiceBusinessesViaGraphql: vi.fn(),
  getInvoiceBusinessViaGraphql: vi.fn(),
  updateInvoiceBusinessViaGraphql: vi.fn(),
}));

const business = {
  id: 8,
  organization_id: 4,
  name: 'Itemize Studio',
  email: 'billing@itemize.test',
  is_active: true,
  created_at: '2026-07-17T12:00:00.000Z',
  updated_at: '2026-07-18T12:00:00.000Z',
};

describe('invoice business API transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isInvoiceBusinessGraphqlReadsEnabled).mockReturnValue(false);
    vi.mocked(isInvoiceBusinessGraphqlMutationsEnabled).mockReturnValue(false);
  });

  it('keeps business CRUD and logo uploads on REST by default', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { data: [business] } })
      .mockResolvedValueOnce({ data: { data: business } });
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { data: business } })
      .mockResolvedValueOnce({
        data: { data: { logo_url: '/uploads/logos/safe.png' } },
      });
    vi.mocked(api.put).mockResolvedValue({ data: { data: business } });
    vi.mocked(api.delete).mockResolvedValue({
      data: { data: { success: true } },
    });
    await getBusinesses(4);
    await getBusiness(8, 4);
    await createBusiness(business, 4);
    await updateBusiness(8, { name: 'Itemize Studio' }, 4);
    await deleteBusiness(8, 4);
    await uploadBusinessLogo(
      8,
      new File(['logo'], 'logo.png', { type: 'image/png' }),
      4,
    );
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(getInvoiceBusinessesViaGraphql).not.toHaveBeenCalled();
  });

  it('switches CRUD independently while always retaining multipart HTTP', async () => {
    vi.mocked(isInvoiceBusinessGraphqlReadsEnabled).mockReturnValue(true);
    vi.mocked(isInvoiceBusinessGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(getInvoiceBusinessesViaGraphql).mockResolvedValue([business]);
    vi.mocked(getInvoiceBusinessViaGraphql).mockResolvedValue(business);
    vi.mocked(createInvoiceBusinessViaGraphql).mockResolvedValue(business);
    vi.mocked(updateInvoiceBusinessViaGraphql).mockResolvedValue(business);
    vi.mocked(deleteInvoiceBusinessViaGraphql).mockResolvedValue({
      success: true,
    });
    vi.mocked(api.post).mockResolvedValue({
      data: { data: { logo_url: '/uploads/logos/safe.png' } },
    });
    await getBusinesses(4);
    await getBusiness(8, 4);
    await createBusiness(business, 4);
    await updateBusiness(8, { name: 'Itemize Studio' }, 4);
    await deleteBusiness(8, 4);
    await uploadBusinessLogo(
      8,
      new File(['logo'], 'logo.png', { type: 'image/png' }),
      4,
    );
    expect(getInvoiceBusinessesViaGraphql).toHaveBeenCalledWith(4);
    expect(getInvoiceBusinessViaGraphql).toHaveBeenCalledWith(8, 4);
    expect(createInvoiceBusinessViaGraphql).toHaveBeenCalledWith(business, 4);
    expect(updateInvoiceBusinessViaGraphql).toHaveBeenCalledWith(
      8,
      { name: 'Itemize Studio' },
      4,
    );
    expect(deleteInvoiceBusinessViaGraphql).toHaveBeenCalledWith(8, 4);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(
      '/api/invoices/businesses/8/logo',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'multipart/form-data',
          'x-organization-id': '4',
        }),
      }),
    );
  });
});
