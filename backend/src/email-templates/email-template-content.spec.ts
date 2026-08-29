import {
  renderEmailHtmlVariables,
  renderEmailTextVariables,
  sanitizeEmailTemplateHtml,
} from './email-template-content';

describe('email template content', () => {
  it('retains the constrained editor vocabulary and normalizes links', () => {
    const result = sanitizeEmailTemplateHtml(
      '<h2 style="text-align:center;color:red">Hello</h2>' +
      '<a class="button-primary unknown" href="https://example.test/path">Open</a>',
    );
    expect(result).toContain('<h2 style="text-align: center">Hello</h2>');
    expect(result).toContain('class="button-primary"');
    expect(result).toContain('href="https://example.test/path"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).not.toContain('color:red');
    expect(result).not.toContain('unknown');
  });

  it('removes executable content and unsafe link protocols', () => {
    const result = sanitizeEmailTemplateHtml(
      '<p onclick="alert(1)">Safe<script>alert(2)</script></p>' +
      '<a href="javascript:alert(3)">Bad</a><iframe src="https://example.test"></iframe>',
    );
    expect(result).toContain('<p>Safe</p>');
    expect(result).toContain('<a rel="noopener noreferrer" target="_blank">Bad</a>');
    expect(result).not.toMatch(/onclick|script|javascript|iframe/i);
  });

  it('escapes HTML variable values while retaining plain-text values', () => {
    const data = { first_name: '<img src=x onerror=alert(1)>', company: 'A & B' };
    expect(renderEmailHtmlVariables('<p>Hello {{ first_name }} at {{company}}</p>', data))
      .toBe('<p>Hello &lt;img src=x onerror=alert(1)&gt; at A &amp; B</p>');
    expect(renderEmailTextVariables('Hello {{first_name}} at {{ company }}', data))
      .toBe('Hello <img src=x onerror=alert(1)> at A & B');
  });
});
