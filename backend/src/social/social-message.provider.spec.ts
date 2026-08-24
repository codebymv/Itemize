import { MetaSocialMessageProvider } from './social-message.provider';

const response = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  }) as unknown as Response;

describe('MetaSocialMessageProvider', () => {
  const provider = new MetaSocialMessageProvider();

  beforeEach(() => jest.restoreAllMocks());

  it('returns the accepted provider message ID', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(200, { message_id: 'mid.accepted' }),
    );
    await expect(
      provider.send({
        pageId: 'page/with spaces',
        participantId: 'participant',
        accessToken: 'secret-token',
        text: 'Hello',
      }),
    ).resolves.toEqual({ kind: 'accepted', providerId: 'mid.accepted' });
    expect(fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v18.0/page%2Fwith%20spaces/messages',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('treats definite client rejection as terminal', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(400, { error: { message: 'Recipient is unavailable' } }),
    );
    await expect(
      provider.send({
        pageId: 'page',
        participantId: 'participant',
        accessToken: 'secret-token',
        text: 'Hello',
      }),
    ).resolves.toEqual({
      kind: 'rejected',
      message: 'Recipient is unavailable',
    });
  });

  it.each([
    ['network failure', () => Promise.reject(new Error('socket closed'))],
    ['provider overload', () => Promise.resolve(response(503, {}))],
    ['missing receipt', () => Promise.resolve(response(200, {}))],
  ])('requires reconciliation after an ambiguous %s', async (_label, outcome) => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(outcome);
    await expect(
      provider.send({
        pageId: 'page',
        participantId: 'participant',
        accessToken: 'secret-token',
        text: 'Hello',
      }),
    ).resolves.toMatchObject({ kind: 'reconciliation' });
  });
});
