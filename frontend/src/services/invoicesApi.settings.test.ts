import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { deleteLogo, getPaymentSettings, updatePaymentSettings } from './invoicesApi';
import {
  isInvoiceSettingsGraphqlMutationsEnabled,
  isInvoiceSettingsGraphqlReadsEnabled,
} from './graphqlClient';
import {
  getInvoiceSettingsViaGraphql,
  removeInvoiceSettingsLogoViaGraphql,
  updateInvoiceSettingsViaGraphql,
} from './invoiceSettingsGraphql';

vi.mock('@/lib/api', () => ({
  default: { delete: vi.fn(), get: vi.fn(), put: vi.fn() },
}));
vi.mock('./graphqlClient', () => ({
  isInvoiceSettingsGraphqlMutationsEnabled: vi.fn(),
  isInvoiceSettingsGraphqlReadsEnabled: vi.fn(),
  isInvoiceBusinessGraphqlMutationsEnabled: vi.fn(() => false),
  isInvoiceBusinessGraphqlReadsEnabled: vi.fn(() => false),
  isInvoiceGraphqlMutationsEnabled: vi.fn(() => false),
  isInvoiceGraphqlReadsEnabled: vi.fn(() => false),
  isPaymentGraphqlMutationsEnabled: vi.fn(() => false),
  isProductGraphqlMutationsEnabled: vi.fn(() => false),
  isProductGraphqlReadsEnabled: vi.fn(() => false),
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

describe('invoice settings API transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isInvoiceSettingsGraphqlReadsEnabled).mockReturnValue(false);
    vi.mocked(isInvoiceSettingsGraphqlMutationsEnabled).mockReturnValue(false);
  });

  it('keeps settings reads and writes on REST by default', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: settings } });
    vi.mocked(api.put).mockResolvedValue({ data: { data: settings } });
    vi.mocked(api.delete).mockResolvedValue({ data: { data: { success: true } } });
    await getPaymentSettings(7);
    await updatePaymentSettings({ default_tax_rate: 10 }, 7);
    await deleteLogo(7);
    expect(api.get).toHaveBeenCalledWith('/api/invoices/settings', {
      headers: { 'x-organization-id': '7' },
    });
    expect(api.put).toHaveBeenCalled();
    expect(api.delete).toHaveBeenCalledWith('/api/invoices/settings/logo', {
      headers: { 'x-organization-id': '7' },
    });
    expect(getInvoiceSettingsViaGraphql).not.toHaveBeenCalled();
  });

  it('routes settings reads and writes independently', async () => {
    vi.mocked(isInvoiceSettingsGraphqlReadsEnabled).mockReturnValue(true);
    vi.mocked(getInvoiceSettingsViaGraphql).mockResolvedValue(settings);
    await getPaymentSettings(7);
    expect(getInvoiceSettingsViaGraphql).toHaveBeenCalledWith(7);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();

    vi.mocked(isInvoiceSettingsGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(updateInvoiceSettingsViaGraphql).mockResolvedValue(settings);
    vi.mocked(removeInvoiceSettingsLogoViaGraphql).mockResolvedValue({ success: true });
    await updatePaymentSettings({ default_tax_rate: 10 }, 7);
    await deleteLogo(7);
    expect(updateInvoiceSettingsViaGraphql).toHaveBeenCalledWith(
      { default_tax_rate: 10 },
      7,
    );
    expect(api.put).not.toHaveBeenCalled();
    expect(removeInvoiceSettingsLogoViaGraphql).toHaveBeenCalledWith(7);
    expect(api.delete).not.toHaveBeenCalled();
  });
});
