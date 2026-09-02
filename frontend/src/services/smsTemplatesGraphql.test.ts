import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import { createSmsTemplateViaGraphql, getSmsMessageInfoViaGraphql, getSmsTemplatesViaGraphql, resetSmsTemplateListCapability } from './smsTemplatesGraphql';

vi.mock('@/lib/api', () => ({ fetchCsrfToken: vi.fn(), getApiUrl: vi.fn(() => 'https://api.test'), refreshAuthenticatedSession: vi.fn() }));
const response = (payload: unknown): Response => ({ ok: true, status: 200, json: vi.fn().mockResolvedValue(payload) }) as unknown as Response;
const template = { id: 9, organizationId: 4, name: 'Reminder', message: 'Hi {{first_name}}', variables: ['first_name'],
  category: 'general', isActive: true, createdById: 7, createdByName: 'Owner',
  createdAt: '2026-07-21T00:00:00Z', updatedAt: '2026-07-21T00:00:00Z' };

describe('SMS-template GraphQL consumer', () => {
  beforeEach(() => { resetSmsTemplateListCapability(); vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test/graphql'); vi.stubGlobal('fetch', vi.fn()); vi.mocked(fetchCsrfToken).mockResolvedValue('sms-csrf'); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('loads one bounded page with global catalog metadata and cancellation', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: { smsTemplates: {
      nodes: [template],
      pageInfo: { page: 2, pageSize: 20, total: 21, totalPages: 2, hasNextPage: false },
      stats: { total: 40, active: 32, inactive: 8, categories: 4 },
      categories: [{ category: 'general', count: 12 }],
    } } }));
    const result = await getSmsTemplatesViaGraphql(
      { category: 'general', is_active: true, search: ' reminder ', page: 2, limit: 20 }, 4, controller.signal,
    );
    expect(result).toMatchObject({
      templates: [{ organization_id: 4, is_active: true, created_by: 7 }],
      total: 21,
      pagination: { page: 2, limit: 20, total: 21, totalPages: 2 },
      stats: { total: 40, active: 32, inactive: 8, categories: 4 },
      categories: [{ category: 'general', count: 12 }],
    });
    expect(fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.variables.page).toEqual({ page: 2, pageSize: 20 });
    expect(body.variables.filter).toEqual({ category: 'general', isActive: true, search: 'reminder' });
    expect((vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
  });
  it('negotiates legacy catalog metadata once without walking result pages', async () => {
    const legacyPayload = response({ data: {
      filtered: { nodes: [template], pageInfo: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNextPage: false } },
      all: { pageInfo: { total: 8 } },
      active: { pageInfo: { total: 6 } },
      inactive: { pageInfo: { total: 2 } },
      smsTemplateCategories: [{ category: 'general', count: 3 }],
    } });
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ errors: [{ message: 'Cannot query field "stats" on type "SmsTemplatePage".' }] }))
      .mockResolvedValueOnce(legacyPayload)
      .mockResolvedValueOnce(legacyPayload);
    await expect(getSmsTemplatesViaGraphql({ page: 1, limit: 20 }, 4)).resolves.toMatchObject({
      templates: [{ id: 9 }],
      stats: { total: 8, active: 6, inactive: 2, categories: 1 },
    });
    await getSmsTemplatesViaGraphql({ page: 1, limit: 20 }, 4);
    const operations = vi.mocked(fetch).mock.calls.map(([, init]) => {
      const request = JSON.parse(String((init as RequestInit).body));
      return String(request.query).match(/query\s+([A-Za-z0-9_]+)/)?.[1];
    });
    expect(operations).toEqual(['SmsTemplates', 'SmsTemplatesLegacy', 'SmsTemplatesLegacy']);
  });
  it('uses CSRF and removes organization authority from create input', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ data: { createSmsTemplate: template } }));
    await createSmsTemplateViaGraphql(
      { organization_id: 4, name: 'Reminder', message: 'Hi', is_active: false },
      'sms-create-9',
    );
    const [url, options] = vi.mocked(fetch).mock.calls[0]; const body = JSON.parse(String((options as RequestInit).body));
    expect(url).toBe('https://graphql.test/graphql'); expect((options as RequestInit).headers).toMatchObject({ 'x-csrf-token': 'sms-csrf', 'x-organization-id': '4' });
    expect(body.variables.input).toEqual({ name: 'Reminder', message: 'Hi', isActive: false });
    expect(body.variables.idempotencyKey).toBe('sms-create-9');
  });
  it('maps standards-aware message information', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ data: { smsMessageInfo: { length: 162, segments: 2, encoding: 'GSM', charsRemaining: 144 } } }));
    await expect(getSmsMessageInfoViaGraphql('^'.repeat(81))).resolves.toEqual({ length: 162, segments: 2, encoding: 'GSM', charsRemaining: 144 });
  });
});
