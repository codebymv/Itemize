import { Pool, PoolClient } from 'pg';
import { AnalyticsRepository } from './analytics.repository';

describe('AnalyticsRepository', () => {
  const asOf = new Date('2026-07-20T18:00:00.000Z');
  let client: jest.Mocked<PoolClient>;
  let pool: jest.Mocked<Pool>;

  beforeEach(() => {
    client = {
      query: jest.fn().mockImplementation(async (text: string) => {
        if (text.includes('SELECT CURRENT_TIMESTAMP AS as_of')) {
          return { rows: [{ as_of: asOf }] };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    } as unknown as jest.Mocked<PoolClient>;
    pool = { connect: jest.fn().mockResolvedValue(client) } as unknown as jest.Mocked<Pool>;
  });

  it('uses one read-only repeatable-read transaction and one captured boundary', async () => {
    const repository = new AnalyticsRepository(pool);
    await expect(repository.dashboardSnapshot(7)).resolves.toMatchObject({ asOf });

    expect(client.query).toHaveBeenNthCalledWith(
      1,
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
    const queryCalls = client.query.mock.calls as unknown[][];
    const temporalCalls = queryCalls.filter((call) => {
      const values = call[1];
      return Array.isArray(values) && values.length === 2;
    });
    expect(temporalCalls.length).toBeGreaterThan(0);
    for (const call of temporalCalls) expect(call[1]).toEqual([7, asOf]);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases the snapshot connection on a subquery failure', async () => {
    client.query.mockImplementation(async (text: string) => {
      if (text.includes('SELECT CURRENT_TIMESTAMP AS as_of')) {
        return { rows: [{ as_of: asOf }] } as never;
      }
      if (text.includes('FROM deals WHERE organization_id')) {
        throw new Error('statement timeout');
      }
      return { rows: [] } as never;
    });
    const repository = new AnalyticsRepository(pool);

    await expect(repository.dashboardSnapshot(7)).rejects.toThrow('statement timeout');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
