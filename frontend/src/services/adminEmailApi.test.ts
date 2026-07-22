import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../lib/api';
import { getEmailLogs, getPreview, sendEmail } from './adminEmailApi';
import { isAdminEmailDeliveryGraphqlEnabled, isAdminMessagingGraphqlEnabled } from './graphqlClient';
import { enqueueAdminEmailViaGraphql, getAdminEmailLogsViaGraphql, previewAdminEmailViaGraphql } from './adminEmailGraphql';

vi.mock('../lib/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('./graphqlClient', () => ({
  isAdminMessagingGraphqlEnabled: vi.fn(), isAdminEmailDeliveryGraphqlEnabled: vi.fn(),
}));
vi.mock('./adminEmailGraphql', () => ({
  enqueueAdminEmailViaGraphql: vi.fn(), getAdminEmailLogViaGraphql: vi.fn(),
  getAdminEmailLogsViaGraphql: vi.fn(), getAdminEmailTemplatesViaGraphql: vi.fn(),
  previewAdminEmailViaGraphql: vi.fn(),
}));

describe('admin email transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdminMessagingGraphqlEnabled).mockReturnValue(false);
    vi.mocked(isAdminEmailDeliveryGraphqlEnabled).mockReturnValue(false);
  });

  it('retains HTTP by default for read, preview, and delivery paths', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.example.test' } });
    vi.mocked(api.get).mockResolvedValue({ data: { data: { logs: [], total: 0, hasMore: false } } });
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { data: { html: 'rest', subject: 'x' } } })
      .mockResolvedValueOnce({ data: { data: { sent: 1, failed: 0, errors: [] } } });
    await getEmailLogs({ page: 0, limit: 25 });
    await getPreview({ subject: 'x', bodyHtml: 'y' });
    await sendEmail({ recipients: [{ email: 'a@example.test' }], subject: 'x', bodyHtml: 'y' });
    expect(api.get).toHaveBeenCalledWith('/api/admin/email/logs', { params: { page: 0, limit: 25, status: undefined } });
    expect(api.post).toHaveBeenNthCalledWith(1, '/api/admin/email/preview', { subject: 'x', bodyHtml: 'y', baseUrl: 'https://app.example.test' });
    expect(api.post).toHaveBeenNthCalledWith(2, '/api/admin/email/send', expect.any(Object));
    vi.unstubAllGlobals();
  });

  it('switches read/preview and delivery independently', async () => {
    vi.mocked(isAdminMessagingGraphqlEnabled).mockReturnValue(true);
    vi.mocked(isAdminEmailDeliveryGraphqlEnabled).mockReturnValue(true);
    vi.mocked(getAdminEmailLogsViaGraphql).mockResolvedValue({ logs: [], total: 0, hasMore: false });
    vi.mocked(previewAdminEmailViaGraphql).mockResolvedValue({ html: 'graphql', subject: 'x' });
    vi.mocked(enqueueAdminEmailViaGraphql).mockResolvedValue({ sent: 0, failed: 0, errors: [], queued: 1 });
    await getEmailLogs({ page: 0, limit: 25 });
    await getPreview({ subject: 'x', bodyHtml: 'y' });
    await sendEmail({ recipients: [{ email: 'a@example.test' }], subject: 'x', bodyHtml: 'y' });
    expect(getAdminEmailLogsViaGraphql).toHaveBeenCalled();
    expect(previewAdminEmailViaGraphql).toHaveBeenCalled();
    expect(enqueueAdminEmailViaGraphql).toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
