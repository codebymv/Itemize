import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';

type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = process.env.NODE_ENV === 'development' ? 40 : 8;

@Injectable()
export class VaultUnlockRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  consume(userId: number, vaultId: number): void {
    const now = Date.now();
    const key = `${userId}:${vaultId}`;
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      this.prune(now);
      return;
    }
    if (existing.count >= LIMIT) {
      throw itemizeGraphqlError(
        'Too many vault password attempts. Try again in 15 minutes.',
        'RATE_LIMITED',
        { reason: 'VAULT_UNLOCK_RATE_LIMITED' },
      );
    }
    existing.count += 1;
  }

  reset(userId: number, vaultId: number): void {
    this.buckets.delete(`${userId}:${vaultId}`);
  }

  private prune(now: number): void {
    if (this.buckets.size < 1_000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
