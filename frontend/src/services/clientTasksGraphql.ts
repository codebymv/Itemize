import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
export type ClientTask = {
    id: number;
    contactId: number | null;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    assignedToId: number | null;
    assignedToName: string | null;
    dueAt: string | null;
    completedAt: string | null;
    updatedAt: string;
    version: number;
    canEdit: boolean;
    canClaim: boolean;
};
export type ClientTaskPage = {
    nodes: ClientTask[];
    pageInfo: {
        page: number;
        total: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
    canCreate: boolean;
    canManage: boolean;
    viewerId: number;
    assignees: {
        id: number;
        name: string;
    }[];
};
export type ClientTaskInput = {
    title: string;
    description: string | null;
    priority: string;
    dueAt: string | null;
    assignedToId: number | null;
    contactId?: number | null;
};
const fields = 'id contactId title description priority status assignedToId assignedToName dueAt completedAt updatedAt version canEdit canClaim';
export async function getClientTasks(organizationId: number, filter: {
    taskId?: number;
    contactId?: number;
    view?: string;
}, page: number, signal?: AbortSignal) {
    const variables = { filter, page: { page, pageSize: 20 } };
    return (await graphqlRequest<{
        clientTasks: ClientTaskPage;
    }, typeof variables>(`query ClientTasks($filter:ClientTaskFilterInput,$page:PageInput){clientTasks(filter:$filter,page:$page){nodes{${fields}} pageInfo{page total hasNextPage hasPreviousPage} canCreate canManage viewerId assignees{id name}}}`, variables, organizationId, signal)).clientTasks;
}
export async function createClientTask(organizationId: number, input: ClientTaskInput, key: string) {
    const variables = { input, idempotencyKey: key };
    return (await graphqlMutationRequest<{
        createClientTask: ClientTask;
    }, typeof variables>(`mutation CreateClientTask($input:CreateClientTaskInput!,$idempotencyKey:String!){createClientTask(input:$input,idempotencyKey:$idempotencyKey){${fields}}}`, variables, organizationId)).createClientTask;
}
export async function updateClientTask(organizationId: number, task: ClientTask, input: Partial<ClientTaskInput>, key: string) {
    const variables = { id: task.id, expectedVersion: task.version, input, idempotencyKey: key };
    return (await graphqlMutationRequest<{
        updateClientTask: ClientTask;
    }, typeof variables>(`mutation UpdateClientTask($id:Int!,$expectedVersion:Int!,$input:UpdateClientTaskInput!,$idempotencyKey:String!){updateClientTask(id:$id,expectedVersion:$expectedVersion,input:$input,idempotencyKey:$idempotencyKey){${fields}}}`, variables, organizationId)).updateClientTask;
}
export async function transitionClientTask(organizationId: number, task: ClientTask, status: string, key: string) {
    const variables = { id: task.id, expectedVersion: task.version, status, idempotencyKey: key };
    return (await graphqlMutationRequest<{
        transitionClientTask: ClientTask;
    }, typeof variables>(`mutation TransitionClientTask($id:Int!,$expectedVersion:Int!,$status:String!,$idempotencyKey:String!){transitionClientTask(id:$id,expectedVersion:$expectedVersion,status:$status,idempotencyKey:$idempotencyKey){${fields}}}`, variables, organizationId)).transitionClientTask;
}
