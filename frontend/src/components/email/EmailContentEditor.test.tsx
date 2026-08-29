import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { EmailContentEditor, type EmailContentValue } from './EmailContentEditor';

vi.mock('@/components/email/RichTextEditor', () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <textarea aria-label="Message editor" value={value} onChange={event => onChange(event.target.value)} />,
}));

function Harness() {
  const [value, setValue] = useState<EmailContentValue>({ subject: '', preheader: '', bodyHtml: '<p></p>', bodyText: '' });
  return <TooltipProvider><EmailContentEditor header={<h2>Email content</h2>} value={value} onChange={setValue} /></TooltipProvider>;
}

describe('EmailContentEditor', () => {
  it('keeps recipient variables in one contextual insertion menu', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole('heading', { name: 'Email content' })).toBeInTheDocument();
    expect(screen.queryByText('Insert for this recipient')).not.toBeInTheDocument();
    expect(screen.queryByText('Click the subject, preview text, message, or fallback first to choose where a variable is inserted.')).not.toBeInTheDocument();

    const subject = screen.getByLabelText('Subject');
    fireEvent.focus(subject);
    await user.click(screen.getByRole('button', { name: 'Insert variable' }));
    await user.click(await screen.findByRole('menuitem', { name: /First name/ }));

    expect(subject).toHaveValue('{{first_name}}');
  });
});
