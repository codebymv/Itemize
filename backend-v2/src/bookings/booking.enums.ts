import { registerEnumType } from '@nestjs/graphql';

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  NO_SHOW = 'no_show',
}

registerEnumType(BookingStatus, { name: 'BookingStatus' });
