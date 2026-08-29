import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NotificationCenter } from './NotificationCenter'

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => ({ organizationId: 7 }) }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/lib/api', () => ({ getApiUrl: () => 'http://localhost' }))
vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}))
vi.mock('@/services/notificationsGraphql', () => ({
  getNotifications: vi.fn().mockResolvedValue({
    nodes: [],
    pageInfo: { endCursor: null, hasNextPage: false },
    unreadCount: 1,
    unseenCount: 0,
  }),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
  markNotificationsSeen: vi.fn(),
}))

describe('NotificationCenter', () => {
  it('keeps focus on the bell when opening instead of triggering the first action tooltip', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MemoryRouter>
            <NotificationCenter />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    )

    const trigger = screen.getByRole('button', { name: 'Notifications' })
    trigger.focus()
    fireEvent.click(trigger)

    expect(await screen.findByText('NOTIFICATIONS')).toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
