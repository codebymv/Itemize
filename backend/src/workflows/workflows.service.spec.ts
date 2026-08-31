import { WorkflowsRepository } from './workflows.repository';
import { WorkflowsService } from './workflows.service';

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
});
