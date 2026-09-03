import { PoolClient } from 'pg';

export type OrganizationLifecycleAction =
  | 'delete_organization'
  | 'leave_organization'
  | 'remove_member'
  | 'revoke_invitation'
  | 'transfer_ownership'
  | 'update_member_role';

export type OrganizationLifecycleReceipt = {
  action: OrganizationLifecycleAction;
  request_fingerprint: string;
  result: unknown;
};

export const lockOrganizationLifecycleActor = async (
  client: PoolClient,
  userId: number,
): Promise<boolean> => {
  const actor = await client.query(
    'SELECT id FROM users WHERE id=$1 FOR UPDATE',
    [userId],
  );
  return actor.rows.length === 1;
};

export const findOrganizationLifecycleReceipt = async (
  client: PoolClient,
  userId: number,
  idempotencyKey: string,
): Promise<OrganizationLifecycleReceipt | null> => {
  const receipt = await client.query<OrganizationLifecycleReceipt>(
    `SELECT action,request_fingerprint,result
     FROM organization_lifecycle_mutation_receipts
     WHERE requested_by_user_id=$1 AND idempotency_key=$2
     FOR UPDATE`,
    [userId, idempotencyKey],
  );
  return receipt.rows[0] ?? null;
};

export const saveOrganizationLifecycleReceipt = async (
  client: PoolClient,
  values: {
    userId: number;
    idempotencyKey: string;
    organizationId: number;
    action: OrganizationLifecycleAction;
    requestFingerprint: string;
    result: Record<string, unknown>;
  },
): Promise<void> => {
  await client.query(
    `INSERT INTO organization_lifecycle_mutation_receipts (
       requested_by_user_id,idempotency_key,organization_id,action,
       request_fingerprint,result
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      values.userId,
      values.idempotencyKey,
      values.organizationId,
      values.action,
      values.requestFingerprint,
      JSON.stringify(values.result),
    ],
  );
};

export const organizationLifecycleReceiptResult = (
  receipt: OrganizationLifecycleReceipt,
  action: OrganizationLifecycleAction,
  requestFingerprint: string,
): { kind: 'ok'; result: Record<string, unknown> }
  | { kind: 'idempotency_conflict' }
  | { kind: 'result_unavailable' } => {
  if (receipt.action !== action || receipt.request_fingerprint !== requestFingerprint) {
    return { kind: 'idempotency_conflict' };
  }
  if (!receipt.result || typeof receipt.result !== 'object' || Array.isArray(receipt.result)) {
    return { kind: 'result_unavailable' };
  }
  return { kind: 'ok', result: receipt.result as Record<string, unknown> };
};
