import type {
  Estimate,
  EstimateItem,
  EstimateListParams,
  EstimateListResponse,
  EstimateWriteInput,
} from './estimatesApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlEstimateItem = {
  id: number;
  estimateId: number;
  organizationId: number;
  productId: number | null;
  productName: string | null;
  name: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  taxAmount: string;
  discountAmount: string;
  total: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type GraphqlEstimate = {
  id: number;
  organizationId: number;
  estimateNumber: string;
  contactId: number | null;
  businessId: number | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  issueDate: string;
  validUntil: string;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  discountType: Estimate['discount_type'];
  discountValue: string;
  total: string;
  currency: string;
  status: Estimate['status'];
  notes: string | null;
  termsAndConditions: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  convertedInvoiceId: number | null;
  customFields: Record<string, unknown>;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  items?: GraphqlEstimateItem[];
};

const coreFields = `
  id organizationId estimateNumber contactId businessId customerName
  customerEmail customerPhone customerAddress issueDate validUntil subtotal
  taxAmount discountAmount discountType discountValue total currency status
  notes termsAndConditions sentAt viewedAt acceptedAt declinedAt
  convertedInvoiceId customFields createdById createdAt updatedAt
  contactFirstName contactLastName contactEmail
`;

const detailFields = `
  ${coreFields}
  items {
    id estimateId organizationId productId productName name description
    quantity unitPrice taxRate taxAmount discountAmount total sortOrder
    createdAt updatedAt
  }
`;

const mapItem = (item: GraphqlEstimateItem): EstimateItem => ({
  id: item.id,
  estimate_id: item.estimateId,
  organization_id: item.organizationId,
  product_id: item.productId,
  product_name: item.productName,
  name: item.name,
  description: item.description,
  quantity: Number(item.quantity),
  unit_price: Number(item.unitPrice),
  tax_rate: Number(item.taxRate),
  tax_amount: Number(item.taxAmount),
  discount_amount: Number(item.discountAmount),
  total: Number(item.total),
  sort_order: item.sortOrder,
  created_at: item.createdAt,
  updated_at: item.updatedAt,
});

const mapEstimate = (estimate: GraphqlEstimate): Estimate => ({
  id: estimate.id,
  organization_id: estimate.organizationId,
  estimate_number: estimate.estimateNumber,
  contact_id: estimate.contactId,
  business_id: estimate.businessId,
  customer_name: estimate.customerName,
  customer_email: estimate.customerEmail,
  customer_phone: estimate.customerPhone,
  customer_address: estimate.customerAddress,
  issue_date: estimate.issueDate,
  valid_until: estimate.validUntil,
  subtotal: Number(estimate.subtotal),
  tax_amount: Number(estimate.taxAmount),
  discount_amount: Number(estimate.discountAmount),
  discount_type: estimate.discountType,
  discount_value: Number(estimate.discountValue),
  total: Number(estimate.total),
  currency: estimate.currency,
  status: estimate.status,
  notes: estimate.notes,
  terms_and_conditions: estimate.termsAndConditions,
  sent_at: estimate.sentAt,
  viewed_at: estimate.viewedAt,
  accepted_at: estimate.acceptedAt,
  declined_at: estimate.declinedAt,
  converted_invoice_id: estimate.convertedInvoiceId,
  custom_fields: estimate.customFields,
  created_by: estimate.createdById,
  created_at: estimate.createdAt,
  updated_at: estimate.updatedAt,
  contact_first_name: estimate.contactFirstName,
  contact_last_name: estimate.contactLastName,
  contact_email: estimate.contactEmail,
  items: estimate.items?.map(mapItem),
});

