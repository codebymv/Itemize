import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { sanitizeNoteHtml } from '@/lib/sanitizeNoteHtml';
import { migrateNoteContentToHtml, shouldApplyExternalNoteHtml } from './noteEditorHtml';

describe('RichNoteContent HTML round-trip', () => {
  it('keeps list markup without trimming trailing space', () => {
    const html = '<ul><li><p>one </p></li><li><p>two</p></li></ul>';
    const editor = new Editor({
      extensions: [StarterKit],
      content: html,
    });
    expect(editor.getHTML()).toContain('<ul>');
    expect(editor.getHTML()).toContain('one');
    editor.destroy();
  });

  it('sanitizes a Word-style paste fixture before TipTap load', () => {
    const paste =
      '<p class="MsoNormal">Hello <b>world</b></p><ul><li>Alpha<script>alert(1)</script></li></ul>';
    const clean = sanitizeNoteHtml(paste);
    expect(clean).not.toContain('script');
    expect(clean).toContain('Hello');

    const editor = new Editor({
      extensions: [StarterKit],
      content: clean,
    });
    expect(editor.getHTML()).toContain('Hello');
    expect(editor.getHTML()).not.toContain('script');
    editor.destroy();
  });

  it('skips setContent while the editor is focused', () => {
    expect(
      shouldApplyExternalNoteHtml({
        isFocused: true,
        isUpdatingFromProps: false,
        currentHtml: '<p>draft</p>',
        incomingHtml: '<p>saved echo</p>',
      }),
    ).toBe(false);
  });

  it('migrates plain text to paragraphs', () => {
    expect(migrateNoteContentToHtml('hello\nworld')).toBe('<p>hello</p><p>world</p>');
  });
});
