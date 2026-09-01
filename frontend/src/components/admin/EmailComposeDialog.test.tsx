import type { ComponentProps, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from '@/services/adminEmailApi';
import { EmailComposeDialog } from './EmailComposeDialog';

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock('@/services/adminEmailApi', () => ({ sendEmail: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/admin/EmailPreview', () => ({ EmailPreview: () => null }));
vi.mock('@/components/email/RichTextEditor', () => ({
  RichTextEditor: ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <textarea
      aria-label="Message"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock('@/components/email/EmailStudioDialog', () => ({
  EmailStudioDialog: ({
    title,
    editor,
    headerActions,
    footer,
    publishing,
    onOpenChange,
  }: {
    title: string;
    editor: ReactNode;
    headerActions?: ReactNode;
    footer?: ReactNode;
    publishing?: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div>
      <h1>{title}</h1>
      <output aria-label="Studio busy">{publishing ? 'busy' : 'idle'}</output>
      <button type="button" onClick={() => onOpenChange(false)}>Request studio close</button>
      {headerActions}
      {editor}
      {footer}
    </div>
  ),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
};

const fillMessage = (subject = 'Service notice') => {
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: subject } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: '<p>Hello</p>' } });
};

const renderComposer = (overrides: Partial<ComponentProps<typeof EmailComposeDialog>> = {}) => {
  const props: ComponentProps<typeof EmailComposeDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    recipients: [{ id: 4, email: 'Person@Example.Test', name: ' Person ' }],
    onSent: vi.fn(),
    onBrowseTemplates: vi.fn(),
    ...overrides,
  };
  render(<EmailComposeDialog {...props} />);
  return props;
};

describe('EmailComposeDialog delivery lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let sequence = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `admin-email-request-${++sequence}` });
  });

  it('coalesces duplicate send events and blocks every close path while unresolved', async () => {
    const request = deferred<{
      sent: number;
      failed: number;
      errors: string[];
      queued: number;
    }>();
    vi.mocked(sendEmail).mockReturnValue(request.promise);
    const props = renderComposer();
    fillMessage();

    const send = screen.getByRole('button', { name: /Send to 1/ });
    fireEvent.click(send);
    fireEvent.click(send);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(send).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Studio busy')).toHaveTextContent('busy');
    fireEvent.click(screen.getByRole('button', { name: 'Request studio close' }));
    fireEvent.click(screen.getByRole('button', { name: /Browse templates/ }));
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(props.onBrowseTemplates).not.toHaveBeenCalled();

    request.resolve({ sent: 0, failed: 0, errors: [], queued: 1 });
    await waitFor(() => expect(props.onSent).toHaveBeenCalledTimes(1));
  });

  it('reuses the key for an unchanged retry and rotates it when authored content changes', async () => {
    vi.mocked(sendEmail)
      .mockRejectedValueOnce(new Error('Connection interrupted'))
      .mockRejectedValueOnce(new Error('Connection interrupted again'))
      .mockRejectedValueOnce(new Error('Provider unavailable'));
    renderComposer();
    fillMessage();

    const send = screen.getByRole('button', { name: /Send to 1/ });
    fireEvent.click(send);
    await waitFor(() => expect(send).not.toBeDisabled());
    fireEvent.click(send);
    await waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Updated service notice' } });
    fireEvent.click(send);
    await waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(3));

    expect(vi.mocked(sendEmail).mock.calls.map(([request]) => request.idempotencyKey))
      .toEqual(['admin-email-request-1', 'admin-email-request-1', 'admin-email-request-2']);
  });

  it('reports a replayed batch as an already-confirmed request', async () => {
    vi.mocked(sendEmail).mockResolvedValue({
      sent: 0,
      failed: 0,
      errors: [],
      queued: 1,
      batchId: 12,
      status: 'queued',
      replayed: true,
    });
    const props = renderComposer();
    fillMessage();
    fireEvent.click(screen.getByRole('button', { name: /Send to 1/ }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Email already queued',
      description: 'Recovered the existing request for 1 recipient.',
    })));
    expect(props.onSent).toHaveBeenCalledTimes(1);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not turn a confirmed queue result into a send failure when follow-up UI work fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(sendEmail).mockResolvedValue({
      sent: 0,
      failed: 0,
      errors: [],
      queued: 1,
    });
    renderComposer({ onSent: vi.fn(() => { throw new Error('Refresh failed'); }) });
    fillMessage();
    fireEvent.click(screen.getByRole('button', { name: /Send to 1/ }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Email queued',
    })));
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({
      title: 'Unable to send email',
    }));
    expect(consoleError).toHaveBeenCalledWith(
      'Admin email queued, but follow-up UI work failed:',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
