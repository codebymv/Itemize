import type { Business } from './invoicesApi';
import type { RecurringInvoice } from './recurringInvoicesApi';
import {
  getInvoiceBusinessesViaGraphql,
  invoiceBusinessFields,
  mapBusiness,
  type GraphqlInvoiceBusiness,
} from './invoiceBusinessesGraphql';
import { graphqlRequest } from './graphqlClient';
import {
  getRecurringInvoiceNumberPreviewViaGraphql,
  getRecurringInvoiceViaGraphql,
  mapRecurringInvoice,
  recurringInvoiceDetailFields,
  type GraphqlRecurringInvoice,
} from './recurringInvoicesGraphql';

export interface RecurringInvoicePreviewBootstrapData {
  recurringInvoice: RecurringInvoice;
  previewInvoiceNumber: string;
  business: Business | null;
}

type Capability = 'unknown' | 'aggregate' | 'legacy';
let capability: Capability = 'unknown';

const query = `
  query RecurringInvoicePreviewBootstrap($recurringInvoiceId: Int!) {
    recurringInvoicePreviewBootstrap(
      recurringInvoiceId: $recurringInvoiceId
    ) {
      recurringInvoice { ${recurringInvoiceDetailFields} }
      previewInvoiceNumber
      business { ${invoiceBusinessFields} }
    }
  }
`;

const legacyBootstrap = async (
  organizationId: number,
  recurringInvoiceId: number,
  signal?: AbortSignal,
): Promise<RecurringInvoicePreviewBootstrapData> => {
  const [recurringInvoice, previewInvoiceNumber, businesses] = await Promise.all([
    getRecurringInvoiceViaGraphql(recurringInvoiceId, organizationId, signal),
    getRecurringInvoiceNumberPreviewViaGraphql(organizationId, signal),
    getInvoiceBusinessesViaGraphql(organizationId, signal),
  ]);
  return {
    recurringInvoice,
    previewInvoiceNumber,
    business: businesses[0] ?? null,
  };
};

const missingBootstrapField = (error: unknown): boolean =>
  error instanceof Error
  && error.message.includes('Cannot query field')
  && error.message.includes('recurringInvoicePreviewBootstrap');

export const getRecurringInvoicePreviewBootstrapViaGraphql = async (
  organizationId: number,
  recurringInvoiceId: number,
  signal?: AbortSignal,
): Promise<RecurringInvoicePreviewBootstrapData> => {
  if (capability === 'legacy') {
    return legacyBootstrap(organizationId, recurringInvoiceId, signal);
  }
  try {
    const data = await graphqlRequest<{
      recurringInvoicePreviewBootstrap: {
        recurringInvoice: GraphqlRecurringInvoice;
        previewInvoiceNumber: string;
        business: GraphqlInvoiceBusiness | null;
      };
    }, { recurringInvoiceId: number }>(
      query,
      { recurringInvoiceId },
      organizationId,
      signal,
    );
    capability = 'aggregate';
    const bootstrap = data.recurringInvoicePreviewBootstrap;
    return {
      recurringInvoice: mapRecurringInvoice(bootstrap.recurringInvoice),
      previewInvoiceNumber: bootstrap.previewInvoiceNumber,
      business: bootstrap.business ? mapBusiness(bootstrap.business) : null,
    };
  } catch (error) {
    if (capability === 'unknown' && missingBootstrapField(error)) {
      capability = 'legacy';
      return legacyBootstrap(organizationId, recurringInvoiceId, signal);
    }
    throw error;
  }
};

export const resetRecurringInvoicePreviewCapability = (): void => {
  capability = 'unknown';
};
