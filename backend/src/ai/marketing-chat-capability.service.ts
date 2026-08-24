import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';

const TTL_MS = 5 * 60 * 1000;

@Injectable()
export class MarketingChatCapabilityService {
  private readonly tokens = new Map<string, number>();

  issue(): string {
    const payload = `${randomBytes(16).toString('hex')}.${Date.now()}`;
    const token = `${payload}.${this.sign(payload)}`;
    this.tokens.set(token, Date.now() + TTL_MS);
    this.prune();
    return token;
  }

  consume(token: string): void {
    if (typeof token !== 'string' || token.length > 200) this.reject();
    const parts = token.split('.');
    if (parts.length !== 3) this.reject();
    const payload = `${parts[0]}.${parts[1]}`;
    const actual = Buffer.from(parts[2]);
    const expected = Buffer.from(this.sign(payload));
    const expiresAt = this.tokens.get(token);
    this.tokens.delete(token);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected) ||
      !expiresAt ||
      expiresAt <= Date.now()
    ) {
      this.reject();
    }
  }

  private sign(payload: string): string {
    const secret =
      process.env.JWT_SECRET ||
      process.env.SESSION_SECRET ||
      'development-marketing-chat-secret';
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  private prune(): void {
    const now = Date.now();
    for (const [token, expiresAt] of this.tokens) {
      if (expiresAt <= now) this.tokens.delete(token);
    }
    while (this.tokens.size > 10_000) {
      const token = this.tokens.keys().next().value as string | undefined;
      if (!token) break;
      this.tokens.delete(token);
    }
  }

  private reject(): never {
    throw itemizeGraphqlError('Session expired. Please try again.', 'UNAUTHENTICATED', {
      reason: 'MARKETING_CHAT_TOKEN_INVALID',
    });
  }
}
