import { Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { itemizeGraphqlError } from '../common/graphql-error';
import { RATE_LIMIT_BUCKET_STORE, RateLimitBucketStore } from '../common/rate-limit-store';

const WINDOW_MS = 15 * 60 * 1000;

/**
 * Throttles authentication attempts per proxy-resolved IP and normalised
 * identity. Buckets live in the shared RateLimitBucketStore, so the ceiling
 * holds across API replicas; under NODE_ENV=test that store is in memory.
 */
@Injectable()
export class AuthRateLimitService {
  constructor(
    @Inject(RATE_LIMIT_BUCKET_STORE) private readonly store: RateLimitBucketStore,
  ) {}

  consume(request: Request, identity = ''): Promise<void> {
    return this.consumeBucket(request, identity, 'standard',
      process.env.NODE_ENV === 'development' ? 100 : 20);
  }

  consumeStrict(request: Request, identity = ''): Promise<void> {
    return this.consumeBucket(request, identity, 'strict',
      process.env.NODE_ENV === 'development' ? 80 : 10);
  }

  private async consumeBucket(
    request: Request,
    identity: string,
    namespace: string,
    limit: number,
  ): Promise<void> {
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    const key = `auth:${namespace}:${ip}:${identity.trim().toLowerCase()}`;
    const { count } = await this.store.hit(key, WINDOW_MS);
    if (count > limit) {
      throw itemizeGraphqlError(
        'Too many authentication attempts. Please try again in 15 minutes.',
        'RATE_LIMITED',
        { reason: 'AUTH_RATE_LIMITED' },
      );
    }
  }
}
