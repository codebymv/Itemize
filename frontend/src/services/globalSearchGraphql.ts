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

type SearchFilter = { search: string };
type SharedSearchVariables = {
  segmentFilter: SearchFilter;
  campaignFilter: SearchFilter;
  workflowFilter: SearchFilter;
  contactFilter: SearchFilter;
  invoiceFilter: SearchFilter;
  page: { page: number; pageSize: number };
  includeLongQuery: boolean;
};
type SearchVariables = SharedSearchVariables & { signatureFilter: SearchFilter };
type LegacySearchVariables = SharedSearchVariables & {
  signaturePage: { page: number; pageSize: number };
};

type SearchCapability = 'unknown' | 'signature-search' | 'legacy-signatures';
let searchCapability: SearchCapability = 'unknown';

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

const legacySignatureQuery = `
  query OrganizationGlobalSearchLegacy(
    $segmentFilter: SegmentListFilterInput
    $campaignFilter: CampaignFilterInput
    $workflowFilter: WorkflowFilterInput
    $contactFilter: ContactFilterInput
    $invoiceFilter: InvoiceFilterInput
    $page: PageInput!
    $signaturePage: PageInput!
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
    signatures: signatureDocuments(page: $signaturePage)
      @include(if: $includeLongQuery) {
      nodes { id title status }
    }
  }
`;

const missingSignatureSearch = (error: unknown): boolean => error instanceof Error
  && error.message.includes('Field "search" is not defined by type')
  && error.message.includes('SignatureDocumentFilterInput');

export const searchOrganizationViaGraphql = async (
  search: string,
  organizationId: number,
  signal?: AbortSignal,
): Promise<GlobalSearchOrganizationResults> => {
  const normalizedSearch = search.trim();
  const filter = { search: normalizedSearch };
  const variables: SearchVariables = {
    segmentFilter: filter,
    campaignFilter: filter,
    workflowFilter: filter,
    contactFilter: filter,
    invoiceFilter: filter,
    signatureFilter: filter,
    page: { page: 1, pageSize: 3 },
    includeLongQuery: normalizedSearch.length > 2,
  };
  let data: Data | null = null;
  if (searchCapability !== 'legacy-signatures') {
    try {
      data = await graphqlRequest<Data, SearchVariables>(
        query,
        variables,
        organizationId,
        signal,
      );
      searchCapability = 'signature-search';
    } catch (error) {
      if (searchCapability !== 'unknown' || !missingSignatureSearch(error)) throw error;
      searchCapability = 'legacy-signatures';
    }
  }

  if (data === null) {
    data = await graphqlRequest<Data, LegacySearchVariables>(
      legacySignatureQuery,
      {
        segmentFilter: filter,
        campaignFilter: filter,
        workflowFilter: filter,
        contactFilter: filter,
        invoiceFilter: filter,
        page: variables.page,
        signaturePage: { page: 1, pageSize: 50 },
        includeLongQuery: variables.includeLongQuery,
      },
      organizationId,
      signal,
    );
  }

  const signatures = searchCapability === 'legacy-signatures'
    ? (data.signatures?.nodes ?? [])
      .filter((signature) => signature.title
        .toLocaleLowerCase()
        .includes(normalizedSearch.toLocaleLowerCase()))
      .slice(0, 3)
    : data.signatures?.nodes ?? [];

  return {
    segments: data.segments.nodes,
    campaigns: data.campaigns.nodes,
    workflows: data.workflows.nodes,
    contacts: data.contacts?.nodes ?? [],
    invoices: data.invoices?.nodes ?? [],
    signatures,
  };
};

export const resetGlobalSearchCapability = (): void => {
  searchCapability = 'unknown';
};
