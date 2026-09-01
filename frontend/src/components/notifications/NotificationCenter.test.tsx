import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NotificationCenter } from './NotificationCenter'

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => ({ organizationId: 7 }) }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/lib/api', () => ({ getApiUrl: () => 'http://localhost' }))
const realtime = vi.hoisted(() => ({
  disconnect: vi.fn(),
  emit: vi.fn(),
  io: vi.fn(),
  on: vi.fn(),
}))

vi.mock('socket.io-client', () => ({ io: realtime.io }))
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
  beforeEach(() => {
    vi.clearAllMocks()
    realtime.io.mockReturnValue({
      on: realtime.on,
      emit: realtime.emit,
      disconnect: realtime.disconnect,
    })
  })

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

  it('loads authenticated realtime notifications and disconnects on unmount', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const view = render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MemoryRouter>
            <NotificationCenter />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(realtime.io).toHaveBeenCalledWith(
      'http://localhost',
      { transports: ['websocket', 'polling'], withCredentials: true },
    ))
    expect(realtime.on).toHaveBeenCalledWith('connect', expect.any(Function))
    expect(realtime.on).toHaveBeenCalledWith('notificationCreated', expect.any(Function))

    const disconnectsBeforeUnmount = realtime.disconnect.mock.calls.length
    view.unmount()
    expect(realtime.disconnect).toHaveBeenCalledTimes(disconnectsBeforeUnmount + 1)
  })
})
