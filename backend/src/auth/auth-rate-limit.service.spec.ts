import { Request } from 'express';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { MemoryRateLimitBucketStore } from '../common/rate-limit-store';

const rateLimited = expect.objectContaining({
  extensions: expect.objectContaining({
    code: 'RATE_LIMITED',
    reason: 'AUTH_RATE_LIMITED',
  }),
});

describe('AuthRateLimitService', () => {
  const originalNodeEnvironment = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnvironment;
  });

  const build = () => new AuthRateLimitService(new MemoryRateLimitBucketStore());

  it('limits repeated attempts by normalized email and proxy-resolved IP', async () => {
    const service = build();
    const request = { ip: '203.0.113.8' } as Request;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await expect(service.consume(request, ' Member@Example.com ')).resolves.toBeUndefined();
    }
    await expect(service.consume(request, 'member@example.com')).rejects.toEqual(rateLimited);
  });

  it('keeps separate identities and addresses in separate buckets', async () => {
    const service = build();
    const first = { ip: '203.0.113.8' } as Request;
    const second = { ip: '203.0.113.9' } as Request;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await service.consume(first, 'first@example.com');
    }

    await expect(service.consume(first, 'second@example.com')).resolves.toBeUndefined();
    await expect(service.consume(second, 'first@example.com')).resolves.toBeUndefined();
  });

  it('uses the stricter independent bucket for verification resend attempts', async () => {
    const service = build();
    const request = { ip: '203.0.113.10' } as Request;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(service.consumeStrict(request, 'member@example.com')).resolves.toBeUndefined();
    }
    await expect(service.consumeStrict(request, 'member@example.com')).rejects.toEqual(rateLimited);

    await expect(service.consume(request, 'member@example.com')).resolves.toBeUndefined();
  });

  it('counts through whichever bucket store the replica set shares', async () => {
    const hits: string[] = [];
    const service = new AuthRateLimitService({
      kind: 'postgres',
      hit: async (key) => {
        hits.push(key);
        return { count: hits.length, resetAt: new Date(Date.now() + 1_000) };
      },
      reset: async () => undefined,
    });
    const request = { ip: '203.0.113.11' } as Request;
    await service.consume(request, 'Member@Example.com');
    expect(hits).toEqual(['auth:standard:203.0.113.11:member@example.com']);
  });
});
