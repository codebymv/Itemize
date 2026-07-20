import type { PaymentSettings } from './invoicesApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlInvoiceSettings = {
  id: number | null;
  organizationId: number;
  stripeAccountId: string | null;
  stripePublishableKey: string | null;
  stripeConnected: boolean;
  stripeConnectedAt: string | null;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  defaultPaymentTerms: number;
  defaultNotes: string | null;
  defaultTerms: string | null;
  defaultTaxRate: string;
  taxId: string | null;
  businessName: string | null;
  businessAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  logoUrl: string | null;
  defaultCurrency: string;
  createdAt: string | null;
  updatedAt: string | null;
};

const fields = `
  id organizationId stripeAccountId stripePublishableKey stripeConnected
  stripeConnectedAt invoicePrefix nextInvoiceNumber defaultPaymentTerms
  defaultNotes defaultTerms defaultTaxRate taxId businessName businessAddress
  businessPhone businessEmail logoUrl defaultCurrency createdAt updatedAt
`;

const optional = (value: string | undefined): string | null | undefined => {
  if (value === undefined) return undefined;
  return value.trim() ? value : null;
};

export const mapInvoiceSettings = (
  settings: GraphqlInvoiceSettings,
): PaymentSettings => ({
  ...(settings.id === null ? {} : { id: settings.id }),
  organization_id: settings.organizationId,
  ...(settings.stripeAccountId === null
    ? {}
    : { stripe_account_id: settings.stripeAccountId }),
  ...(settings.stripePublishableKey === null
    ? {}
    : { stripe_publishable_key: settings.stripePublishableKey }),
  stripe_connected: settings.stripeConnected,
  ...(settings.stripeConnectedAt === null
    ? {}
    : { stripe_connected_at: settings.stripeConnectedAt }),
  invoice_prefix: settings.invoicePrefix,
  next_invoice_number: settings.nextInvoiceNumber,
  default_payment_terms: settings.defaultPaymentTerms,
  ...(settings.defaultNotes === null ? {} : { default_notes: settings.defaultNotes }),
  ...(settings.defaultTerms === null ? {} : { default_terms: settings.defaultTerms }),
  default_tax_rate: Number(settings.defaultTaxRate),
  ...(settings.taxId === null ? {} : { tax_id: settings.taxId }),
  ...(settings.businessName === null ? {} : { business_name: settings.businessName }),
  ...(settings.businessAddress === null
    ? {}
    : { business_address: settings.businessAddress }),
  ...(settings.businessPhone === null
    ? {}
    : { business_phone: settings.businessPhone }),
  ...(settings.businessEmail === null
    ? {}
    : { business_email: settings.businessEmail }),
  ...(settings.logoUrl === null ? {} : { logo_url: settings.logoUrl }),
  default_currency: settings.defaultCurrency,
  ...(settings.createdAt === null ? {} : { created_at: settings.createdAt }),
  ...(settings.updatedAt === null ? {} : { updated_at: settings.updatedAt }),
});

export const mapInvoiceSettingsInput = (settings: Partial<PaymentSettings>) => ({
  ...(settings.invoice_prefix === undefined
    ? {}
    : { invoicePrefix: settings.invoice_prefix }),
  ...(settings.next_invoice_number === undefined
    ? {}
    : { nextInvoiceNumber: settings.next_invoice_number }),
  ...(settings.default_payment_terms === undefined
    ? {}
    : { defaultPaymentTerms: settings.default_payment_terms }),
  ...(settings.default_notes === undefined
    ? {}
    : { defaultNotes: optional(settings.default_notes) }),
  ...(settings.default_terms === undefined
    ? {}
    : { defaultTerms: optional(settings.default_terms) }),
  ...(settings.default_tax_rate === undefined
    ? {}
    : { defaultTaxRate: String(settings.default_tax_rate) }),
  ...(settings.tax_id === undefined ? {} : { taxId: optional(settings.tax_id) }),
  ...(settings.business_name === undefined
    ? {}
    : { businessName: optional(settings.business_name) }),
  ...(settings.business_address === undefined
    ? {}
    : { businessAddress: optional(settings.business_address) }),
  ...(settings.business_phone === undefined
    ? {}
    : { businessPhone: optional(settings.business_phone) }),
  ...(settings.business_email === undefined
    ? {}
    : { businessEmail: optional(settings.business_email) }),
  ...(settings.default_currency === undefined
    ? {}
    : { defaultCurrency: settings.default_currency }),
});

export const getInvoiceSettingsViaGraphql = async (
  organizationId?: number,
): Promise<PaymentSettings> => {
  const data = await graphqlRequest<
    { invoiceSettings: GraphqlInvoiceSettings },
    Record<string, never>
  >(
    `query InvoiceSettings { invoiceSettings { ${fields} } }`,
    {},
    organizationId,
  );
  return mapInvoiceSettings(data.invoiceSettings);
};

export const updateInvoiceSettingsViaGraphql = async (
  settings: Partial<PaymentSettings>,
  organizationId?: number,
): Promise<PaymentSettings> => {
  const input = mapInvoiceSettingsInput(settings);
  const data = await graphqlMutationRequest<
    { updateInvoiceSettings: GraphqlInvoiceSettings },
    { input: typeof input }
  >(
    `mutation UpdateInvoiceSettings($input: UpdateInvoiceSettingsInput!) {
      updateInvoiceSettings(input: $input) { ${fields} }
    }`,
    { input },
    organizationId,
  );
  return mapInvoiceSettings(data.updateInvoiceSettings);
};

export const removeInvoiceSettingsLogoViaGraphql = async (
  organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<{
    removeInvoiceSettingsLogo: { success: boolean; cleanupQueued: boolean };
  }, Record<string, never>>(
    `mutation RemoveInvoiceSettingsLogo {
      removeInvoiceSettingsLogo { success cleanupQueued }
    }`,
    {},
    organizationId,
  );
  return { success: data.removeInvoiceSettingsLogo.success };
};
