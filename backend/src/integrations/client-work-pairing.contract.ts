import { z } from 'zod';

export const pairingCodeSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const pairingClaimSchema = z.object({connectionId: z.string().uuid(), proof: pairingCodeSchema}).strict();
export const pairingProofSchema = z.object({
  schemaVersion: z.literal(1), nonce: z.string().uuid(), connectionId: z.string().uuid(), generation: z.literal(1),
  pairingCodeHash: pairingCodeSchema,
  sourceOrganizationId: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  sourceOrganizationName: z.string().min(1).max(255), keyId: z.string().min(1).max(128),
  publicKey: z.string().min(100).max(8000), sourceApprovedAt: z.string().datetime(), expiresAt: z.string().datetime(),
}).strict();
export const pairingStatusSchema = z.object({
  schemaVersion: z.literal(1), connectionId: z.string().uuid(), generation: z.literal(1),
  sourceOrganizationId: z.string().min(1).max(128), targetOrganizationId: z.number().int().positive().max(2147483647),
  targetOrganizationName: z.string().min(1).max(255), state: z.enum(['pending', 'active']),
}).strict();

/** Configuration-only peer origin. Never pass a URL from a browser or pairing payload. */
export async function pairingPeerRequest(origin: string, path: string, authorization: string, body?: unknown,
  fetcher: typeof fetch = fetch): Promise<unknown> {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !path.startsWith('/api/')) throw new Error('Pairing peer configuration is invalid');
  const signal = AbortSignal.timeout(10000);
  try {
    const response = await fetcher(url.origin + path, {method: body === undefined ? 'GET' : 'POST', redirect: 'manual', signal,
      headers: {Authorization: `Bearer ${authorization}`, Accept: 'application/json', 'Content-Type': 'application/json'},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    if (response.status !== 200 || !response.body) throw new Error();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      let part = await reader.read();
      while (!part.done) {
        size += part.value.byteLength;
        if (size > 16384) { await reader.cancel(); throw new Error(); }
        chunks.push(part.value); part = await reader.read();
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally { reader.releaseLock(); }
  } catch { throw new Error('Pairing peer could not be verified. Refresh status before trying again.'); }
}
