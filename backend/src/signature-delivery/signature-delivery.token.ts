import { createHash, createHmac } from 'node:crypto';

const secret = (): Buffer => {
  const dedicated = process.env.SIGNATURE_TOKEN_DERIVATION_KEY?.trim();
  if (dedicated) {
    if (dedicated.length < 32) {
      throw new Error('SIGNATURE_TOKEN_DERIVATION_KEY must be at least 32 characters');
    }
    return Buffer.from(dedicated);
  }
  const legacy = process.env.JWT_SECRET?.trim();
  if (!legacy) {
    throw new Error('Signature token derivation requires SIGNATURE_TOKEN_DERIVATION_KEY or JWT_SECRET');
  }
  return createHash('sha256')
    .update(`itemize-signature-key-v1:${legacy}`)
    .digest();
};

export const signatureDeliveryToken = (idempotencyKey: string): string =>
  createHmac('sha256', secret())
    .update(`itemize-signature-capability-v1:${idempotencyKey}`)
    .digest('base64url');

export const signatureDeliveryTokenHash = (idempotencyKey: string): string =>
  createHash('sha256').update(signatureDeliveryToken(idempotencyKey)).digest('hex');
