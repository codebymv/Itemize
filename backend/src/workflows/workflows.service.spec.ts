import { WorkflowsRepository } from './workflows.repository';
import { WorkflowsService } from './workflows.service';

const workflowValue = () => ({
  workflow: {
    id: 9,
    organization_id: 4,
    name: 'Welcome',
    description: null,
    trigger_type: 'contact_added',
    trigger_config: {},
    scheduled_contact_id: null,
    next_trigger_at: null,
    last_triggered_at: null,
    is_active: false,
    stats: {},
    created_by: 7,
    created_by_name: 'Owner',
    created_at: new Date('2026-08-01T10:00:00.000Z'),
    updated_at: new Date('2026-08-01T10:00:00.000Z'),
    step_count: '0',
    active_enrollments: '0',
    active_count: '0',
    completed_count: '0',
    failed_count: '0',
    total_count: '0',
  },
  steps: [],
});

describe('WorkflowsService', () => {
  it('maps paginated definitions and organization-wide workflow stats safely', async () => {
    const workflows = {
      findPage: jest.fn().mockResolvedValue({
        rows: [{
          id: 9,
          organization_id: 4,
          name: 'Welcome',
          description: null,
          trigger_type: 'contact_added',
          trigger_config: {},
          scheduled_contact_id: null,
          next_trigger_at: null,
          last_triggered_at: null,
          is_active: true,
          stats: {},
          created_by: 7,
          created_by_name: 'Owner',
          created_at: new Date('2026-08-01T10:00:00.000Z'),
          updated_at: new Date('2026-08-01T11:00:00.000Z'),
          step_count: '2',
          active_enrollments: '3',
          active_count: '3',
          completed_count: '5',
          failed_count: '1',
          total_count: '9',
        }],
        total: '1',
        stats: { total: '8', active: '3', inactive: '5', running: '7', completed: '12', failed: '2' },
      }),
    };
    const service = new WorkflowsService(workflows as unknown as WorkflowsRepository);

    await expect(service.list(4, { search: ' welcome ' }, { page: 2, pageSize: 20 }))
      .resolves.toMatchObject({
        nodes: [{ id: 9, stepCount: 2, activeEnrollments: 3 }],
        pageInfo: { page: 2, pageSize: 20, total: 1 },
        stats: { total: 8, active: 3, inactive: 5, running: 7, completed: 12, failed: 2 },
      });
    expect(workflows.findPage).toHaveBeenCalledWith({
      organizationId: 4,
      searchPattern: '%welcome%',
      pageSize: 20,
      offset: 20,
    });
  });

  it('normalizes create intent and supplies a stable request fingerprint', async () => {
    const workflows = {
      create: jest.fn().mockResolvedValue({
        kind: 'created', value: workflowValue(), replayed: false,
      }),
    };
    const service = new WorkflowsService(workflows as unknown as WorkflowsRepository);

    await service.create(4, 7, {
      name: ' Welcome ', triggerType: 'contact_created', triggerConfig: {}, steps: [],
    }, 'workflow-create-key');

    expect(workflows.create).toHaveBeenCalledWith(
      4,
      7,
      expect.objectContaining({
        name: 'Welcome', triggerType: 'contact_added', steps: [],
      }),
      'workflow-create-key',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('rejects invalid creation keys and changed receipt intent', async () => {
    const workflows = {
      create: jest.fn(),
      duplicate: jest.fn().mockResolvedValue({ kind: 'idempotency_conflict' }),
    };
    const service = new WorkflowsService(workflows as unknown as WorkflowsRepository);

    await expect(service.create(4, 7, {
      name: 'Welcome', triggerType: 'manual', triggerConfig: {}, steps: [],
    }, 'unsafe key')).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'INVALID_IDEMPOTENCY_KEY' },
    });
    expect(workflows.create).not.toHaveBeenCalled();

    await expect(
      service.duplicate(4, 9, 7, 'workflow-duplicate-key'),
    ).rejects.toMatchObject({
      extensions: { code: 'CONFLICT', reason: 'IDEMPOTENCY_KEY_REUSED' },
    });
  });
});
