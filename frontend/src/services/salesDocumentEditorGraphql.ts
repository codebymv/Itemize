import type { Contact } from '@/types';
import type {
  Business,
  Invoice,
  PaymentSettings,
  Product,
} from './invoicesApi';
import type { Estimate } from './estimatesApi';
import {
  contactFields,
  getContactViaGraphql,
  getContactsViaGraphql,
  type GraphqlContact,
  mapContact,
} from './contactsGraphql';
import {
  estimateDetailFields,
  getEstimateViaGraphql,
  type GraphqlEstimate,
  mapEstimate,
} from './estimatesGraphql';
import { graphqlRequest } from './graphqlClient';
import {
  getInvoiceBusinessesViaGraphql,
  type GraphqlInvoiceBusiness,
  invoiceBusinessFields,
  mapBusiness,
} from './invoiceBusinessesGraphql';
import {
  getInvoiceSettingsViaGraphql,
  type GraphqlInvoiceSettings,
  invoiceSettingsFields,
  mapInvoiceSettings,
} from './invoiceSettingsGraphql';
import {
  getInvoiceViaGraphql,
  type GraphqlInvoice,
  invoiceDetailFields,
  mapInvoice,
} from './invoicesGraphql';
import {
  getProductsViaGraphql,
  type GraphqlProduct,
  mapProduct,
  productFields,
} from './productsGraphql';

export interface InvoiceEditorBootstrapData {
  contacts: Contact[];
  products: Product[];
  businesses: Business[];
  settings: PaymentSettings;
  invoice: Invoice | null;
}

export interface EstimateEditorBootstrapData {
  contacts: Contact[];
  products: Product[];
  estimate: Estimate | null;
  initialContact: Contact | null;
}

type Capability = 'unknown' | 'aggregate' | 'legacy';
let invoiceCapability: Capability = 'unknown';
let estimateCapability: Capability = 'unknown';

const invoiceBootstrapQuery = `
  query InvoiceEditorBootstrap($invoiceId: Int) {
    invoiceEditorBootstrap(invoiceId: $invoiceId) {
      contacts { ${contactFields} }
      products { ${productFields} }
      businesses { ${invoiceBusinessFields} }
      settings { ${invoiceSettingsFields} }
      invoice { ${invoiceDetailFields} }
    }
  }
`;

const estimateBootstrapQuery = `
  query EstimateEditorBootstrap($estimateId: Int, $initialContactId: Int) {
    estimateEditorBootstrap(
      estimateId: $estimateId
      initialContactId: $initialContactId
    ) {
      contacts { ${contactFields} }
      products { ${productFields} }
      estimate { ${estimateDetailFields} }
      initialContact { ${contactFields} }
    }
  }
`;

const isMissingBootstrapField = (error: unknown, field: string): boolean =>
  error instanceof Error
  && error.message.includes('Cannot query field')
  && error.message.includes(field);

const legacyInvoiceBootstrap = async (
  organizationId: number,
  invoiceId: number | null,
  signal?: AbortSignal,
): Promise<InvoiceEditorBootstrapData> => {
  const [contacts, products, businesses, settings, invoice] = await Promise.all([
    getContactsViaGraphql({}, organizationId, signal),
    getProductsViaGraphql({}, organizationId, signal),
    getInvoiceBusinessesViaGraphql(organizationId, signal),
    getInvoiceSettingsViaGraphql(organizationId, signal),
    invoiceId == null
      ? Promise.resolve(null)
      : getInvoiceViaGraphql(invoiceId, organizationId, signal),
  ]);
  return {
    contacts: contacts.contacts,
    products,
    businesses,
    settings,
    invoice,
  };
};

