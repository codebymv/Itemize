import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { HttpCapabilityScoped } from '../common/metadata';
import { InvoicePaymentResultService } from './invoice-payment-result.service';

@Controller('api/public/invoice-payments')
@HttpCapabilityScoped()
export class InvoicePaymentResultController {
  constructor(private readonly results: InvoicePaymentResultService) {}

  @Get(':sessionId')
  async get(
    @Param('sessionId') sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.set({
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    const result = await this.results.get(sessionId);
    if (!result) throw new NotFoundException('Payment confirmation is unavailable');
    return { success: true, data: result };
  }
}
