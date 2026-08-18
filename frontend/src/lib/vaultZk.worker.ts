import { handleVaultZkRequest, type VaultZkRequest } from './vaultZkOps';

type WorkerMessage = { id: number } & VaultZkRequest;

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, ...request } = event.data;
  try {
    const result = await handleVaultZkRequest(request);
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (error) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Vault crypto failed',
    });
  }
};
