import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MarketingChatLauncher from './MarketingChatLauncher';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: apiMock,
}));

describe('MarketingChatLauncher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_MARKETING_CHAT_ENABLED', 'true');
    apiMock.get.mockResolvedValue({ data: { token: 'ask-token' } });
    apiMock.post.mockResolvedValue({ data: { reply: 'Itemize helps organize CRM, workflows, bookings, and workspace notes.' } });
  });

  it('does not render when VITE_MARKETING_CHAT_ENABLED is false', () => {
    vi.stubEnv('VITE_MARKETING_CHAT_ENABLED', 'false');

    render(<MarketingChatLauncher />);

    expect(screen.queryByRole('button', { name: /ask about itemize/i })).not.toBeInTheDocument();
  });

  it('renders without a widget key', () => {
    vi.stubEnv('VITE_MARKETING_CHAT_WIDGET_KEY', '');

    render(<MarketingChatLauncher />);

    expect(screen.getByRole('button', { name: /ask about itemize/i })).toBeInTheDocument();
  });

  it('opens and closes with click and Escape', async () => {
    const user = userEvent.setup();
    render(<MarketingChatLauncher />);

    await user.click(screen.getByRole('button', { name: /ask about itemize/i }));
    expect(screen.getByRole('dialog', { name: /ask about itemize/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /ask about itemize/i })).not.toBeInTheDocument();
  });

  it('fetches a token when opened', async () => {
    const user = userEvent.setup();
    render(<MarketingChatLauncher />);

    await user.click(screen.getByRole('button', { name: /ask about itemize/i }));

    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith('/api/marketing-chat/token');
    });
  });

  it('sends message history to the marketing ask endpoint', async () => {
    const user = userEvent.setup();
    render(<MarketingChatLauncher />);

    await user.click(screen.getByRole('button', { name: /ask about itemize/i }));
    await user.type(screen.getByPlaceholderText(/ask about itemize/i), 'Can I book a demo?');
    await user.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/api/marketing-chat/ask',
        { messages: [{ role: 'user', content: 'Can I book a demo?' }] },
        { headers: { 'X-Ask-Token': 'ask-token' } },
      );
    });
    expect(await screen.findByText(/itemize helps organize crm/i)).toBeInTheDocument();
  });

  it('suggested questions send immediately', async () => {
    const user = userEvent.setup();
    render(<MarketingChatLauncher />);

    await user.click(screen.getByRole('button', { name: /ask about itemize/i }));
    await user.click(screen.getByRole('button', { name: /what does itemize cost/i }));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/api/marketing-chat/ask',
        { messages: [{ role: 'user', content: 'What does Itemize cost?' }] },
        { headers: { 'X-Ask-Token': 'ask-token' } },
      );
    });
  });

  it('shows a fallback reply when the API fails', async () => {
    const user = userEvent.setup();
    apiMock.post.mockRejectedValue(new Error('offline'));
    render(<MarketingChatLauncher />);

    await user.click(screen.getByRole('button', { name: /ask about itemize/i }));
    await user.type(screen.getByPlaceholderText(/ask about itemize/i), 'Pricing');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(await screen.findByText(/couldn't reach the assistant/i)).toBeInTheDocument();
  });

  it('opens from the Talk to Sales browser event and applies the prompt', async () => {
    render(<MarketingChatLauncher />);

    window.dispatchEvent(new CustomEvent('itemize:open-marketing-chat', {
      detail: { prompt: 'Talk to Sales' },
    }));

    expect(await screen.findByRole('dialog', { name: /ask about itemize/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ask about itemize/i)).toHaveValue('Talk to Sales');
  });
});
