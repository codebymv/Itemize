import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import { createSmsTemplateViaGraphql, getSmsMessageInfoViaGraphql, getSmsTemplatesViaGraphql } from './smsTemplatesGraphql';

vi.mock('@/lib/api', () => ({ fetchCsrfToken: vi.fn(), getApiUrl: vi.fn(() => 'https://api.test'), refreshAuthenticatedSession: vi.fn() }));
const response = (payload: unknown): Response => ({ ok: true, status: 200, json: vi.fn().mockResolvedValue(payload) }) as unknown as Response;
const template = { id: 9, organizationId: 4, name: 'Reminder', message: 'Hi {{first_name}}', variables: ['first_name'],
  category: 'general', isActive: true, createdById: 7, createdByName: 'Owner',
  createdAt: '2026-07-21T00:00:00Z', updatedAt: '2026-07-21T00:00:00Z' };

describe('SMS-template GraphQL consumer', () => {
  beforeEach(() => { vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test/graphql'); vi.stubGlobal('fetch', vi.fn()); vi.mocked(fetchCsrfToken).mockResolvedValue('sms-csrf'); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('walks all pages and maps filters plus legacy casing', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ data: { smsTemplates: { nodes: [template], pageInfo: { total: 2, hasNextPage: true } } } }))
      .mockResolvedValueOnce(response({ data: { smsTemplates: { nodes: [{ ...template, id: 10 }], pageInfo: { total: 2, hasNextPage: false } } } }));
    const result = await getSmsTemplatesViaGraphql({ category: 'general', is_active: 'true', search: 'reminder' }, 4);
    expect(result.templates).toHaveLength(2); expect(result.templates[0]).toMatchObject({ organization_id: 4, is_active: true, created_by: 7 });
    const bodies = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies.map((body) => body.variables.page.page)).toEqual([1, 2]);
    expect(bodies[0].variables.filter).toEqual({ category: 'general', isActive: true, search: 'reminder' });
  });
  it('uses CSRF and removes organization authority from create input', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ data: { createSmsTemplate: template } }));
    await createSmsTemplateViaGraphql({ organization_id: 4, name: 'Reminder', message: 'Hi', is_active: false });
    const [url, options] = vi.mocked(fetch).mock.calls[0]; const body = JSON.parse(String((options as RequestInit).body));
    expect(url).toBe('https://graphql.test/graphql'); expect((options as RequestInit).headers).toMatchObject({ 'x-csrf-token': 'sms-csrf', 'x-organization-id': '4' });
    expect(body.variables.input).toEqual({ name: 'Reminder', message: 'Hi', isActive: false });
  });
  it('maps standards-aware message information', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ data: { smsMessageInfo: { length: 162, segments: 2, encoding: 'GSM', charsRemaining: 144 } } }));
    await expect(getSmsMessageInfoViaGraphql('^'.repeat(81))).resolves.toEqual({ length: 162, segments: 2, encoding: 'GSM', charsRemaining: 144 });
  });
});
