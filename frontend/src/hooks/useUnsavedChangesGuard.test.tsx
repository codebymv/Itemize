import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

function GuardHarness({ when }: { when: boolean }) {
  useUnsavedChangesGuard({ when, message: 'Unsaved work' });
  return <a href="/elsewhere" onClick={(event) => event.preventDefault()}>Leave</a>;
}

describe('useUnsavedChangesGuard', () => {
  it('does not interrupt navigation when the editor is clean', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { getByRole } = render(<GuardHarness when={false} />);

    fireEvent.click(getByRole('link', { name: 'Leave' }));

    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('cancels same-window links when the user keeps editing', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { getByRole } = render(<GuardHarness when />);

    const allowed = fireEvent.click(getByRole('link', { name: 'Leave' }));

    expect(allowed).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Unsaved work');
    confirm.mockRestore();
  });

  it('marks browser unloads as requiring confirmation', () => {
    render(<GuardHarness when />);
    const event = new Event('beforeunload', { cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
