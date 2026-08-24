import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { itemizeGraphqlError } from '../common/graphql-error';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class AiRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  consume(request: Request, namespace: string, limit: number): void {
    const now = Date.now();
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    const key = `${namespace}:${ip}`;
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
      this.prune(now);
      return;
    }
    if (bucket.count >= limit) {
      throw itemizeGraphqlError('Too many requests. Please try again later.', 'RATE_LIMITED', {
        reason: 'AI_RATE_LIMITED',
      });
    }
    bucket.count += 1;
  }

  private prune(now: number): void {
    if (this.buckets.size < 1_000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    while (this.buckets.size > 10_000) {
      const key = this.buckets.keys().next().value as string | undefined;
      if (!key) break;
      this.buckets.delete(key);
    }
  }
}
