import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ChatWidgetPreview, type ChatWidgetPreviewConfig } from './ChatWidgetPreview';

const config: ChatWidgetPreviewConfig = {
  name: 'Support',
  welcome_title: 'Welcome!',
  welcome_message: 'How can we help?',
  offline_message: 'Leave us a message.',
  placeholder_text: 'Ask a question...',
  primary_color: '#2563EB',
  text_color: '#FFFFFF',
  position: 'bottom-right',
  show_branding: true,
  require_email: true,
  require_name: true,
  require_phone: false,
};

describe('ChatWidgetPreview', () => {
  it('renders the configured visitor experience', () => {
    render(<ChatWidgetPreview config={config} />);

    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Welcome!')).toBeInTheDocument();
    expect(screen.getByText('How can we help?')).toBeInTheDocument();
    expect(screen.getByText('Your name')).toBeInTheDocument();
    expect(screen.getByText('Your email')).toBeInTheDocument();
    expect(screen.queryByText('Your phone')).not.toBeInTheDocument();
    expect(screen.getByText('Powered by')).toBeInTheDocument();
  });

  it('previews the offline message without changing saved configuration', async () => {
    const user = userEvent.setup();
    render(<ChatWidgetPreview config={config} />);

    await act(async () => {
      await user.click(screen.getByRole('tab', { name: 'Offline' }));
    });

    expect(screen.getByRole('tab', { name: 'Offline' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Leave us a message.')).toBeInTheDocument();
    expect(screen.getAllByText('Offline')).toHaveLength(2);
  });
});
