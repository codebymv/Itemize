import { Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { itemizeGraphqlError } from '../common/graphql-error';
import { RATE_LIMIT_BUCKET_STORE, RateLimitBucketStore } from '../common/rate-limit-store';

const WINDOW_MS = 15 * 60 * 1000;

/**
 * Per-operation AI budgets: a per-actor ceiling for signed-in callers plus a
 * looser per-IP ceiling, or a per-IP ceiling alone for public callers. Buckets
 * live in the shared RateLimitBucketStore so the budget holds across replicas.
 */
@Injectable()
export class AiRateLimitService {
  constructor(
    @Inject(RATE_LIMIT_BUCKET_STORE) private readonly store: RateLimitBucketStore,
  ) {}

  async consume(request: Request, namespace: string, limit: number, actorId?: string): Promise<void> {
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    if (actorId) {
      await this.consumeKey(`ai:${namespace}:actor:${actorId}`, limit);
      await this.consumeKey(`ai:${namespace}:ip:${ip}`, Math.max(limit * 3, limit));
    } else {
      await this.consumeKey(`ai:${namespace}:ip:${ip}`, limit);
    }
  }

  private async consumeKey(key: string, limit: number): Promise<void> {
    const { count } = await this.store.hit(key, WINDOW_MS);
    if (count > limit) {
      throw itemizeGraphqlError('Too many requests. Please try again later.', 'RATE_LIMITED', {
        reason: 'AI_RATE_LIMITED',
      });
    }
  }
}
