import { AiProviderService } from './ai-provider.service';

const aiEnvKeys = [
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'AI_PROVIDER',
  'AI_FALLBACK_PROVIDER',
  'AI_OPENAI_MODEL',
  'AI_OPENAI_REASONING_EFFORT',
  'AI_GEMINI_MODEL',
  'AI_REQUEST_TIMEOUT_MS',
] as const;

describe('AiProviderService', () => {
  const originalEnv = Object.fromEntries(aiEnvKeys.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    for (const key of aiEnvKeys) delete process.env[key];
    jest.restoreAllMocks();
  });

  afterAll(() => {
    for (const key of aiEnvKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('returns the stable empty result without provider credentials', async () => {
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

  it('uses GPT-5.6 Luna with bounded output and caches successful suggestions', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [{
          type: 'message',
          content: [{ type: 'output_text', text: 'Milk, Eggs, Butter' }],
        }],
        usage: { input_tokens: 24, output_tokens: 8 },
      }),
    } as Response);
    const service = new AiProviderService();

    await expect(service.listSuggestions('Groceries', ['Bread'])).resolves.toEqual({
      suggestions: ['Milk', 'Eggs', 'Butter'],
    });
    await expect(service.listSuggestions('Groceries', ['Bread'])).resolves.toEqual({
      suggestions: ['Milk', 'Eggs', 'Butter'],
      cached: true,
    });

    await expect(service.listSuggestions('Groceries', ['Bread'], true)).resolves.toEqual({
      suggestions: ['Milk', 'Eggs', 'Butter'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer test-openai-key',
    }));
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: 'gpt-5.6-luna',
      max_output_tokens: 120,
      reasoning: { effort: 'none' },
      text: { verbosity: 'low' },
      temperature: 0.45,
      store: false,
      metadata: { feature: 'list-suggestions' },
    });
  });

  it('accepts specific Luna suggestions that are longer than a short label', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: [
              'Identify target onboarding users and success metrics',
              'Map the end-to-end onboarding flow and key milestones',
              'Create sample checklist templates for common use cases',
              'Implement progress tracking and completion states',
              'Plan usability testing and feedback collection',
            ].join('\n'),
          }],
        }],
      }),
    } as Response);
    const service = new AiProviderService();

    await expect(
      service.listSuggestions('Launch Itemize onboarding checklist', [
        'Write the launch announcement and define the primary customer promise',
      ]),
    ).resolves.toEqual({
      suggestions: [
        'Identify target onboarding users and success metrics',
        'Map the end-to-end onboarding flow and key milestones',
        'Create sample checklist templates for common use cases',
        'Implement progress tracking and completion states',
        'Plan usability testing and feedback collection',
      ],
    });
  });

  it('returns a stable client-safe error when a provider request fails', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 429 } as Response);
    const service = new AiProviderService();

    await expect(service.noteSuggestions('A sufficiently long note')).resolves.toEqual({
      suggestions: [],
      error: 'AI suggestions are temporarily unavailable',
    });
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