const mapInput = (input: EstimateWriteInput) => ({
  ...(input.contact_id === undefined ? {} : { contactId: input.contact_id }),
  ...(input.customer_name === undefined ? {} : { customerName: input.customer_name }),
  ...(input.customer_email === undefined ? {} : { customerEmail: input.customer_email }),
  ...(input.customer_phone === undefined ? {} : { customerPhone: input.customer_phone }),
  ...(input.customer_address === undefined
    ? {} : { customerAddress: input.customer_address }),
  ...(input.valid_until === undefined ? {} : { validUntil: input.valid_until }),
  ...(input.items === undefined ? {} : {
    items: input.items.map((item) => ({
      ...(item.product_id === undefined ? {} : { productId: item.product_id }),
      name: item.name,
      ...(item.description === undefined ? {} : { description: item.description }),
      quantity: String(item.quantity ?? 1),
      unitPrice: String(item.unit_price ?? 0),
      taxRate: String(item.tax_rate ?? 0),
    })),
  }),
  ...(input.discount_type === undefined ? {} : { discountType: input.discount_type }),
  ...(input.discount_value === undefined
    ? {} : { discountValue: String(input.discount_value) }),
  ...(input.notes === undefined ? {} : { notes: input.notes }),
  ...(input.terms_and_conditions === undefined
    ? {} : { termsAndConditions: input.terms_and_conditions }),
});

export const getEstimatesViaGraphql = async (
  params: EstimateListParams,
  organizationId?: number,
): Promise<EstimateListResponse> => {
  const data = await graphqlRequest<{
    estimates: {
      nodes: GraphqlEstimate[];
      pageInfo: { page: number; pageSize: number; total: number; totalPages: number };
    };
  }, Record<string, unknown>>(
    `query Estimates($filter: EstimateFilterInput, $page: PageInput) {
      estimates(filter: $filter, page: $page) {
        nodes { ${coreFields} }
        pageInfo { page pageSize total totalPages }
      }
    }`,
    {
      filter: {
        ...(params.status === undefined ? {} : { status: params.status }),
        ...(params.contact_id === undefined ? {} : { contactId: params.contact_id }),
        ...(params.search === undefined ? {} : { search: params.search }),
      },
      page: { page: params.page ?? 1, pageSize: params.limit ?? 20 },
    },
    organizationId,
  );
  return {
    estimates: data.estimates.nodes.map(mapEstimate),
    pagination: {
      page: data.estimates.pageInfo.page,
      limit: data.estimates.pageInfo.pageSize,
      total: data.estimates.pageInfo.total,
      totalPages: data.estimates.pageInfo.totalPages,
    },
  };
};

export const getEstimateViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<Estimate> => {
  const data = await graphqlRequest<{ estimate: GraphqlEstimate }, { id: number }>(
    `query Estimate($id: Int!) { estimate(id: $id) { ${detailFields} } }`,
    { id },
    organizationId,
  );
  return mapEstimate(data.estimate);
};

export const createEstimateViaGraphql = async (
  input: EstimateWriteInput & { items: EstimateItem[] },
  organizationId?: number,
): Promise<Estimate> => {
  const data = await graphqlMutationRequest<
    { createEstimate: GraphqlEstimate },
    { input: ReturnType<typeof mapInput> }
  >(
    `mutation CreateEstimate($input: CreateEstimateInput!) {
      createEstimate(input: $input) { ${detailFields} }
    }`,
    { input: mapInput(input) },
    organizationId,
  );
  return mapEstimate(data.createEstimate);
};

export const updateEstimateViaGraphql = async (
  id: number,
  input: EstimateWriteInput,
  organizationId?: number,
): Promise<Estimate> => {
  const data = await graphqlMutationRequest<
    { updateEstimate: GraphqlEstimate },
    { id: number; input: ReturnType<typeof mapInput> }
  >(
    `mutation UpdateEstimate($id: Int!, $input: UpdateEstimateInput!) {
      updateEstimate(id: $id, input: $input) { ${detailFields} }
    }`,
    { id, input: mapInput(input) },
    organizationId,
  );
  return mapEstimate(data.updateEstimate);
};

export const deleteEstimateViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<
    { deleteEstimate: { success: boolean; deletedId: number } },
    { id: number }
  >(
    `mutation DeleteEstimate($id: Int!) {
      deleteEstimate(id: $id) { success deletedId estimateNumber }
    }`,
    { id },
    organizationId,
  );
  if (data.deleteEstimate.deletedId !== id) {
    throw new Error('GraphQL estimate delete returned the wrong estimate');
  }
  return { success: data.deleteEstimate.success };
};
