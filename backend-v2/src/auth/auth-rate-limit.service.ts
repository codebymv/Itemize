import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { itemizeGraphqlError } from '../common/graphql-error';

type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class AuthRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  consume(request: Request, identity = ''): void {
    this.consumeBucket(request, identity, 'standard',
      process.env.NODE_ENV === 'development' ? 100 : 20);
  }

  consumeStrict(request: Request, identity = ''): void {
    this.consumeBucket(request, identity, 'strict',
      process.env.NODE_ENV === 'development' ? 80 : 10);
  }

  private consumeBucket(
    request: Request,
    identity: string,
    namespace: string,
    limit: number,
  ): void {
    const now = Date.now();
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    const key = `${namespace}:${ip}:${identity.trim().toLowerCase()}`;
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      this.prune(now);
      return;
    }
    if (existing.count >= limit) {
      throw itemizeGraphqlError(
        'Too many authentication attempts. Please try again in 15 minutes.',
        'RATE_LIMITED',
        { reason: 'AUTH_RATE_LIMITED' },
      );
    }
    existing.count += 1;
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
