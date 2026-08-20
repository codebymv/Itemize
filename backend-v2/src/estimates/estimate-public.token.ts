import { createHash, createHmac } from 'node:crypto';

const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;

const secret = (): Buffer => {
  const dedicated = process.env.ESTIMATE_TOKEN_DERIVATION_KEY?.trim();
  if (dedicated) {
    if (dedicated.length < 32) {
      throw new Error('ESTIMATE_TOKEN_DERIVATION_KEY must be at least 32 characters');
    }
    return Buffer.from(dedicated);
  }
  const legacy = process.env.JWT_SECRET?.trim();
  if (!legacy) {
    throw new Error('Estimate token derivation requires ESTIMATE_TOKEN_DERIVATION_KEY or JWT_SECRET');
  }
  return createHash('sha256')
    .update(`itemize-estimate-key-v1:${legacy}`)
    .digest();
};

export const estimateDeliveryToken = (
  organizationId: number,
  estimateId: number,
  idempotencyKey: string,
): string => createHmac('sha256', secret())
  .update(`itemize-estimate-capability-v1:${organizationId}:${estimateId}:${idempotencyKey}`)
  .digest('base64url');

export const estimateDeliveryTokenHash = (
  organizationId: number,
  estimateId: number,
  idempotencyKey: string,
): string => createHash('sha256')
  .update(estimateDeliveryToken(organizationId, estimateId, idempotencyKey))
  .digest('hex');

export const estimatePublicTokenHash = (token: string): string | null => {
  if (!TOKEN.test(token)) return null;
  return createHash('sha256').update(token).digest('hex');
};
