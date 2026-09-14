import { Request } from 'express';
import { AiRateLimitService } from './ai-rate-limit.service';
import { MemoryRateLimitBucketStore } from '../common/rate-limit-store';

const rateLimited = expect.objectContaining({
  extensions: expect.objectContaining({
    code: 'RATE_LIMITED',
    reason: 'AI_RATE_LIMITED',
  }),
});

describe('AiRateLimitService', () => {
  const build = () => new AiRateLimitService(new MemoryRateLimitBucketStore());

  it('enforces independent per-IP operation budgets', async () => {
    const service = build();
    const request = { ip: '127.0.0.1', socket: {} } as Request;

    await service.consume(request, 'marketing-ask', 1);

    await expect(service.consume(request, 'marketing-ask', 1)).rejects.toEqual(rateLimited);
    await expect(service.consume(request, 'marketing-token', 1)).resolves.toBeUndefined();
  });

  it('separates authenticated actors sharing an IP and retains an IP ceiling', async () => {
    const service = build();
    const request = { ip: '127.0.0.1', socket: {} } as Request;

    await service.consume(request, 'workspace-suggestions', 1, 'user-1');
    await expect(service.consume(request, 'workspace-suggestions', 1, 'user-1')).rejects.toEqual(rateLimited);
    await expect(service.consume(request, 'workspace-suggestions', 1, 'user-2')).resolves.toBeUndefined();
    await expect(service.consume(request, 'workspace-suggestions', 1, 'user-3')).resolves.toBeUndefined();
    await expect(service.consume(request, 'workspace-suggestions', 1, 'user-4')).rejects.toEqual(rateLimited);
  });
});
