import { PipelinesRepository, PipelineRow } from './pipelines.repository';
import { PipelinesService } from './pipelines.service';

const pipelineRow = (
  id: number,
  name: string,
  isDefault = false,
): PipelineRow => ({
  id,
  organization_id: 42,
  name,
  description: null,
  stages: [{ id: 'lead', name: 'Lead', order: 0, color: '#6B7280' }],
  is_default: isDefault,
  created_by: 7,
  deal_count: 0,
  total_value: '0',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
});

describe('PipelinesService', () => {
  const defaultPipeline = pipelineRow(1, 'Default', true);
  const requestedPipeline = pipelineRow(2, 'Requested');
  const repository = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  };
  const service = new PipelinesService(
    repository as unknown as PipelinesRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findAll.mockResolvedValue([defaultPipeline, requestedPipeline]);
    repository.findById.mockImplementation(async (_organizationId, pipelineId) => ({
      pipeline: pipelineId === requestedPipeline.id
        ? requestedPipeline
        : defaultPipeline,
      deals: [],
    }));
  });

  it('hydrates only the explicitly requested pipeline', async () => {
    const workspace = await service.workspace(42, requestedPipeline.id);

    expect(workspace.pipelines).toHaveLength(2);
    expect(workspace.selectedPipeline?.id).toBe(requestedPipeline.id);
    expect(repository.findById).toHaveBeenCalledTimes(1);
    expect(repository.findById).toHaveBeenCalledWith(42, requestedPipeline.id);
  });

  it('lets the server choose the default when selection is absent or stale', async () => {
    const absentSelection = await service.workspace(42);
    const staleSelection = await service.workspace(42, 999);

    expect(absentSelection.selectedPipeline?.id).toBe(defaultPipeline.id);
    expect(staleSelection.selectedPipeline?.id).toBe(defaultPipeline.id);
  });

  it('returns an empty workspace without attempting a board read', async () => {
    repository.findAll.mockResolvedValue([]);

    await expect(service.workspace(42)).resolves.toEqual({
      pipelines: [],
      selectedPipeline: null,
    });
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('normalizes pipeline creation before claiming a durable attempt', async () => {
    repository.create.mockResolvedValue({
      kind: 'created', row: requestedPipeline, replayed: false,
    });

    await service.create(42, 7, {
      name: ' Partner Sales ',
      description: ' channel ',
      stages: [
        { id: ' incoming ', name: ' Incoming ', color: '#abcdef', order: 50 },
      ],
      isDefault: true,
    }, 'pipeline-create-key');

    expect(repository.create).toHaveBeenCalledWith(
      42,
      7,
      {
        name: 'Partner Sales',
        description: 'channel',
        stages: [
          { id: 'incoming', name: 'Incoming', color: '#ABCDEF', order: 0 },
        ],
        isDefault: true,
      },
      'pipeline-create-key',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('rejects invalid, conflicting, and unavailable creation attempts', async () => {
    const input = { name: 'Sales' };
    await expect(service.create(42, 7, input, 'unsafe key'))
      .rejects.toMatchObject({
        extensions: { reason: 'INVALID_IDEMPOTENCY_KEY' },
      });
    repository.create.mockResolvedValueOnce({ kind: 'idempotency_conflict' });
    await expect(service.create(42, 7, input, 'pipeline-create-key'))
      .rejects.toMatchObject({
        extensions: { reason: 'IDEMPOTENCY_KEY_REUSED' },
      });
    repository.create.mockResolvedValueOnce({ kind: 'result_unavailable' });
    await expect(service.create(42, 7, input, 'pipeline-create-key'))
      .rejects.toMatchObject({
        extensions: { reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE' },
      });
  });
});
