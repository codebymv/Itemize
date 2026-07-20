import { describe, expect, it } from 'vitest';
import { sandboxedEmailPreviewDocument } from './emailPreviewWindow';

describe('sandboxedEmailPreviewDocument', () => {
  it('keeps preview markup inside a script-disabled iframe', () => {
    const document = sandboxedEmailPreviewDocument(
      '<html><script>window.opener.pwned=true</script></html>',
    );
    expect(document).toContain('sandbox="allow-same-origin"');
    expect(document).not.toContain('allow-scripts');
    expect(document).not.toContain('<script>window.opener.pwned=true</script>');
    expect(document).toContain(
      '&lt;html&gt;&lt;script&gt;window.opener.pwned=true&lt;/script&gt;&lt;/html&gt;',
    );
  });

  it('prevents attribute and iframe breakout payloads', () => {
    const document = sandboxedEmailPreviewDocument(
      '\"><\/iframe><script>alert(1)</script>',
    );
    expect(document).not.toContain('</iframe><script>alert(1)</script>');
    expect(document).toContain('&quot;&gt;&lt;/iframe&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
