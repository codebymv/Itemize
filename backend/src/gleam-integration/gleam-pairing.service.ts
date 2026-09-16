import { gleamOrganizationAllowed } from './gleam-rollout';
import { Inject, Injectable } from '@nestjs/common';
import { createHash, createPublicKey, randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { PG_POOL } from '../database/database.module';
import { itemizeGraphqlError } from '../common/graphql-error';
import { encryptDeliveryPayload, decryptDeliveryPayload } from '../common/delivery-payload-encryption';
import { parseCalendarTokenKeyring } from '../calendar-oauth/calendar-token-encryption';
import { hasPlanEntitlement, PaidEntitlementState } from '../billing/billing-entitlement';
import { pairingClaimSchema, pairingCodeSchema, pairingPeerRequest, pairingProofSchema } from '../integrations/client-work-pairing.contract';
import { GleamPrincipal } from './gleam-integration.guard';
import { gleamKeyFingerprint } from './gleam-fingerprint';
import { gleamError } from './gleam-errors';

type Pairing = {id: string; organization_id: number; actor_id: number; code_hash: string; default_assignee_id: number;
  due_after_minutes: number; state: string; connection_id: string | null; source_name: string | null; encrypted_proof: string | null; expires_at: Date};
function fail(message: string): never { throw itemizeGraphqlError(message, 'CONFLICT'); }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const requestSchema = z.object({code: pairingCodeSchema, defaultAssigneeId: z.number().int().positive(), dueAfterMinutes: z.number().int().min(1).max(43200)}).strict();

@Injectable()
export class GleamPairingService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
  private enabled(org?: number) { if (process.env.GLEAM_PAIRING_ENABLED !== 'true' || (org !== undefined && !gleamOrganizationAllowed(org))) fail('Gleam pairing is not enabled.'); }
  private async transaction<T>(fn: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  private async manager(client: PoolClient, org: number, actor: number, paid = true) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`gleam-pairing:${org}`]);
    const organization = (await client.query<PaidEntitlementState & {name: string}>('SELECT * FROM organizations WHERE id=$1 FOR SHARE', [org])).rows[0];
    const member = (await client.query("SELECT role FROM organization_members WHERE organization_id=$1 AND user_id=$2 AND joined_at IS NOT NULL FOR SHARE", [org,actor])).rows[0];
    if (!organization || !member || !['owner','admin'].includes(member.role)) throw itemizeGraphqlError('Organization administrator access required.', 'FORBIDDEN');
    if (paid && !hasPlanEntitlement(organization, 'starter')) throw itemizeGraphqlError('An active Itemize subscription is required.', 'FORBIDDEN');
    return organization;
  }
  private async assignee(client: PoolClient, org: number, user: number) {
    if (!(await client.query("SELECT user_id FROM organization_members WHERE organization_id=$1 AND user_id=$2 AND joined_at IS NOT NULL AND role IN ('owner','admin','member') FOR SHARE", [org,user])).rowCount) fail('Select an eligible task assignee.');
  }
  private async replay<T>(client: PoolClient, org: number, actor: number, key: string, operation: string, apply: () => Promise<T>): Promise<T> {
    const previous = (await client.query('SELECT fingerprint,result FROM gleam_pairing_mutation_receipts WHERE organization_id=$1 AND actor_id=$2 AND idempotency_key=$3', [org,actor,key])).rows[0];
    // Every caller already holds this organization's pairing lock, including concurrent replays.
    if (previous) {
      if (previous.fingerprint !== hash(operation)) fail('Idempotency key belongs to a different change.');
      return previous.result;
    }
    const result = await apply();
    await client.query('INSERT INTO gleam_pairing_mutation_receipts(organization_id,actor_id,idempotency_key,fingerprint,result) VALUES($1,$2,$3,$4,$5::jsonb)', [org,actor,key,hash(operation),JSON.stringify(result)]);
    return result;
  }
  private async proof(connectionId: string, proof: string) {
    const nonce = randomUUID();
    const result = pairingProofSchema.parse(await pairingPeerRequest(process.env.GLEAM_API_ORIGIN || '',
      `/api/itemize/pairing/${connectionId}/proof`, proof, {nonce}));
    if (result.connectionId !== connectionId || result.nonce !== nonce || Date.parse(result.expiresAt) <= Date.now()) fail('Gleam approval has expired.');
    const key = createPublicKey(result.publicKey);
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength || 0) < 2048) fail('Invalid Gleam connection key.');
    return result;
  }
  async start(org: number, actor: number, input: unknown, idempotencyKey: string) {
    this.enabled(org); const value = requestSchema.parse(input); z.string().uuid().parse(idempotencyKey);
    // Pairing capabilities must never use the development JWT-derived encryption fallback.
    parseCalendarTokenKeyring(process.env, {allowDevelopmentFallback: false});
    return this.transaction(async client => {
      await this.manager(client, org, actor); await this.assignee(client, org, value.defaultAssigneeId);
      const previous = (await client.query<Pairing>('SELECT * FROM gleam_pairing_requests WHERE id=$1', [idempotencyKey])).rows[0];
      if (previous) {
        if (previous.organization_id !== org || previous.actor_id !== actor || previous.code_hash !== hash(value.code)
          || previous.default_assignee_id !== value.defaultAssigneeId || previous.due_after_minutes !== value.dueAfterMinutes) fail('Pairing request changed.');
        return this.view(client, org);
      }
      if ((await client.query("SELECT id FROM gleam_connections WHERE organization_id=$1 AND state='active'", [org])).rowCount) fail('Disconnect the active Gleam connection first.');
      await client.query("UPDATE gleam_pairing_requests SET state='cancelled',encrypted_proof=NULL WHERE organization_id=$1 AND state IN ('unused','claimed')", [org]);
      await client.query("UPDATE gleam_connections SET state='revoked' WHERE organization_id=$1 AND state='pending'", [org]);
      await client.query(`INSERT INTO gleam_pairing_requests(id,organization_id,actor_id,code_hash,default_assignee_id,due_after_minutes,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,NOW()+INTERVAL '10 minutes')`, [idempotencyKey,org,actor,hash(value.code),value.defaultAssigneeId,value.dueAfterMinutes]);
      await client.query("INSERT INTO gleam_connection_audit(organization_id,actor_id,action) VALUES($1,$2,'PAIRING_STARTED')", [org,actor]);
      return this.view(client, org);
    });
  }
  async claim(code: string, input: unknown) {
    this.enabled(); pairingCodeSchema.parse(code); const value = pairingClaimSchema.parse(input);
    const pairing = (await this.pool.query<Pairing>('SELECT * FROM gleam_pairing_requests WHERE code_hash=$1', [hash(code)])).rows[0];
    if (!pairing || pairing.expires_at <= new Date() || pairing.state === 'cancelled') gleamError(401,'INVALID_PAIRING_CODE');
    this.enabled(pairing.organization_id);
    const proof = await this.proof(value.connectionId, value.proof);
    if (proof.pairingCodeHash !== pairing.code_hash) gleamError(401,'PAIRING_CODE_MISMATCH');
    parseCalendarTokenKeyring(process.env, {allowDevelopmentFallback: false});
    return this.transaction(async client => {
      await this.manager(client, pairing.organization_id, pairing.actor_id); await this.assignee(client, pairing.organization_id, pairing.default_assignee_id);
      const current = (await client.query<Pairing>('SELECT * FROM gleam_pairing_requests WHERE id=$1 FOR UPDATE', [pairing.id])).rows[0];
      if (current.expires_at <= new Date() || current.state === 'cancelled') gleamError(401,'INVALID_PAIRING_CODE');
      if (current.connection_id) {
        if (current.connection_id !== value.connectionId) gleamError(409,'PAIRING_ALREADY_CLAIMED');
        const existing = (await client.query('SELECT * FROM gleam_connections WHERE id=$1', [value.connectionId])).rows[0];
        if (!existing || existing.source_organization_id !== proof.sourceOrganizationId || existing.key_id !== proof.keyId
          || gleamKeyFingerprint(existing.public_key) !== gleamKeyFingerprint(proof.publicKey) || existing.state === 'revoked') gleamError(409,'PAIRING_ALREADY_CLAIMED');
      } else {
        await client.query(`INSERT INTO gleam_connections(id,organization_id,source_organization_id,key_id,public_key,source_approved_at,target_approved_by,default_assignee_id,due_after_minutes)
          VALUES($1,$2,$3,$4,$5,NOW(),$6,$7,$8)`, [value.connectionId,pairing.organization_id,proof.sourceOrganizationId,proof.keyId,proof.publicKey,pairing.actor_id,pairing.default_assignee_id,pairing.due_after_minutes]);
        await client.query("UPDATE gleam_pairing_requests SET state='claimed',connection_id=$2,source_name=$3,encrypted_proof=$4 WHERE id=$1",
          [pairing.id,value.connectionId,proof.sourceOrganizationName,encryptDeliveryPayload(value.proof, `gleam-pairing:${pairing.organization_id}:${pairing.id}`)]);
        await client.query("INSERT INTO gleam_connection_audit(organization_id,connection_id,action) VALUES($1,$2,'SOURCE_VERIFIED')", [pairing.organization_id,value.connectionId]);
      }
      return this.connectionView(client, value.connectionId);
    });
  }
  async approve(org: number, actor: number, id: string, idempotencyKey: string) {
    this.enabled(org); z.string().uuid().parse(id); z.string().uuid().parse(idempotencyKey);
    const pairing = await this.transaction(async client => {
      await this.manager(client, org, actor);
      const row = (await client.query<Pairing>('SELECT * FROM gleam_pairing_requests WHERE id=$1 AND organization_id=$2', [id,org])).rows[0];
      if (!row || !['claimed','approved'].includes(row.state)) fail('Refresh the pending connection before approving.');
      return row;
    });
    if (pairing.state === 'approved') return this.transaction(async client => {
      await this.manager(client, org, actor);
      return this.replay(client, org, actor, idempotencyKey, `approve:${id}`, () => this.view(client, org));
    });
    if (!pairing.connection_id || !pairing.encrypted_proof || pairing.expires_at <= new Date()) fail('Pairing expired. Start again.');
    const verified = await this.proof(pairing.connection_id, decryptDeliveryPayload(pairing.encrypted_proof, `gleam-pairing:${org}:${id}`));
    if (verified.pairingCodeHash !== pairing.code_hash) fail('Gleam approval belongs to a different pairing code.');
    return this.transaction(async client => {
      await this.manager(client, org, actor); await this.assignee(client, org, pairing.default_assignee_id);
      return this.replay(client, org, actor, idempotencyKey, `approve:${id}`, async () => {
      const row = (await client.query<Pairing>('SELECT * FROM gleam_pairing_requests WHERE id=$1 AND organization_id=$2 FOR UPDATE', [id,org])).rows[0];
      if (row.state === 'approved') return this.view(client, org);
      if (row.state !== 'claimed' || row.expires_at <= new Date()) fail('Pairing changed or expired.');
      const connection = (await client.query('SELECT * FROM gleam_connections WHERE id=$1 FOR UPDATE', [pairing.connection_id])).rows[0];
      if (!connection || connection.state !== 'pending' || connection.source_organization_id !== verified.sourceOrganizationId
        || connection.key_id !== verified.keyId || gleamKeyFingerprint(connection.public_key) !== gleamKeyFingerprint(verified.publicKey)) fail('Gleam connection identity changed.');
      await client.query("UPDATE gleam_connections SET state='active',target_approved_at=NOW(),target_approved_by=$2 WHERE id=$1", [connection.id,actor]);
      await client.query("UPDATE gleam_pairing_requests SET state='approved',encrypted_proof=NULL WHERE id=$1", [id]);
      await client.query("INSERT INTO gleam_connection_audit(organization_id,connection_id,actor_id,action) VALUES($1,$2,$3,'CONNECTION_APPROVED')", [org,connection.id,actor]);
      return this.view(client, org);
      });
    });
  }
  async disconnect(org: number, actor: number, id: string, idempotencyKey: string) {
    z.string().uuid().parse(id); z.string().uuid().parse(idempotencyKey);
    return this.transaction(async client => {
      await this.manager(client, org, actor, false);
      return this.replay(client, org, actor, idempotencyKey, `disconnect:${id}`, async () => {
      const changed = await client.query("UPDATE gleam_connections SET state='revoked' WHERE id=$1 AND organization_id=$2 AND state<>'revoked' RETURNING id", [id,org]);
      await client.query("UPDATE gleam_pairing_requests SET state='cancelled',encrypted_proof=NULL WHERE connection_id=$1 AND organization_id=$2", [id,org]);
      if (changed.rowCount) await client.query("INSERT INTO gleam_connection_audit(organization_id,connection_id,actor_id,action) VALUES($1,$2,$3,'CONNECTION_REVOKED')", [org,id,actor]);
      return this.view(client, org);
      });
    });
  }
  async status(org: number, actor: number) {
    return this.transaction(async client => { await this.manager(client, org, actor, false); return this.view(client, org); });
  }
  private async view(client: PoolClient, org: number) {
    const pairing = (await client.query("SELECT id,state,source_name,expires_at,connection_id,default_assignee_id,due_after_minutes FROM gleam_pairing_requests WHERE organization_id=$1 AND state<>'cancelled' ORDER BY created_at DESC LIMIT 1", [org])).rows[0];
    const organization = (await client.query('SELECT name FROM organizations WHERE id=$1', [org])).rows[0];
    const assignees = (await client.query("SELECT u.id,COALESCE(u.name,u.email) AS name FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.joined_at IS NOT NULL AND m.role IN ('owner','admin','member') ORDER BY u.id", [org])).rows;
    return {enabled: process.env.GLEAM_PAIRING_ENABLED === 'true' && gleamOrganizationAllowed(org), organizationId: org, organizationName: organization.name,
      pairing: pairing ? {...pairing, expires_at: new Date(pairing.expires_at).toISOString()} : null, assignees};
  }
  private async connectionView(client: PoolClient, id: string) {
    const row = (await client.query('SELECT c.*,o.name AS target_name FROM gleam_connections c JOIN organizations o ON o.id=c.organization_id WHERE c.id=$1', [id])).rows[0];
    return {schemaVersion: 1, connectionId: row.id, generation: row.generation, sourceOrganizationId: row.source_organization_id,
      targetOrganizationId: row.organization_id, targetOrganizationName: row.target_name, state: row.state};
  }
  async connectionStatus(principal: GleamPrincipal) {
    if (!gleamOrganizationAllowed(principal.organizationId)) gleamError(403, 'ROLLOUT_DISABLED');
    return this.transaction(async client => {
      const row = (await client.query('SELECT * FROM gleam_connections WHERE id=$1 FOR SHARE', [principal.connectionId])).rows[0];
      if (!row || !['pending','active'].includes(row.state) || row.organization_id !== principal.organizationId
        || row.source_organization_id !== principal.sourceOrganizationId || row.generation !== principal.generation
        || row.key_id !== principal.keyId || gleamKeyFingerprint(row.public_key) !== principal.keyFingerprint
        || principal.scope !== 'connection:read' || principal.expiresAt <= Date.now()/1000) gleamError(401,'CONNECTION_REVOKED');
      const organization = (await client.query<PaidEntitlementState>('SELECT * FROM organizations WHERE id=$1 FOR SHARE', [row.organization_id])).rows[0];
      const approver = (await client.query("SELECT user_id FROM organization_members WHERE organization_id=$1 AND user_id=$2 AND joined_at IS NOT NULL AND role IN ('owner','admin') FOR SHARE", [row.organization_id,row.target_approved_by])).rows[0];
      if (!approver) gleamError(403,'APPROVAL_REQUIRED');
      if (!organization || !hasPlanEntitlement(organization, 'starter')) gleamError(403,'ENTITLEMENT_REQUIRED');
      return this.connectionView(client, row.id);
    });
  }
}
