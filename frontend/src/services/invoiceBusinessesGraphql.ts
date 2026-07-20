import type { Business } from './invoicesApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlInvoiceBusiness = {
  id: number;
  organizationId: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  logoUrl: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const fields = `
  id organizationId name email phone address taxId logoUrl isActive
  lastUsedAt createdAt updatedAt
`;

const mapBusiness = (business: GraphqlInvoiceBusiness): Business => ({
  id: business.id,
  organization_id: business.organizationId,
  name: business.name,
  ...(business.email === null ? {} : { email: business.email }),
  ...(business.phone === null ? {} : { phone: business.phone }),
  ...(business.address === null ? {} : { address: business.address }),
  ...(business.taxId === null ? {} : { tax_id: business.taxId }),
  ...(business.logoUrl === null ? {} : { logo_url: business.logoUrl }),
  is_active: business.isActive,
  ...(business.lastUsedAt === null
    ? {}
    : { last_used_at: business.lastUsedAt }),
  created_at: business.createdAt,
  updated_at: business.updatedAt,
});

const optional = (value: string | undefined): string | null | undefined => {
  if (value === undefined) return undefined;
  return value.trim() ? value : null;
};

const mapCreateInput = (business: Partial<Business>) => ({
  name: business.name ?? '',
  ...(business.email === undefined ? {} : { email: optional(business.email) }),
  ...(business.phone === undefined ? {} : { phone: optional(business.phone) }),
  ...(business.address === undefined
    ? {}
    : { address: optional(business.address) }),
  ...(business.tax_id === undefined ? {} : { taxId: optional(business.tax_id) }),
});

const mapUpdateInput = (business: Partial<Business>) => ({
  ...(business.name === undefined ? {} : { name: business.name }),
  ...(business.email === undefined ? {} : { email: optional(business.email) }),
  ...(business.phone === undefined ? {} : { phone: optional(business.phone) }),
  ...(business.address === undefined
    ? {}
    : { address: optional(business.address) }),
  ...(business.tax_id === undefined ? {} : { taxId: optional(business.tax_id) }),
  ...(business.is_active === undefined
    ? {}
    : { isActive: business.is_active }),
});

export const getInvoiceBusinessesViaGraphql = async (
  organizationId?: number,
): Promise<Business[]> => {
  const businesses: Business[] = [];
  let page = 1;
  let hasNextPage = true;
  while (hasNextPage) {
    const data = await graphqlRequest<
      {
        invoiceBusinesses: {
          nodes: GraphqlInvoiceBusiness[];
          pageInfo: { hasNextPage: boolean };
        };
      },
      { page: { page: number; pageSize: number } }
    >(
      `query InvoiceBusinesses($page: PageInput) {
        invoiceBusinesses(page: $page) {
          nodes { ${fields} }
          pageInfo { hasNextPage }
        }
      }`,
      { page: { page, pageSize: 100 } },
      organizationId,
    );
    businesses.push(...data.invoiceBusinesses.nodes.map(mapBusiness));
    hasNextPage = data.invoiceBusinesses.pageInfo.hasNextPage;
    page += 1;
  }
  return businesses;
};

export const getInvoiceBusinessViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<Business> => {
  const data = await graphqlRequest<
    { invoiceBusiness: GraphqlInvoiceBusiness },
    { id: number }
  >(
    `query InvoiceBusiness($id: Int!) {
      invoiceBusiness(id: $id) { ${fields} }
    }`,
    { id },
    organizationId,
  );
  return mapBusiness(data.invoiceBusiness);
};

export const createInvoiceBusinessViaGraphql = async (
  business: Partial<Business>,
  organizationId?: number,
): Promise<Business> => {
  const data = await graphqlMutationRequest<
    { createInvoiceBusiness: GraphqlInvoiceBusiness },
    { input: ReturnType<typeof mapCreateInput> }
  >(
    `mutation CreateInvoiceBusiness($input: CreateInvoiceBusinessInput!) {
      createInvoiceBusiness(input: $input) { ${fields} }
    }`,
    { input: mapCreateInput(business) },
    organizationId,
  );
  return mapBusiness(data.createInvoiceBusiness);
};

export const updateInvoiceBusinessViaGraphql = async (
  id: number,
  business: Partial<Business>,
  organizationId?: number,
): Promise<Business> => {
  const data = await graphqlMutationRequest<
    { updateInvoiceBusiness: GraphqlInvoiceBusiness },
    { id: number; input: ReturnType<typeof mapUpdateInput> }
  >(
    `mutation UpdateInvoiceBusiness(
      $id: Int!,
      $input: UpdateInvoiceBusinessInput!
    ) {
      updateInvoiceBusiness(id: $id, input: $input) { ${fields} }
    }`,
    { id, input: mapUpdateInput(business) },
    organizationId,
  );
  return mapBusiness(data.updateInvoiceBusiness);
};

export const deleteInvoiceBusinessViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<
    {
      deleteInvoiceBusiness: {
        deletedId: number;
        success: boolean;
      };
    },
    { id: number }
  >(
    `mutation DeleteInvoiceBusiness($id: Int!) {
      deleteInvoiceBusiness(id: $id) { deletedId success }
    }`,
    { id },
    organizationId,
  );
  if (data.deleteInvoiceBusiness.deletedId !== id) {
    throw new Error('GraphQL business delete returned the wrong business');
  }
  return { success: data.deleteInvoiceBusiness.success };
};

export const removeInvoiceBusinessLogoViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<{
    removeInvoiceBusinessLogo: { success: boolean; cleanupQueued: boolean };
  }, { id: number }>(
    `mutation RemoveInvoiceBusinessLogo($id: Int!) {
      removeInvoiceBusinessLogo(id: $id) { success cleanupQueued }
    }`,
    { id },
    organizationId,
  );
  return { success: data.removeInvoiceBusinessLogo.success };
};
