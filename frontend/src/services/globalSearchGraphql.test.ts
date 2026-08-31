import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlRequest } from './graphqlClient';
import { resetGlobalSearchCapability, searchOrganizationViaGraphql } from './globalSearchGraphql';

vi.mock('./graphqlClient', () => ({ graphqlRequest: vi.fn() }));

describe('organization global search GraphQL operation', () => {
  beforeEach(() => {
    resetGlobalSearchCapability();
    vi.clearAllMocks();
    vi.mocked(graphqlRequest).mockResolvedValue({
      segments: { nodes: [{ id: 1, name: 'Clients' }] },
      campaigns: { nodes: [{ id: 2, name: 'Welcome', status: 'DRAFT' }] },
      workflows: { nodes: [{ id: 3, name: 'Follow up' }] },
      contacts: { nodes: [{
        id: 4,
        firstName: 'Maya',
        lastName: 'Patel',
        email: 'maya@example.com',
      }] },
      invoices: { nodes: [{
        id: 5,
        invoiceNumber: 'INV-5',
        contactFirstName: 'Maya',
        contactLastName: 'Patel',
        customerName: null,
        status: 'DRAFT',
      }] },
      signatures: { nodes: [{ id: 6, title: 'Agreement', status: 'SENT' }] },
    });
  });

  it('searches organization modules in one cancellable bounded operation', async () => {
    const controller = new AbortController();

    await expect(searchOrganizationViaGraphql(
      'maya',
      42,
      controller.signal,
    )).resolves.toMatchObject({
      contacts: [{ id: 4, firstName: 'Maya' }],
      invoices: [{ id: 5, invoiceNumber: 'INV-5' }],
      signatures: [{ id: 6, title: 'Agreement' }],
    });

    expect(graphqlRequest).toHaveBeenCalledOnce();
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('query OrganizationGlobalSearch('),
      expect.objectContaining({
        page: { page: 1, pageSize: 3 },
        includeLongQuery: true,
        contactFilter: { search: 'maya' },
      }),
      42,
      controller.signal,
    );
  });

  it('omits long-query collections for a two-character search', async () => {
    vi.mocked(graphqlRequest).mockResolvedValueOnce({
      segments: { nodes: [] },
      campaigns: { nodes: [] },
      workflows: { nodes: [] },
    });

    const result = await searchOrganizationViaGraphql('ma', 42);

    expect(result.contacts).toEqual([]);
    expect(result.invoices).toEqual([]);
    expect(result.signatures).toEqual([]);
    expect(vi.mocked(graphqlRequest).mock.calls[0][1]).toMatchObject({
      includeLongQuery: false,
    });
  });

  it('falls back once when the deployed signature filter cannot search', async () => {
    const legacyData = {
      segments: { nodes: [] },
      campaigns: { nodes: [] },
      workflows: { nodes: [] },
      contacts: { nodes: [] },
      invoices: { nodes: [] },
      signatures: { nodes: [
        { id: 6, title: 'Maya agreement', status: 'SENT' },
        { id: 7, title: 'Other agreement', status: 'DRAFT' },
      ] },
    };
    vi.mocked(graphqlRequest)
      .mockRejectedValueOnce(new Error(
        'Variable "$signatureFilter" got invalid value { search: "maya" }; Field "search" is not defined by type "SignatureDocumentFilterInput".',
      ))
      .mockResolvedValueOnce(legacyData)
      .mockResolvedValueOnce(legacyData);

    await expect(searchOrganizationViaGraphql('maya', 42)).resolves.toMatchObject({
      signatures: [{ id: 6, title: 'Maya agreement' }],
    });
    await searchOrganizationViaGraphql('agreement', 42);

    expect(graphqlRequest).toHaveBeenCalledTimes(3);
    expect(vi.mocked(graphqlRequest).mock.calls.map(([operation]) =>
      operation.match(/query (\w+)/)?.[1],
    )).toEqual([
      'OrganizationGlobalSearch',
      'OrganizationGlobalSearchLegacy',
      'OrganizationGlobalSearchLegacy',
    ]);
    expect(vi.mocked(graphqlRequest).mock.calls[1][1]).toMatchObject({
      page: { page: 1, pageSize: 3 },
      signaturePage: { page: 1, pageSize: 50 },
    });
  });
});
