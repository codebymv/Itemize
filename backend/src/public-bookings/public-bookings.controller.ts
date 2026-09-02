import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PublicBookingsService } from './public-bookings.service';

@Controller('api/bookings/public/book')
export class PublicBookingsController {
  constructor(private readonly bookings: PublicBookingsService) {}

  @Get(':slug')
  async page(@Param('slug') slug: string) {
    return this.bookings.getPublicBookingPage(slug);
  }

  @Get(':slug/slots')
  async slots(
    @Param('slug') slug: string,
    @Query('start_date') startDate: string | undefined,
    @Query('end_date') endDate: string | undefined,
  ) {
    return this.bookings.getPublicBookingSlots(slug, startDate, endDate);
  }

  @Post(':slug')
  @HttpCode(201)
  async create(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    return this.bookings.createPublicBooking(
      slug,
      body ?? {},
      request.get('idempotency-key'),
    );
  }

  @Post(':slug/cancel/:token')
  @HttpCode(200)
  async cancel(
    @Param('slug') slug: string,
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.bookings.cancelPublicBooking(slug, token, body?.reason);
  }
}
