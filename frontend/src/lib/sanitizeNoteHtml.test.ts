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

  it('keeps mention pills and closes every other data attribute', () => {
    const pill = '<span class="mention" data-type="mention" data-entity="contact" data-id="7" data-label="Casey Sanchez">@Casey Sanchez</span>';
    expect(sanitizeNoteHtml(`<p>Call ${pill} today</p>`)).toBe(`<p>Call ${pill} today</p>`);
    expect(sanitizeNoteHtml('<p><span data-tracking="x" data-id="1">hi</span></p>')).toBe(
      '<p><span data-id="1">hi</span></p>',
    );
  });
});
