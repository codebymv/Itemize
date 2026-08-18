import { sanitizeNoteHtml } from './note-html';

describe('sanitizeNoteHtml', () => {
  it('strips script, style, iframe, event handlers, and javascript URLs', () => {
    const dirty =
      '<p onclick="alert(1)">ok<script>alert(2)</script><a href="javascript:alert(3)">x</a></p>';
    const clean = sanitizeNoteHtml(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toContain('ok');
  });

  it('keeps simple formatted notes', () => {
    expect(sanitizeNoteHtml('<p><strong>Hello</strong></p>')).toBe(
      '<p><strong>Hello</strong></p>',
    );
  });
});
