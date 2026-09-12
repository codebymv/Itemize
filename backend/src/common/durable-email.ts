import { encryptDeliveryPayload, decryptDeliveryPayload } from './delivery-payload-encryption';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
export type DeliveryIdentity = { organizationId: number; source: 'invoice' | 'signature'; deliveryId: number };
export const deliveryTag = (key: string) => createHash('sha256').update(key).digest('hex');
export class DurableEmailError extends Error {
  constructor(message: string, public readonly retryable: boolean, public readonly providerOutcomeUnknown: boolean) { super(message); }
}
/** Persist the complete wire payload, including attachment bytes, before any external effect. */
export async function sendDurableEmail(pool: Pool, identity: DeliveryIdentity, key: string,
  payload: Record<string, unknown>, apiKey: string): Promise<{providerId: string}> {
  const tags = [...(Array.isArray(payload.tags) ? payload.tags : []), {name:'itemize_delivery',value:deliveryTag(key)}];
  const requestBody = JSON.stringify({...payload,tags});
  await pool.query(`INSERT INTO delivery_provider_receipts
    (organization_id,source,delivery_id,idempotency_key,request_body)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (source,delivery_id) DO NOTHING`,
    [identity.organizationId,identity.source,identity.deliveryId,key,encryptDeliveryPayload(requestBody,key)]);
  const result = await pool.query<{request_body:string;provider_id:string|null;review_required:boolean;within_window:boolean;idempotency_key:string}>(
    `SELECT *, first_attempt_at > CURRENT_TIMESTAMP - INTERVAL '23 hours' AS within_window
     FROM delivery_provider_receipts WHERE source=$1 AND delivery_id=$2 AND organization_id=$3`,
    [identity.source,identity.deliveryId,identity.organizationId]);
  const receipt = result.rows[0];
  if (!receipt || receipt.idempotency_key !== key) throw new DurableEmailError('Delivery identity conflict',false,true);
  if (receipt.provider_id) return {providerId:receipt.provider_id};
  if (receipt.review_required || !receipt.within_window || !receipt.request_body) {
    throw new DurableEmailError('Delivery needs review before another email can be sent',false,true);
  }
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':key},
      body:decryptDeliveryPayload(receipt.request_body,key),signal:AbortSignal.timeout(10_000)});
  } catch { throw new DurableEmailError('Email acceptance could not be verified',true,true); }
  const body = await response.json().catch(()=>({})) as {id?:string};
  if (!response.ok) {
    const uncertain = response.status >= 500 || response.status === 409;
    throw new DurableEmailError(uncertain ? 'Email acceptance could not be verified' : 'Email provider rejected the request',
      uncertain || response.status === 429, uncertain);
  }
  if (!body.id) throw new DurableEmailError('Email provider returned no receipt',true,true);
  await pool.query(`UPDATE delivery_provider_receipts SET provider_id=$4
    WHERE source=$1 AND delivery_id=$2 AND organization_id=$3 AND (provider_id IS NULL OR provider_id=$4)`,
    [identity.source,identity.deliveryId,identity.organizationId,body.id]);
  return {providerId:body.id};
}
