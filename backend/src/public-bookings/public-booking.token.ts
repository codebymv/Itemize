import { createHash, createHmac } from 'node:crypto';

const secret = (): Buffer => {
  const dedicated = process.env.BOOKING_TOKEN_DERIVATION_KEY?.trim();
  if (dedicated) {
    if (dedicated.length < 32) {
      throw new Error('BOOKING_TOKEN_DERIVATION_KEY must be at least 32 characters');
    }
    return Buffer.from(dedicated);
  }
  const legacy = process.env.JWT_SECRET?.trim();
  if (!legacy) {
    throw new Error(
      'Booking token derivation requires BOOKING_TOKEN_DERIVATION_KEY or JWT_SECRET',
    );
  }
  return createHash('sha256')
    .update(`itemize-booking-key-v1:${legacy}`)
    .digest();
};

export const publicBookingCancellationToken = (
  idempotencyKey: string,
): string => createHmac('sha256', secret())
  .update(`itemize-public-booking-capability-v1:${idempotencyKey}`)
  .digest('hex');