const legacyEstimateBootstrap = async (
  organizationId: number,
  estimateId: number | null,
  initialContactId: number | null,
  signal?: AbortSignal,
): Promise<EstimateEditorBootstrapData> => {
  const [contactsResponse, products, estimate] = await Promise.all([
    getContactsViaGraphql({}, organizationId, signal),
    getProductsViaGraphql({}, organizationId, signal),
    estimateId == null
      ? Promise.resolve(null)
      : getEstimateViaGraphql(estimateId, organizationId, signal),
  ]);
  const listedContact = initialContactId == null
    ? null
    : contactsResponse.contacts.find((contact) => contact.id === initialContactId) ?? null;
  const initialContact = initialContactId == null || listedContact
    ? listedContact
    : await getContactViaGraphql(initialContactId, organizationId, signal);
  return {
    contacts: contactsResponse.contacts,
    products,
    estimate,
    initialContact,
  };
};

export const getInvoiceEditorBootstrapViaGraphql = async (
  organizationId: number,
  invoiceId: number | null,
  signal?: AbortSignal,
): Promise<InvoiceEditorBootstrapData> => {
  if (invoiceCapability === 'legacy') {
    return legacyInvoiceBootstrap(organizationId, invoiceId, signal);
  }
  try {
    const data = await graphqlRequest<{
      invoiceEditorBootstrap: {
        contacts: GraphqlContact[];
        products: GraphqlProduct[];
        businesses: GraphqlInvoiceBusiness[];
        settings: GraphqlInvoiceSettings;
        invoice: GraphqlInvoice | null;
      };
    }, { invoiceId: number | null }>(
      invoiceBootstrapQuery,
      { invoiceId },
      organizationId,
      signal,
    );
    invoiceCapability = 'aggregate';
    return {
      contacts: data.invoiceEditorBootstrap.contacts.map(mapContact),
      products: data.invoiceEditorBootstrap.products.map(mapProduct),
      businesses: data.invoiceEditorBootstrap.businesses.map(mapBusiness),
      settings: mapInvoiceSettings(data.invoiceEditorBootstrap.settings),
      invoice: data.invoiceEditorBootstrap.invoice
        ? mapInvoice(data.invoiceEditorBootstrap.invoice)
        : null,
    };
  } catch (error) {
    if (invoiceCapability === 'unknown'
      && isMissingBootstrapField(error, 'invoiceEditorBootstrap')) {
      invoiceCapability = 'legacy';
      return legacyInvoiceBootstrap(organizationId, invoiceId, signal);
    }
    throw error;
  }
};

export const getEstimateEditorBootstrapViaGraphql = async (
  organizationId: number,
  estimateId: number | null,
  initialContactId: number | null,
  signal?: AbortSignal,
): Promise<EstimateEditorBootstrapData> => {
  if (estimateCapability === 'legacy') {
    return legacyEstimateBootstrap(
      organizationId,
      estimateId,
      initialContactId,
      signal,
    );
  }
  try {
    const data = await graphqlRequest<{
      estimateEditorBootstrap: {
        contacts: GraphqlContact[];
        products: GraphqlProduct[];
        estimate: GraphqlEstimate | null;
        initialContact: GraphqlContact | null;
      };
    }, { estimateId: number | null; initialContactId: number | null }>(
      estimateBootstrapQuery,
      { estimateId, initialContactId },
      organizationId,
      signal,
    );
    estimateCapability = 'aggregate';
    return {
      contacts: data.estimateEditorBootstrap.contacts.map(mapContact),
      products: data.estimateEditorBootstrap.products.map(mapProduct),
      estimate: data.estimateEditorBootstrap.estimate
        ? mapEstimate(data.estimateEditorBootstrap.estimate)
        : null,
      initialContact: data.estimateEditorBootstrap.initialContact
        ? mapContact(data.estimateEditorBootstrap.initialContact)
        : null,
    };
  } catch (error) {
    if (estimateCapability === 'unknown'
      && isMissingBootstrapField(error, 'estimateEditorBootstrap')) {
      estimateCapability = 'legacy';
      return legacyEstimateBootstrap(
        organizationId,
        estimateId,
        initialContactId,
        signal,
      );
    }
    throw error;
  }
};

export const resetSalesDocumentEditorCapabilities = (): void => {
  invoiceCapability = 'unknown';
  estimateCapability = 'unknown';
};
