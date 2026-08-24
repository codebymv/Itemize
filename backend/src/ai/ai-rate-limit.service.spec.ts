import { Request } from 'express';
import { AiRateLimitService } from './ai-rate-limit.service';

describe('AiRateLimitService', () => {
  it('enforces independent per-IP operation budgets', () => {
    const service = new AiRateLimitService();
    const request = { ip: '127.0.0.1', socket: {} } as Request;

    service.consume(request, 'marketing-ask', 1);

    expect(() => service.consume(request, 'marketing-ask', 1)).toThrow(
      expect.objectContaining({
        extensions: expect.objectContaining({
          code: 'RATE_LIMITED',
          reason: 'AI_RATE_LIMITED',
        }),
      }),
    );
    expect(() => service.consume(request, 'marketing-token', 1)).not.toThrow();
  });

  it('separates authenticated actors sharing an IP and retains an IP ceiling', () => {
    const service = new AiRateLimitService();
    const request = { ip: '127.0.0.1', socket: {} } as Request;

    service.consume(request, 'workspace-suggestions', 1, 'user-1');
    expect(() => service.consume(request, 'workspace-suggestions', 1, 'user-1')).toThrow();
    expect(() => service.consume(request, 'workspace-suggestions', 1, 'user-2')).not.toThrow();
    expect(() => service.consume(request, 'workspace-suggestions', 1, 'user-3')).not.toThrow();
    expect(() => service.consume(request, 'workspace-suggestions', 1, 'user-4')).toThrow();
  });
});
