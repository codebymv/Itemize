import { Module } from '@nestjs/common';
import { BookingsRepository } from './bookings.repository';
import { BookingsResolver } from './bookings.resolver';
import { BookingsService } from './bookings.service';

@Module({
  providers: [BookingsRepository, BookingsService, BookingsResolver],
  exports: [BookingsService],
})
export class BookingsModule {}
