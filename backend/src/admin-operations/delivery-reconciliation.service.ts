import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { deliveryTag } from '../common/durable-email';
import { decryptDeliveryPayload } from '../common/delivery-payload-encryption';
import { itemizeGraphqlError } from '../common/graphql-error';

const DELIVERY_TABLES: Record<string, string> = {
  invoice: 'invoice_email_deliveries', signature: 'signature_delivery_outbox',
  estimate: 'estimate_email_deliveries', review_request: 'review_request_deliveries',
  workflow: 'workflow_side_effect_outbox', trial_reminder: 'trial_reminder_deliveries',
};

@Injectable()
export class DeliveryReconciliationService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
  async reconcile(actorId: number, source: string, deliveryId: number, providerId: string): Promise<boolean> {
    if (!Object.hasOwn(DELIVERY_TABLES, source) || !Number.isSafeInteger(deliveryId) || deliveryId<1
      || !/^[a-f0-9-]{36}$/i.test(providerId)) throw itemizeGraphqlError('Invalid delivery reference','BAD_USER_INPUT');
    const receipt = (await this.pool.query(`SELECT * FROM delivery_provider_receipts WHERE source=$1 AND delivery_id=$2`,[source,deliveryId])).rows[0];
    if (!receipt) throw itemizeGraphqlError('No verifiable provider receipt is available','NOT_FOUND');
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) throw itemizeGraphqlError('Email provider is unavailable','SERVICE_UNAVAILABLE');
    let email: {id?:string;tags?:Array<{name:string;value:string}>;to?:string[];subject?:string;last_event?:string};
    try {
      const response = await fetch(`https://api.resend.com/emails/${providerId}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10_000)});
      if (!response.ok) throw new Error('Provider lookup failed');
      email = await response.json();
    } catch { throw itemizeGraphqlError('Provider evidence could not be verified. Try again later.','SERVICE_UNAVAILABLE'); }
    const payload = receipt.request_body ? JSON.parse(decryptDeliveryPayload(receipt.request_body,receipt.idempotency_key)) : null;
    if (email.id !== providerId || !email.tags?.some(t=>t.name==='itemize_delivery' && t.value===deliveryTag(receipt.idempotency_key))
      || !payload || email.subject!==payload.subject || JSON.stringify(email.to)!==JSON.stringify(payload.to)
      || !['sent','delivered','delivery_delayed','bounced','complained','opened','clicked','failed','suppressed'].includes(email.last_event ?? '')) {
      throw itemizeGraphqlError('This provider email does not verify this delivery','CONFLICT');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = (await client.query(`SELECT * FROM delivery_provider_receipts WHERE source=$1 AND delivery_id=$2 FOR UPDATE`,[source,deliveryId])).rows[0];
      if (!locked || (locked.provider_id && locked.provider_id!==providerId)) throw itemizeGraphqlError('Delivery already has different provider evidence','CONFLICT');
      if (locked.organization_id !== receipt.organization_id || locked.idempotency_key !== receipt.idempotency_key
        || locked.request_body !== receipt.request_body) throw itemizeGraphqlError('Delivery evidence changed. Verify again.','CONFLICT');
      const table = DELIVERY_TABLES[source];
      const delivery = (await client.query(`SELECT * FROM ${table} WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[deliveryId,locked.organization_id])).rows[0];
      if (!delivery) throw itemizeGraphqlError('Delivery not found','NOT_FOUND');
      if ((source==='review_request' && delivery.channel!=='email') || (source==='workflow' && delivery.effect_type!=='email')) {
        throw itemizeGraphqlError('Only email deliveries can use Resend evidence','CONFLICT');
      }
      const leaseEnds = delivery.lease_expires_at ? new Date(delivery.lease_expires_at).getTime() : NaN;
      if (delivery.status==='processing' && (!Number.isFinite(leaseEnds) || leaseEnds>Date.now())) {
        throw itemizeGraphqlError('Delivery is still being processed. Wait before reviewing.','CONFLICT');
      }
      if (delivery.provider_id && delivery.provider_id!==providerId) throw itemizeGraphqlError('Delivery already has different provider evidence','CONFLICT');
      const owners = await client.query(`SELECT organization_id FROM invoice_email_deliveries WHERE provider_id=$1
        UNION SELECT organization_id FROM signature_delivery_outbox WHERE provider_id=$1
        UNION SELECT organization_id FROM estimate_email_deliveries WHERE provider_id=$1
        UNION SELECT organization_id FROM review_request_deliveries WHERE provider_id=$1 AND channel='email'
        UNION SELECT organization_id FROM workflow_side_effect_outbox WHERE provider_id=$1 AND effect_type='email'
        UNION SELECT organization_id FROM trial_reminder_deliveries WHERE provider_id=$1`, [providerId]);
      if (owners.rows.some(owner => owner.organization_id !== locked.organization_id)) {
        throw itemizeGraphqlError('Provider evidence has conflicting ownership','CONFLICT');
      }
      await client.query(`UPDATE delivery_provider_receipts SET provider_id=$3,review_required=false WHERE source=$1 AND delivery_id=$2`,[source,deliveryId,providerId]);
      if (!['invoice','signature'].includes(source)) {
        // Cache verified acceptance first. The owning worker completes its normal domain
        // transaction using that receipt, without another provider send or a reset deadline.
        if (['dead_letter','reconciliation_required','processing'].includes(delivery.status) && !delivery.cancelled_at) {
          const fields = source==='workflow'
            ? ",reconciliation_required_at=NULL,reconciliation_reason=NULL,last_reconciled_at=NOW(),last_reconciliation_action='accepted',last_reconciled_by=$4"
            : ',claimed_by=NULL,updated_at=CURRENT_TIMESTAMP';
          await client.query(`UPDATE ${table} SET status='retry',next_attempt_at=CURRENT_TIMESTAMP,
            lease_expires_at=NULL,last_error=NULL${fields} WHERE id=$1 AND organization_id=$2 AND provider_id IS NOT DISTINCT FROM $3`,
            source==='workflow' ? [deliveryId,locked.organization_id,delivery.provider_id,actorId] : [deliveryId,locked.organization_id,delivery.provider_id]);
        }
      } else if (delivery.status !== 'sent' && delivery.status !== 'cancelled' && !delivery.cancelled_at) {
        await client.query(`UPDATE ${table} SET status='sent',provider_id=$3,sent_at=COALESCE(sent_at,CURRENT_TIMESTAMP),lease_expires_at=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND organization_id=$2`,[deliveryId,locked.organization_id,providerId]);
        if (source==='invoice') {
          await client.query(`UPDATE invoices SET status=CASE WHEN status='draft' THEN 'sent' ELSE status END,
            sent_at=COALESCE(sent_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND organization_id=$2`,[delivery.invoice_id,locked.organization_id]);
        } else {
          if (delivery.reminder_id) await client.query(`UPDATE signature_reminders SET status='sent',sent_at=COALESCE(sent_at,CURRENT_TIMESTAMP) WHERE id=$1`,[delivery.reminder_id]);
          await client.query(`INSERT INTO signature_audit_log(document_id,recipient_id,event_type,description) VALUES ($1,$2,'delivery_reconciled','Provider acceptance verified by an administrator')`,[delivery.document_id,delivery.recipient_id]);
        }
      }
      await client.query(`INSERT INTO delivery_reconciliation_audit(organization_id,actor_id,source,delivery_id,provider_id)
        SELECT $1::integer,$2::integer,$3::varchar,$4::bigint,$5::text WHERE NOT EXISTS (SELECT 1 FROM delivery_reconciliation_audit WHERE source=$3::varchar AND delivery_id=$4::bigint AND provider_id=$5::text)`,
        [locked.organization_id,actorId,source,deliveryId,providerId]);
      await client.query('COMMIT');
      return true;
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
