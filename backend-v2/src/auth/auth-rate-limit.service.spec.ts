import { Request } from 'express';
import { AuthRateLimitService } from './auth-rate-limit.service';

describe('AuthRateLimitService', () => {
  const originalNodeEnvironment = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnvironment;
  });

  it('limits repeated attempts by normalized email and proxy-resolved IP', () => {
    const service = new AuthRateLimitService();
    const request = { ip: '203.0.113.8' } as Request;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(() => service.consume(request, ' Member@Example.com ')).not.toThrow();
    }
    expect(() => service.consume(request, 'member@example.com')).toThrow(
      expect.objectContaining({
        extensions: expect.objectContaining({
          code: 'RATE_LIMITED',
          reason: 'AUTH_RATE_LIMITED',
        }),
      }),
    );
  });

  it('keeps separate identities and addresses in separate buckets', () => {
    const service = new AuthRateLimitService();
    const first = { ip: '203.0.113.8' } as Request;
    const second = { ip: '203.0.113.9' } as Request;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      service.consume(first, 'first@example.com');
    }

    expect(() => service.consume(first, 'second@example.com')).not.toThrow();
    expect(() => service.consume(second, 'first@example.com')).not.toThrow();
  });
});
