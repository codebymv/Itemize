import { PageInput } from '../common/pagination';
import { SegmentsRepository } from './segments.repository';
import { SegmentsService } from './segments.service';

const row = {
  id: 7,
  organization_id: 4,
  name: 'Active contacts',
  description: null,
  color: '#6366F1',
  icon: 'users',
  filter_type: 'and',
  filters: [],
  segment_type: 'dynamic',
  static_contact_ids: [],
  contact_count: 12,
  last_calculated_at: null,
  is_active: true,
  used_in_campaigns: 1,
  used_in_automations: 2,
  created_by: 9,
  created_by_name: 'Owner',
  created_at: new Date('2026-08-01T00:00:00.000Z'),
  updated_at: new Date('2026-08-02T00:00:00.000Z'),
};

describe('SegmentsService', () => {
  it('maps filtered pagination and organization-wide stats independently', async () => {
    const repository = {
      findPage: jest.fn().mockResolvedValue({
        rows: [row],
        total: 1,
        stats: { total: 8, dynamic: 5, static_count: 3, contacts: 91 },
      }),
    } as unknown as jest.Mocked<SegmentsRepository>;
    const service = new SegmentsService(repository);

    await expect(service.list(
      4,
      { isActive: true, search: ' active ' },
      Object.assign(new PageInput(), { page: 2, pageSize: 20 }),
    )).resolves.toMatchObject({
      nodes: [{ id: 7, name: 'Active contacts', contactCount: 12 }],
      pageInfo: { page: 2, pageSize: 20, total: 1 },
      stats: { total: 8, dynamic: 5, staticCount: 3, contacts: 91 },
    });
    expect(repository.findPage).toHaveBeenCalledWith({
      organizationId: 4,
      isActive: true,
      search: 'active',
      pageSize: 20,
      offset: 20,
    });
  });
});
