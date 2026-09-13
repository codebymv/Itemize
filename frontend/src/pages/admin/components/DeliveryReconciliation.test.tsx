import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlMutationRequest } from '@/services/graphqlClient';
import { DeliveryReconciliation } from './DeliveryReconciliation';

vi.mock('@/services/graphqlClient', () => ({ graphqlMutationRequest: vi.fn() }));

describe('DeliveryReconciliation', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([
    ['estimates','estimate',null], ['review-requests','review_request','email'],
    ['workflows','workflow','email'], ['trial-reminders','trial_reminder',null],
  ])('verifies the correct source for %s', async (queueId, source, kind) => {
    vi.mocked(graphqlMutationRequest).mockResolvedValue({reconcileEmailDelivery:true});
    const onResolved = vi.fn();
    render(<DeliveryReconciliation queueId={queueId!} kind={kind} deliveryId="7" status="dead_letter" onResolved={onResolved} />);
    fireEvent.click(screen.getByText('Review delivery'));
    fireEvent.change(screen.getByLabelText('Resend email ID'), {target:{value:' receipt-id '}});
    fireEvent.click(screen.getByRole('button', {name:'Verify provider receipt'}));
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(graphqlMutationRequest).toHaveBeenCalledWith(expect.any(String), {source,deliveryId:7,providerId:'receipt-id'});
  });
  it.each([['workflows','sms','dead_letter'],['workflows','webhook','dead_letter'],
    ['review-requests','sms','reconciliation_required'],['estimates',null,'sent']])('hides recovery for %s %s %s', (queueId,kind,status) => {
    const {container} = render(<DeliveryReconciliation queueId={queueId!} kind={kind} deliveryId="7" status={status!} onResolved={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('keeps a rejected verification visible without marking the job resolved', async () => {
    vi.mocked(graphqlMutationRequest).mockRejectedValue(new Error('conflict'));
    const onResolved=vi.fn();
    render(<DeliveryReconciliation queueId="estimates" deliveryId="7" status="dead_letter" onResolved={onResolved} />);
    fireEvent.click(screen.getByText('Review delivery'));
    fireEvent.change(screen.getByLabelText('Resend email ID'), {target:{value:'wrong'}});
    fireEvent.click(screen.getByRole('button', {name:'Verify provider receipt'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be verified');
    expect(onResolved).not.toHaveBeenCalled();
  });
});
