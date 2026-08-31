import { graphqlRequest } from './graphqlClient';

export type GlobalSearchOrganizationResults = {
  segments: Array<{ id: number; name: string }>;
  campaigns: Array<{ id: number; name: string; status: string }>;
  workflows: Array<{ id: number; name: string }>;
  contacts: Array<{
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  }>;
  invoices: Array<{
    id: number;
    invoiceNumber: string | null;
    contactFirstName: string | null;
    contactLastName: string | null;
    customerName: string | null;
    status: string;
  }>;
  signatures: Array<{ id: number; title: string; status: string }>;
};

type Page<T> = { nodes: T[] };

type Data = {
  segments: Page<GlobalSearchOrganizationResults['segments'][number]>;
  campaigns: Page<GlobalSearchOrganizationResults['campaigns'][number]>;
  workflows: Page<GlobalSearchOrganizationResults['workflows'][number]>;
  contacts?: Page<GlobalSearchOrganizationResults['contacts'][number]>;
  invoices?: Page<GlobalSearchOrganizationResults['invoices'][number]>;
  signatures?: Page<GlobalSearchOrganizationResults['signatures'][number]>;
};

const query = `
  query OrganizationGlobalSearch(
    $segmentFilter: SegmentListFilterInput
    $campaignFilter: CampaignFilterInput
    $workflowFilter: WorkflowFilterInput
    $contactFilter: ContactFilterInput
    $invoiceFilter: InvoiceFilterInput
    $signatureFilter: SignatureDocumentFilterInput
    $page: PageInput!
    $includeLongQuery: Boolean!
  ) {
    segments(filter: $segmentFilter, page: $page) {
      nodes { id name }
    }
    campaigns(filter: $campaignFilter, page: $page) {
      nodes { id name status }
    }
    workflows(filter: $workflowFilter, page: $page) {
      nodes { id name }
    }
    contacts(filter: $contactFilter, page: $page)
      @include(if: $includeLongQuery) {
      nodes { id firstName lastName email }
    }
    invoices(filter: $invoiceFilter, page: $page)
      @include(if: $includeLongQuery) {
      nodes {
        id invoiceNumber contactFirstName contactLastName customerName status
      }
    }
    signatures: signatureDocuments(filter: $signatureFilter, page: $page)
      @include(if: $includeLongQuery) {
      nodes { id title status }
    }
  }
`;

export const searchOrganizationViaGraphql = async (
  search: string,
  organizationId: number,
  signal?: AbortSignal,
): Promise<GlobalSearchOrganizationResults> => {
  const normalizedSearch = search.trim();
  const filter = { search: normalizedSearch };
  const data = await graphqlRequest<Data, {
    segmentFilter: typeof filter;
    campaignFilter: typeof filter;
    workflowFilter: typeof filter;
    contactFilter: typeof filter;
    invoiceFilter: typeof filter;
    signatureFilter: typeof filter;
    page: { page: number; pageSize: number };
    includeLongQuery: boolean;
  }>(
    query,
    {
      segmentFilter: filter,
      campaignFilter: filter,
      workflowFilter: filter,
      contactFilter: filter,
      invoiceFilter: filter,
      signatureFilter: filter,
      page: { page: 1, pageSize: 3 },
      includeLongQuery: normalizedSearch.length > 2,
    },
    organizationId,
    signal,
  );

  return {
    segments: data.segments.nodes,
    campaigns: data.campaigns.nodes,
    workflows: data.workflows.nodes,
    contacts: data.contacts?.nodes ?? [],
    invoices: data.invoices?.nodes ?? [],
    signatures: data.signatures?.nodes ?? [],
  };
};
