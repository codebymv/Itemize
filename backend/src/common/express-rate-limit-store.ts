import type { Options, Store } from 'express-rate-limit';
import type { RateLimitBucketStore } from './rate-limit-store';

/**
 * Adapts the shared RateLimitBucketStore to express-rate-limit's Store
 * contract so the ingress ceiling counts the same client across replicas.
 * `localKeys` is false for the Postgres store: the library's double-count
 * check must not assume this process owns the key.
 */
export class SharedRateLimitStore implements Store {
  prefix = 'ingress:';
  localKeys: boolean;
  private windowMs = 15 * 60 * 1000;

  constructor(private readonly buckets: RateLimitBucketStore) {
    this.localKeys = buckets.kind === 'memory';
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string) {
    const hit = await this.buckets.hit(this.prefix + key, this.windowMs);
    return { totalHits: hit.count, resetTime: hit.resetAt };
  }

  async decrement(): Promise<void> {
    // Skipped hits are not un-counted: the ceiling is a hard budget per window.
  }

  async resetKey(key: string): Promise<void> {
    await this.buckets.reset(this.prefix + key);
  }
}
