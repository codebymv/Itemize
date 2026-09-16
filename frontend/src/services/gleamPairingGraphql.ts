import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
export type GleamPairingOverview = {enabled: boolean; organizationId: number; organizationName: string;
  assignees: {id: number; name: string}[]; pairing: null | {id: string; state: string; source_name: string | null;
    connection_id: string | null; expires_at: string; default_assignee_id: number; due_after_minutes: number}};
const fields = 'enabled organizationId organizationName assignees{id name} pairing{id state source_name connection_id expires_at default_assignee_id due_after_minutes}';
export async function getGleamPairing(org: number, signal?: AbortSignal) {
  return (await graphqlRequest<{gleamPairingOverview: GleamPairingOverview}, Record<string, never>>(`query GleamPairingOverview{gleamPairingOverview{${fields}}}`, {}, org, signal)).gleamPairingOverview;
}
export async function createGleamPairing(org: number, input: {code: string; defaultAssigneeId: number; dueAfterMinutes: number}, key: string) {
  const variables = {input, idempotencyKey: key};
  return (await graphqlMutationRequest<{createGleamPairing: GleamPairingOverview}, typeof variables>(
    `mutation CreateGleamPairing($input:CreateGleamPairingInput!,$idempotencyKey:String!){createGleamPairing(input:$input,idempotencyKey:$idempotencyKey){${fields}}}`, variables, org)).createGleamPairing;
}
export async function changeGleamPairing(org: number, action: 'approveGleamPairing' | 'disconnectGleamConnection', id: string, key: string) {
  const variables = {id, idempotencyKey: key};
  if (action === 'approveGleamPairing') {
    return (await graphqlMutationRequest<{approveGleamPairing: GleamPairingOverview}, typeof variables>(
      `mutation ApproveGleamPairing($id:String!,$idempotencyKey:String!){approveGleamPairing(id:$id,idempotencyKey:$idempotencyKey){${fields}}}`, variables, org)).approveGleamPairing;
  }
  return (await graphqlMutationRequest<{disconnectGleamConnection: GleamPairingOverview}, typeof variables>(
    `mutation DisconnectGleamConnection($id:String!,$idempotencyKey:String!){disconnectGleamConnection(id:$id,idempotencyKey:$idempotencyKey){${fields}}}`, variables, org)).disconnectGleamConnection;
}
