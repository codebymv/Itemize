import { MarketingChatCapabilityService } from './marketing-chat-capability.service';

describe('MarketingChatCapabilityService', () => {
  let service: MarketingChatCapabilityService;

  beforeEach(() => {
    service = new MarketingChatCapabilityService();
  });

  it('issues a one-time capability', () => {
    const token = service.issue();

    expect(() => service.consume(token)).not.toThrow();
    expect(() => service.consume(token)).toThrow(
      expect.objectContaining({
        extensions: expect.objectContaining({
          code: 'UNAUTHENTICATED',
          reason: 'MARKETING_CHAT_TOKEN_INVALID',
        }),
      }),
    );
  });

  it('rejects malformed capabilities', () => {
    expect(() => service.consume('not-a-capability')).toThrow(
      expect.objectContaining({
        extensions: expect.objectContaining({
          code: 'UNAUTHENTICATED',
          reason: 'MARKETING_CHAT_TOKEN_INVALID',
        }),
      }),
    );
  });
});
