import { handleVaultZkRequest, type VaultZkRequest } from './vaultZkOps';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

const canUseWorker = (): boolean =>
  typeof window !== 'undefined' &&
  typeof Worker !== 'undefined' &&
  !(typeof process !== 'undefined' && Boolean(process.env.VITEST));

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./vaultZk.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (
    event: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>,
  ) => {
    const waiter = pending.get(event.data.id);
    if (!waiter) return;
    pending.delete(event.data.id);
    if (event.data.ok) waiter.resolve(event.data.result);
    else waiter.reject(new Error(event.data.error || 'Vault crypto failed'));
  };
  return worker;
}

export async function runVaultZk<T>(request: VaultZkRequest): Promise<T> {
  if (!canUseWorker()) {
    return handleVaultZkRequest(request) as Promise<T>;
  }
  const id = nextId;
  nextId += 1;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
    });
    getWorker().postMessage({ id, ...request });
  });
}
