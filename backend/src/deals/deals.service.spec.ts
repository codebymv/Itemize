import { GraphQLError } from 'graphql';
import { DealSortDirection, DealSortField } from './deal.enums';
import { GetStartedService } from '../get-started/get-started.service';
import { DealsRepository, DealRow } from './deals.repository';
import { DealsService } from './deals.service';

const row = (overrides: Partial<DealRow> = {}): DealRow => ({
  id: 9,
  organization_id: 3,
  pipeline_id: 4,
  contact_id: null,
  stage_id: 'lead',
  title: 'Expansion',
  value: '1250.50',
  currency: 'USD',
  probability: 40,
  expected_close_date: '2026-08-01',
  assigned_to: null,
  assigned_to_name: null,
  created_by: 7,
  won_at: null,
  lost_at: null,
  lost_reason: null,
  custom_fields: {},
  tags: [],
  contact_first_name: null,
  contact_last_name: null,
  contact_email: null,
  contact_company: null,
  pipeline_name: 'Sales',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('DealsService', () => {
  let repository: jest.Mocked<DealsRepository>;
  let getStarted: jest.Mocked<Pick<GetStartedService, 'record'>>;
  let service: DealsService;

  beforeEach(() => {
    getStarted = { record: jest.fn().mockResolvedValue(true) };
    repository = {
      findPage: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      move: jest.fn(),
      lifecycle: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<DealsRepository>;
    service = new DealsService(repository, getStarted as unknown as GetStartedService);
  });

  it('returns decimal strings and deterministic page criteria', async () => {
    repository.findPage.mockResolvedValue({ rows: [row()], total: 1 });
    await expect(service.list(3)).resolves.toMatchObject({
      nodes: [{ id: 9, value: '1250.50' }],
      pageInfo: { page: 1, pageSize: 50, total: 1 },
    });
    expect(repository.findPage).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 3,
      sortField: DealSortField.CREATED_AT,
      sortDirection: DealSortDirection.DESC,
      pageSize: 50,
      offset: 0,
    }));
  });

  it.each([
    [{ value: '-1' }, 'value'],
    [{ value: '1.234' }, 'value'],
    [{ currency: 'zzz' }, 'currency'],
    [{ probability: 101 }, 'probability'],
    [{ expectedCloseDate: '2026-02-30' }, 'expectedCloseDate'],
  ])('rejects invalid create input %#', async (invalid, field) => {
    await expect(service.create(3, 7, {
      pipelineId: 4,
      title: 'Deal',
      ...invalid,
    }, 'deal-create-invalid')).rejects.toMatchObject<Partial<GraphQLError>>({
      extensions: expect.objectContaining({ code: 'BAD_USER_INPUT', field }),
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('normalizes create input and does not repeat onboarding on replay', async () => {
    repository.create.mockResolvedValue({ kind: 'ok', row: row(), replayed: true });
    await expect(service.create(3, 7, {
      pipelineId: 4,
      title: ' Expansion ',
      value: '1250.50',
    }, 'deal-create-1')).resolves.toMatchObject({ id: 9, title: 'Expansion' });
    expect(repository.create).toHaveBeenCalledWith(
      3,
      7,
      expect.objectContaining({ title: 'Expansion', currency: 'USD' }),
      'deal-create-1',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(getStarted.record).not.toHaveBeenCalled();
  });

  it('surfaces conflicting and unavailable deal creation receipts', async () => {
    repository.create
      .mockResolvedValueOnce({ kind: 'idempotency-conflict' })
      .mockResolvedValueOnce({ kind: 'result-unavailable' });
    await expect(service.create(
      3, 7, { pipelineId: 4, title: 'Deal' }, 'deal-create-2',
    )).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'CONFLICT', reason: 'IDEMPOTENCY_KEY_REUSED',
      }),
    });
    await expect(service.create(
      3, 7, { pipelineId: 4, title: 'Deal' }, 'deal-create-3',
    )).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'CONFLICT', reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE',
      }),
    });
  });

  it('preserves omitted update fields and clears explicit nullable fields', async () => {
    repository.update.mockResolvedValue({ kind: 'ok', row: row() });
    await service.update(3, 7, 9, {
      contactId: null,
      expectedCloseDate: null,
      customFields: null,
      tags: null,
    });
    expect(repository.update).toHaveBeenCalledWith(3, 7, 9, {
      contactId: null,
      expectedCloseDate: null,
      customFields: {},
      tags: [],
    });
  });

  it('maps foreign references to stable user-input errors', async () => {
    repository.create.mockResolvedValue({ kind: 'invalid_contact' });
    await expect(service.create(3, 7, {
      pipelineId: 4,
      title: 'Deal',
      contactId: 99,
    }, 'deal-create-foreign')).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'BAD_USER_INPUT',
        field: 'contactId',
        reason: 'INVALID_CONTACT',
      }),
    });
  });

  it('keeps foreign deal identifiers tenant-private', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.get(3, 99)).rejects.toMatchObject({
      extensions: expect.objectContaining({ code: 'NOT_FOUND' }),
    });
  });
});
