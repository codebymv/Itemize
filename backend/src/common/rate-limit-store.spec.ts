import {
  MemoryRateLimitBucketStore,
  PostgresRateLimitBucketStore,
  createRateLimitBucketStore,
  rateLimitStoreKind,
} from './rate-limit-store';
import { SharedRateLimitStore } from './express-rate-limit-store';

describe('rate limit bucket stores', () => {
  it('counts within a window and restarts a lapsed one in memory', async () => {
    const store = new MemoryRateLimitBucketStore();
    expect((await store.hit('k', 1_000)).count).toBe(1);
    expect((await store.hit('k', 1_000)).count).toBe(2);
    await store.reset('k');
    expect((await store.hit('k', 1_000)).count).toBe(1);
  });

  it('issues one atomic upsert per hit against Postgres and sweeps opportunistically', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [{ count: calls.filter((c) => c.sql.includes('INSERT')).length, reset_at: new Date(Date.now() + 500) }] };
      }),
    };
    const store = new PostgresRateLimitBucketStore(pool as never, 2);
    const first = await store.hit('auth:standard:1.1.1.1:a@b', 900_000);
    const second = await store.hit('auth:standard:1.1.1.1:a@b', 900_000);
    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(calls[0].sql).toMatch(/INSERT INTO rate_limit_buckets/);
    expect(calls[0].sql).toMatch(/ON CONFLICT \(key\) DO UPDATE/);
    expect(calls[0].params).toEqual(['auth:standard:1.1.1.1:a@b', 900_000]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls.some((c) => c.sql.includes('DELETE FROM rate_limit_buckets WHERE reset_at <'))).toBe(true);
  });

  it('defaults to Postgres everywhere except the test environment', () => {
    expect(rateLimitStoreKind({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe('memory');
    expect(rateLimitStoreKind({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe('postgres');
    expect(rateLimitStoreKind({ NODE_ENV: 'production', RATE_LIMIT_STORE: 'memory' } as NodeJS.ProcessEnv)).toBe('memory');
    expect(() => rateLimitStoreKind({ RATE_LIMIT_STORE: 'redis' } as NodeJS.ProcessEnv)).toThrow(/RATE_LIMIT_STORE/);
    expect(createRateLimitBucketStore({ query: jest.fn() } as never, { NODE_ENV: 'test' } as NodeJS.ProcessEnv).kind).toBe('memory');
  });

  it('adapts the shared store to express-rate-limit with a namespaced key', async () => {
    const buckets = new MemoryRateLimitBucketStore();
    const store = new SharedRateLimitStore(buckets);
    store.init({ windowMs: 60_000 } as never);
    const first = await store.increment('203.0.113.5');
    const second = await store.increment('203.0.113.5');
    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(second.resetTime).toBeInstanceOf(Date);
    expect(store.localKeys).toBe(true);
    await store.resetKey('203.0.113.5');
    expect((await store.increment('203.0.113.5')).totalHits).toBe(1);
  });
});
