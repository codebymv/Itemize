import { act, render, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';
import { RichTextEditor } from './RichTextEditor';

const captured = vi.hoisted(() => ({ editor: null as Editor | null }));
vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiptap/react')>();
  return {
    ...actual,
    useEditor: (...args: Parameters<typeof actual.useEditor>) => {
      captured.editor = actual.useEditor(...args);
      return captured.editor;
    },
  };
});

describe('RichTextEditor content synchronization', () => {
  it('reports the first edit after loading different content without emitting a prop-only update', async () => {
    const onChange = vi.fn();
    const view = render(<RichTextEditor value="<p>Original</p>" onChange={onChange} />);
    await waitFor(() => expect(captured.editor?.getText()).toBe('Original'));
    view.rerender(<RichTextEditor value="<p>Loaded draft</p>" onChange={onChange} />);
    await waitFor(() => expect(captured.editor?.getText()).toBe('Loaded draft'));
    expect(onChange).not.toHaveBeenCalled();
    act(() => { captured.editor!.commands.insertContentAt(1, 'First edit: '); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('First edit: Loaded draft</p>'));
  });
});
