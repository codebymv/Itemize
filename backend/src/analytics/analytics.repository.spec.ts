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

  it('reuses the captured boundary and scopes SMS lifecycle metrics to outbound sends', async () => {
    const repository = new AnalyticsRepository(pool);
    await expect(repository.communicationStats(7, '30 days')).resolves.toEqual({
      asOf,
      data: { email: {}, sms: {} },
    });

    const statements = client.query.mock.calls.map((call) => String(call[0]));
    const emailIndex = statements.findIndex((text) => text.includes('FROM email_logs'));
    const smsIndex = statements.findIndex((text) => text.includes('FROM sms_logs'));
    expect(emailIndex).toBeGreaterThan(1);
    expect(smsIndex).toBeGreaterThan(emailIndex);
    expect(client.query.mock.calls[emailIndex][1]).toEqual([7, asOf, '30 days']);
    expect(client.query.mock.calls[smsIndex][1]).toEqual([7, asOf, '30 days']);
    expect(statements[smsIndex]).toContain("SUM(segments) FILTER (WHERE direction = 'outbound')");
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('reads every reputation metric from one snapshot with parameterized periods', async () => {
    const repository = new AnalyticsRepository(pool);
    await expect(repository.reputationAnalytics(7, 90)).resolves.toMatchObject({ asOf });

    const calls = client.query.mock.calls;
    const statements = calls.map((call) => String(call[0]));
    expect(statements.filter((text) => text.includes('FROM reviews')).length).toBe(5);
    expect(statements.filter((text) => text.includes('FROM review_requests')).length).toBe(1);
    const periodCalls = calls.filter((call) => String(call[0]).includes("$3::int * INTERVAL '1 day'"));
    expect(periodCalls).toHaveLength(2);
    for (const call of periodCalls) expect(call[1]).toEqual([7, asOf, 90]);
    expect(statements.join('\n')).not.toContain("INTERVAL '90 days'");
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });
});
