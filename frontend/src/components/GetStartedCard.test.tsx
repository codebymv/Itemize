import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { GetStartedCard } from './GetStartedCard'

vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => ({ organizationId: 7 }) }))
vi.mock('@/services/getStartedGraphql', () => ({
  getStartedProgressQueryKey: (organizationId: number) => ['get-started-progress', organizationId],
  getStartedProgressViaGraphql: vi.fn().mockResolvedValue({
    dismissed: false,
    completedCount: 1,
    totalCount: 3,
    steps: [
      { id: 'first_contact', completed: true, completedAt: null, href: '/contacts' },
      { id: 'first_artifact', completed: false, completedAt: null, href: '/estimates/new' },
      { id: 'first_send', completed: false, completedAt: null, href: '/estimates' },
    ],
  }),
  dismissGetStartedViaGraphql: vi.fn(),
}))

describe('GetStartedCard', () => {
  it('keeps the business journey concise without the former subtitle', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <GetStartedCard />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Get your first client approval')).toBeInTheDocument()
    expect(screen.queryByText('Follow one simple path from client to sent estimate.')).not.toBeInTheDocument()
    expect(screen.getByText('1/3 complete')).toBeInTheDocument()
    expect(screen.getByText('Give your first estimate a real recipient').parentElement).toHaveClass(
      'min-[1100px]:flex',
      'min-[1100px]:justify-between',
    )
    expect(screen.getByText('Give your first estimate a real recipient')).toHaveClass(
      'min-[1100px]:text-right',
    )
  })
})
