import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {useSingleFlightAction} from '@/hooks/useSingleFlightAction';
import {getInvoiceDeliveryStatus,invoiceDeliveryMessage,retryInvoiceDelivery} from '@/services/invoicesGraphql';
const providerMessages: Record<string,string> = {
  delivered: 'Email delivered.', opened: 'Email delivered and opened.', clicked: 'Email link clicked.',
  bounced: 'Email bounced. Check the recipient address before sending another email.',
  unsubscribed: 'Recipient reported this email as spam.', failed: 'Email delivery failed.',
  suppressed: 'Email was suppressed by the delivery provider.', delivery_delayed: 'Email delivery is delayed.',
};
export function InvoiceDeliveryStatus({invoiceId,organizationId,onBlocked,sending=false}:{invoiceId:number;organizationId:number;onBlocked:(value:boolean)=>void;sending?:boolean}) {
  const {pending,run}=useSingleFlightAction();
  const [error,setError]=useState('');
  const query=useQuery({queryKey:['invoice-delivery',organizationId,invoiceId],queryFn:()=>getInvoiceDeliveryStatus(invoiceId,organizationId),
    retry:false,refetchInterval:q=>['QUEUED','PROCESSING','RETRY'].includes(q.state.data?.status??'')?3000:false});
  const receipt=query.data;
  const {refetch}=query;
  useEffect(()=>{if(!sending) void refetch();},[sending,refetch]);
  const blocked=query.isFetching || query.isPending || query.isError || Boolean(receipt && receipt.status!=='SENT');
  useEffect(()=>onBlocked(blocked),[blocked,onBlocked]);
  const retry=()=>run(async()=>{setError('');try{await retryInvoiceDelivery(receipt!.deliveryId,organizationId);await query.refetch();}catch{setError('Could not retry this delivery. Refresh its status before trying again.');}});
  return <div className="space-y-2 rounded-md border border-border bg-muted p-3 text-sm" aria-live="polite">
    <p>{query.isPending?'Checking email delivery...':query.isError?'Email delivery status is unavailable. Refresh before sending.':receipt?(providerMessages[receipt.providerStatus ?? ""] ?? invoiceDeliveryMessage(receipt.status)):'No previous email delivery.'}</p>
    {receipt && <p className="text-xs text-muted-foreground">Delivery #{receipt.deliveryId}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" disabled={query.isFetching||pending} onClick={()=>void query.refetch()}>Refresh status</Button>
      {receipt?.canRetry && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={()=>void retry()}>{pending?'Queuing retry...':'Retry original email'}</Button>}
    </div>
    {receipt && ['DEAD_LETTER','RECONCILIATION_REQUIRED'].includes(receipt.status) && !receipt.canRetry && <p className="text-muted-foreground">Contact support with this delivery number. Sending is paused while the outcome is reviewed.</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
