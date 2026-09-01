import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEmailLog, getEmailLogs, getEmailTemplates, getPreview, sendEmail } from './adminEmailApi';
import {
  enqueueAdminEmailViaGraphql,
  getAdminEmailLogViaGraphql,
  getAdminEmailLogsViaGraphql,
  getAdminEmailTemplatesViaGraphql,
  previewAdminEmailViaGraphql,
} from './adminEmailGraphql';

vi.mock('./adminEmailGraphql', () => ({
  enqueueAdminEmailViaGraphql: vi.fn(), getAdminEmailLogViaGraphql: vi.fn(),
  getAdminEmailLogsViaGraphql: vi.fn(), getAdminEmailTemplatesViaGraphql: vi.fn(),
  previewAdminEmailViaGraphql: vi.fn(),
}));

describe('admin email GraphQL service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates reads, preview, and delivery to GraphQL', async () => {
    vi.mocked(getAdminEmailLogsViaGraphql).mockResolvedValue({ logs: [], total: 0, hasMore: false });
    vi.mocked(getAdminEmailLogViaGraphql).mockResolvedValue({ id: 4 } as never);
    vi.mocked(getAdminEmailTemplatesViaGraphql).mockResolvedValue({ templates: [], total: 0 } as never);
    vi.mocked(previewAdminEmailViaGraphql).mockResolvedValue({ html: 'graphql', subject: 'x' });
    vi.mocked(enqueueAdminEmailViaGraphql).mockResolvedValue({ sent: 0, failed: 0, errors: [], queued: 1 });
    await getEmailLogs({ page: 0, limit: 25 });
    await getEmailLog(4);
    await getEmailTemplates({ search: 'welcome' });
    await getPreview({ subject: 'x', bodyHtml: 'y' });
    await sendEmail({
      recipients: [{ email: 'a@example.test' }],
      subject: 'x',
      bodyHtml: 'y',
      idempotencyKey: 'admin-email-request-1',
    });
    expect(getAdminEmailLogsViaGraphql).toHaveBeenCalledWith({ page: 0, limit: 25 });
    expect(getAdminEmailLogViaGraphql).toHaveBeenCalledWith(4);
    expect(getAdminEmailTemplatesViaGraphql).toHaveBeenCalledWith({ search: 'welcome' });
    expect(previewAdminEmailViaGraphql).toHaveBeenCalledWith({
      subject: 'x',
      bodyHtml: 'y',
      baseUrl: 'http://localhost:3000',
    });
    expect(enqueueAdminEmailViaGraphql).toHaveBeenCalledWith({
      recipients: [{ email: 'a@example.test' }],
      subject: 'x',
      bodyHtml: 'y',
      idempotencyKey: 'admin-email-request-1',
    });
  });
});
