import {useId,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {useSingleFlightAction} from '@/hooks/useSingleFlightAction';
import {graphqlMutationRequest} from '@/services/graphqlClient';
export function DeliveryReconciliation({queueId,deliveryId,status,onResolved}:{queueId:string;deliveryId:string;status:string;onResolved:()=>void}) {
  const fieldId=useId();
  const [providerId,setProviderId]=useState('');
  const [error,setError]=useState('');
  const {pending,run}=useSingleFlightAction();
  if (!['invoices','signatures'].includes(queueId) || !['dead_letter','reconciliation_required'].includes(status)) return null;
  const verify=()=>run(async()=>{setError('');try{
    await graphqlMutationRequest<{reconcileEmailDelivery:boolean},{source:string;deliveryId:number;providerId:string}>(
      `mutation ReconcileEmailDelivery($source:String!,$deliveryId:Int!,$providerId:String!) { reconcileEmailDelivery(source:$source,deliveryId:$deliveryId,providerId:$providerId) }`,
      {source:queueId==='invoices'?'invoice':'signature',deliveryId:Number(deliveryId),providerId:providerId.trim()});
    onResolved();
  }catch{setError('Provider evidence could not be verified. Check the email ID and try again.');}});
  return <details className="mt-2 text-sm"><summary className="cursor-pointer">Review delivery</summary><div className="mt-2 space-y-2">
    <p className="text-muted-foreground">Verify an existing Resend email against this delivery. This action sends no email.</p>
    <Label htmlFor={fieldId}>Resend email ID</Label><Input id={fieldId} value={providerId} disabled={pending} onChange={e=>setProviderId(e.target.value)} />
    <Button size="sm" variant="outline" disabled={pending||!providerId.trim()} onClick={()=>void verify()}>{pending?'Verifying...':'Verify provider receipt'}</Button>
    {error && <p role="alert">{error}</p>}
  </div></details>;
}
