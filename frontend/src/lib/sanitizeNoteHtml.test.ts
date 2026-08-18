import { sanitizeNoteHtml } from './sanitizeNoteHtml';

describe('sanitizeNoteHtml', () => {
  it('strips script tags and event handlers', () => {
    expect(sanitizeNoteHtml('<p onclick="alert(1)">ok<script>alert(2)</script></p>')).toBe(
      '<p>ok</p>',
    );
  });

  it('keeps simple formatted notes', () => {
    expect(sanitizeNoteHtml('<p><strong>Hello</strong></p>')).toBe(
      '<p><strong>Hello</strong></p>',
    );
  });
});
