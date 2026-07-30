import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  deleteLogo,
  getPaymentSettings,
  updatePaymentSettings,
  uploadLogo,
} from './invoicesApi';
import {
  getInvoiceSettingsViaGraphql,
  removeInvoiceSettingsLogoViaGraphql,
  updateInvoiceSettingsViaGraphql,
} from './invoiceSettingsGraphql';

vi.mock('@/lib/api', () => ({
  default: { post: vi.fn() },
}));
vi.mock('./graphqlClient', () => ({
  isInvoiceGraphqlMutationsEnabled: vi.fn(() => false),
  isInvoiceGraphqlReadsEnabled: vi.fn(() => false),
  isPaymentGraphqlMutationsEnabled: vi.fn(() => false),
  isRecurringInvoiceGraphqlCloneEnabled: vi.fn(() => false),
}));
vi.mock('./invoiceSettingsGraphql', () => ({
  getInvoiceSettingsViaGraphql: vi.fn(),
  removeInvoiceSettingsLogoViaGraphql: vi.fn(),
  updateInvoiceSettingsViaGraphql: vi.fn(),
}));

const settings = {
  organization_id: 7,
  stripe_connected: false,
  invoice_prefix: 'INV-',
  next_invoice_number: 1,
  default_payment_terms: 30,
  default_tax_rate: 10,
  default_currency: 'USD',
};

describe('invoice settings API transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes settings reads, writes, and logo removal through GraphQL', async () => {
    vi.mocked(getInvoiceSettingsViaGraphql).mockResolvedValue(settings);
    await getPaymentSettings(7);
    expect(getInvoiceSettingsViaGraphql).toHaveBeenCalledWith(7);

    vi.mocked(updateInvoiceSettingsViaGraphql).mockResolvedValue(settings);
    vi.mocked(removeInvoiceSettingsLogoViaGraphql).mockResolvedValue({ success: true });
    await updatePaymentSettings({ default_tax_rate: 10 }, 7);
    await deleteLogo(7);
    expect(updateInvoiceSettingsViaGraphql).toHaveBeenCalledWith(
      { default_tax_rate: 10 },
      7,
    );
    expect(removeInvoiceSettingsLogoViaGraphql).toHaveBeenCalledWith(7);
    expect(api.post).not.toHaveBeenCalled();

    vi.mocked(api.post).mockResolvedValue({
      data: { data: { success: true, logo_url: '/uploads/logos/settings.png' } },
    });
    const logo = new File(['image'], 'settings.png', { type: 'image/png' });
    await expect(uploadLogo(logo, 7)).resolves.toEqual({
      success: true,
      logo_url: '/uploads/logos/settings.png',
    });
    expect(api.post).toHaveBeenCalledWith(
      '/api/invoices/settings/logo',
      expect.any(FormData),
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-organization-id': '7',
        },
      },
    );
  });
});
