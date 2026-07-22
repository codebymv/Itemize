import { Pool, PoolClient } from 'pg';
import { ReputationRequestsRepository } from './reputation-requests.repository';

describe('ReputationRequestsRepository', () => {
  let client: jest.Mocked<PoolClient>;
  let pool: jest.Mocked<Pool>;

  beforeEach(() => {
    client = {
      query: jest.fn().mockImplementation(async (text: string) => {
        if (text.includes('COUNT(*)')) return { rows: [{ count: '2' }] };
        if (text.includes('SELECT rr.id')) return { rows: [] };
        return { rows: [] };
      }),
      release: jest.fn(),
    } as unknown as jest.Mocked<PoolClient>;
    pool = {
      connect: jest.fn().mockResolvedValue(client),
      query: jest.fn(),
    } as unknown as jest.Mocked<Pool>;
  });

  it('shares count and rows in one stable tenant-qualified snapshot', async () => {
    const repository = new ReputationRequestsRepository(pool);
    await expect(repository.findPage({
      organizationId: 3, status: 'sent', pageSize: 10, offset: 20,
    })).resolves.toEqual({ rows: [], total: 2 });

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const calls = client.query.mock.calls;
    const count = calls.find((call) => String(call[0]).includes('COUNT(*)'))!;
    const page = calls.find((call) => String(call[0]).includes('SELECT rr.id'))!;
    expect(count[1]).toEqual([3, 'sent']);
    expect(page[1]).toEqual([3, 'sent', 10, 20]);
    expect(String(page[0])).toContain('c.organization_id = rr.organization_id');
    expect(String(page[0])).toContain('ORDER BY rr.created_at DESC, rr.id DESC');
    expect(String(page[0])).not.toContain('unique_token');
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases when a page read fails', async () => {
    client.query.mockImplementation(async (text: string) => {
      if (text.includes('COUNT(*)')) return { rows: [{ count: '2' }] } as never;
      if (text.includes('SELECT rr.id')) throw new Error('statement timeout');
      return { rows: [] } as never;
    });
    const repository = new ReputationRequestsRepository(pool);
    await expect(repository.findPage({ organizationId: 3, pageSize: 20, offset: 0 }))
      .rejects.toThrow('statement timeout');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
