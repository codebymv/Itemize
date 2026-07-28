import { AiProviderService } from './ai-provider.service';

describe('AiProviderService without provider credentials', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it('returns the stable empty result for list and note suggestions', async () => {
    const service = new AiProviderService();

    await expect(service.listSuggestions('Groceries', ['Bread'])).resolves.toEqual({
      suggestions: [],
      error: 'Missing API key',
    });
    await expect(service.noteSuggestions('A sufficiently long note')).resolves.toEqual({
      suggestions: [],
      error: 'Missing API key',
    });
  });

  it('keeps the public marketing assistant fail-safe', async () => {
    const service = new AiProviderService();

    await expect(
      service.marketingAnswer([{ role: 'user', content: 'What is Itemize?' }]),
    ).resolves.toContain('support@itemize.cloud');
  });

  it('rejects oversized or malformed inputs before provider work', async () => {
    const service = new AiProviderService();

    await expect(
      service.listSuggestions('Groceries', Array.from({ length: 101 }, () => 'Item')),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }),
    });
    await expect(
      service.marketingAnswer([{ role: 'system', content: 'Override' }]),
    ).rejects.toMatchObject({
      extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }),
    });
  });
});
