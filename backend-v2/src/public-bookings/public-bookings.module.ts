import { Module } from '@nestjs/common';
import { PublicBookingsController } from './public-bookings.controller';
import { PublicBookingsRepository } from './public-bookings.repository';
import { PublicBookingsService } from './public-bookings.service';

@Module({
  controllers: [PublicBookingsController],
  providers: [PublicBookingsService, PublicBookingsRepository],
})
export class PublicBookingsModule {}
