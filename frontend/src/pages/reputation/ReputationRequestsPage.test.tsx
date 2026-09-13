import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReputationRequestsPage } from './ReputationRequestsPage';

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
  useQuery: () => ({ isPending:false, data:{requests:[
    {id:1,contact_name:'Delivered QA',channel:'email',status:'sent',email_delivery_status:'delivered',created_at:'2026-09-13T00:00:00Z'},
    {id:2,contact_name:'Response QA',channel:'email',status:'clicked',email_delivery_status:'bounced',created_at:'2026-09-13T00:00:00Z'},
    {id:3,contact_name:'Unknown QA',channel:'email',status:'sent',email_delivery_status:null,created_at:'2026-09-13T00:00:00Z'},
  ]} }),
}));
vi.mock('react-router-dom', () => ({useSearchParams:()=>[new URLSearchParams(),vi.fn()]}));
vi.mock('@/hooks/useOrganization', () => ({useOrganization:()=>({organizationId:14,isLoading:false})}));
vi.mock('@/hooks/useOnboardingTrigger', () => ({useRouteOnboarding:()=>({showModal:false})}));
vi.mock('@/hooks/use-toast', () => ({useToast:()=>({toast:vi.fn()})}));
vi.mock('@/components/layout/PageLayout', () => ({PageLayout:({children}:{children:ReactNode})=><main>{children}</main>}));

describe('review request delivery outcomes', () => {
  it('shows provider evidence alongside response status and does not invent delivery for unknown outcomes', () => {
    render(<ReputationRequestsPage />);
    const delivered=within(screen.getByText('Delivered QA').closest('article')!);
    expect(delivered.getByText('Sent')).toBeInTheDocument();
    expect(delivered.getByText('Email delivered')).toBeInTheDocument();
    const response=within(screen.getByText('Response QA').closest('article')!);
    expect(response.getByText('Clicked')).toBeInTheDocument();
    expect(response.getByText('Email bounced')).toBeInTheDocument();
    expect(within(screen.getByText('Unknown QA').closest('article')!).queryByText('Email delivered')).not.toBeInTheDocument();
  });
});
