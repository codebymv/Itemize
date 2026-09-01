import { GraphqlRequestError } from './graphqlClient';

const AMBIGUOUS_GRAPHQL_CODES = new Set([
  'INTERNAL_SERVER_ERROR',
  'SERVICE_UNAVAILABLE',
]);

export const isAmbiguousWorkspaceMutationError = (error: unknown): boolean => {
  if (!(error instanceof GraphqlRequestError)) return true;
  if (error.code) return AMBIGUOUS_GRAPHQL_CODES.has(error.code);
  return error.status === 200 || error.status >= 500;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
};

type WorkspaceCreationType = 'list' | 'note' | 'whiteboard' | 'wireframe';

type WorkspaceCreationAttempt = {
  key: string;
  pending?: Promise<unknown>;
};

const creationAttempts = new Map<string, WorkspaceCreationAttempt>();

const creationKey = (): string =>
  globalThis.crypto?.randomUUID?.()
  ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });

export const runWorkspaceCreationAttempt = async <T>(
  type: WorkspaceCreationType,
  payload: object,
  create: (idempotencyKey: string) => Promise<T>,
): Promise<T> => {
  const signature = JSON.stringify(canonicalize({ type, payload }));
  const attempt = creationAttempts.get(signature) ?? { key: creationKey() };
  creationAttempts.set(signature, attempt);
  if (attempt.pending) return attempt.pending as Promise<T>;

  const pending = create(attempt.key);
  attempt.pending = pending;
  try {
    const result = await pending;
    creationAttempts.delete(signature);
    return result;
  } catch (error) {
    if (!isAmbiguousWorkspaceMutationError(error)) {
      creationAttempts.delete(signature);
    }
    throw error;
  } finally {
    if (creationAttempts.get(signature) === attempt) {
      attempt.pending = undefined;
    }
  }
};

export const resetWorkspaceCreationAttemptsForTests = (): void => {
  creationAttempts.clear();
};

const parseStructuredString = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
};

const valuesMatch = (actual: unknown, intended: unknown): boolean => {
  if (Object.is(actual, intended)) return true;
  const normalizedActual = canonicalize(parseStructuredString(actual));
  const normalizedIntended = canonicalize(parseStructuredString(intended));
  return JSON.stringify(normalizedActual) === JSON.stringify(normalizedIntended);
};

export const workspaceRecordMatchesUpdate = <
  TRecord extends object,
  TUpdate extends object,
>(record: TRecord, update: TUpdate): boolean =>
  Object.entries(update).every(([key, intended]) =>
    intended === undefined || valuesMatch(
      (record as Record<string, unknown>)[key],
      intended,
    ));

export const reconcileWorkspaceUpdate = async <
  TRecord extends object,
  TUpdate extends object,
>(
  error: unknown,
  readCurrent: () => Promise<TRecord | null>,
  update: TUpdate,
): Promise<TRecord> => {
  if (!isAmbiguousWorkspaceMutationError(error)) throw error;
  try {
    const current = await readCurrent();
    if (current && workspaceRecordMatchesUpdate(current, update)) {
      return current;
    }
  } catch {
    // Preserve the mutation failure when authoritative reconciliation is unavailable.
  }
  throw error;
};
