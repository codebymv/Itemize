import { Logger } from '@nestjs/common';
import type { Pool } from 'pg';

/**
 * A fixed-window hit counter shared by every rate limiter in the API: the
 * express-rate-limit ingress ceiling, the authentication throttle, and the AI
 * throttle. One implementation keeps the buckets in process memory (tests and
 * single-replica development); the other keeps them in Postgres so that every
 * replica behind the load balancer counts the same client against the same
 * ceiling. Selection is by RATE_LIMIT_STORE (see createRateLimitBucketStore).
 */
export interface RateLimitHit {
  /** Hits in the current window, including this one. */
  count: number;
  /** When the current window ends. */
  resetAt: Date;
}

export interface RateLimitBucketStore {
  readonly kind: 'memory' | 'postgres';
  /** Count one hit against `key` in a window of `windowMs`; a lapsed window starts over at 1. */
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
  /** Forget `key` so its next hit starts a fresh window. */
  reset(key: string): Promise<void>;
}

export const RATE_LIMIT_BUCKET_STORE = Symbol('RATE_LIMIT_BUCKET_STORE');

type MemoryBucket = { count: number; resetAt: number };

export class MemoryRateLimitBucketStore implements RateLimitBucketStore {
  readonly kind = 'memory' as const;
  private readonly buckets = new Map<string, MemoryBucket>();

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const bucket = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
      this.prune(now);
      return { count: 1, resetAt: new Date(bucket.resetAt) };
    }
    existing.count += 1;
    return { count: existing.count, resetAt: new Date(existing.resetAt) };
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  private prune(now: number): void {
    if (this.buckets.size < 1_000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    while (this.buckets.size > 10_000) {
      const oldest = this.buckets.keys().next().value as string | undefined;
      if (!oldest) break;
      this.buckets.delete(oldest);
    }
  }
}

/**
 * Buckets live in `rate_limit_buckets` (migration rate_limit_buckets_v1). The
 * hit is one atomic upsert: a lapsed window restarts at 1 with a new reset
 * time, otherwise the count increments and the reset time is kept, so two
 * replicas hitting the same key at once cannot both see the same count.
 * Expired rows are swept opportunistically, roughly once per thousand hits.
 */
export class PostgresRateLimitBucketStore implements RateLimitBucketStore {
  readonly kind = 'postgres' as const;
  private readonly logger = new Logger(PostgresRateLimitBucketStore.name);
  private hitsSinceSweep = 0;

  constructor(private readonly pool: Pick<Pool, 'query'>, private readonly sweepEvery = 1_000) {}

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const result = await this.pool.query<{ count: number; reset_at: Date }>(
      `INSERT INTO rate_limit_buckets (key, count, reset_at)
       VALUES ($1, 1, clock_timestamp() + ($2::int * interval '1 millisecond'))
       ON CONFLICT (key) DO UPDATE SET
         count = CASE
           WHEN rate_limit_buckets.reset_at <= clock_timestamp() THEN 1
           ELSE rate_limit_buckets.count + 1
         END,
         reset_at = CASE
           WHEN rate_limit_buckets.reset_at <= clock_timestamp()
             THEN clock_timestamp() + ($2::int * interval '1 millisecond')
           ELSE rate_limit_buckets.reset_at
         END
       RETURNING count, reset_at`,
      [key, windowMs],
    );
    const row = result.rows[0];
    this.hitsSinceSweep += 1;
    if (this.hitsSinceSweep >= this.sweepEvery) {
      this.hitsSinceSweep = 0;
      void this.sweep();
    }
    return { count: Number(row.count), resetAt: new Date(row.reset_at) };
  }

  async reset(key: string): Promise<void> {
    await this.pool.query('DELETE FROM rate_limit_buckets WHERE key = $1', [key]);
  }

  private async sweep(): Promise<void> {
    try {
      await this.pool.query(
        `DELETE FROM rate_limit_buckets WHERE reset_at < clock_timestamp() - interval '1 hour'`,
      );
    } catch (error) {
      this.logger.warn(`Rate-limit bucket sweep failed: ${(error as Error).message}`);
    }
  }
}

export type RateLimitStoreKind = RateLimitBucketStore['kind'];

/**
 * RATE_LIMIT_STORE selects the implementation. Unset means Postgres in every
 * environment except NODE_ENV=test, where suites drive the API past any
 * ceiling and must not touch a database for it.
 */
export const rateLimitStoreKind = (
  environment: NodeJS.ProcessEnv = process.env,
): RateLimitStoreKind => {
  const configured = environment.RATE_LIMIT_STORE?.trim();
  if (configured === 'memory' || configured === 'postgres') return configured;
  if (configured) {
    throw new Error('RATE_LIMIT_STORE must be either "memory" or "postgres"');
  }
  return environment.NODE_ENV === 'test' ? 'memory' : 'postgres';
};

export const createRateLimitBucketStore = (
  pool: Pick<Pool, 'query'>,
  environment: NodeJS.ProcessEnv = process.env,
): RateLimitBucketStore =>
  rateLimitStoreKind(environment) === 'postgres'
    ? new PostgresRateLimitBucketStore(pool)
    : new MemoryRateLimitBucketStore();
