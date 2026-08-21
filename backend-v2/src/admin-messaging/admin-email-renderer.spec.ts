import {
  normalizeAdminEmailBaseUrl,
  renderAdminEmail,
  wrapAdminEmail,
} from './admin-email-renderer';

describe('admin email renderer', () => {
  it('uses the shared shell and resolves footer variables', () => {
    const rendered = renderAdminEmail(
      'Hello {{userName}}',
      '<p>Account: {{userEmail}}</p>',
      {
        userName: 'Ada',
        userEmail: 'ada@example.com',
        unsubscribeUrl: 'https://itemize.cloud/unsubscribe/token',
      },
      'https://itemize.cloud',
    );
    expect(rendered.subject).toBe('Hello Ada');
    expect(rendered.html).toContain('https://itemize.cloud/cover.png');
    expect(rendered.html).toContain('height:4px;background:#2563eb');
    expect(rendered.html).toContain('ada@example.com');
    expect(rendered.html).toContain('https://itemize.cloud/unsubscribe/token');
    expect(rendered.html).not.toContain('{{unsubscribeUrl}}');
  });

  it('preserves intentionally complete customer HTML and rejects unsafe origins', () => {
    expect(wrapAdminEmail('<html><body>Custom</body></html>', 'Custom', 'https://itemize.cloud'))
      .toBe('<html><body>Custom</body></html>');
    expect(() => normalizeAdminEmailBaseUrl('javascript:alert(1)'))
      .toThrow('INVALID_BASE_URL');
  });
});
