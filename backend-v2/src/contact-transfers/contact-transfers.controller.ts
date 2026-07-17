import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { RequestContextService } from '../request-context/request-context.service';
import { ContactTransferGuard } from './contact-transfer.guard';
import { ContactTransfersService } from './contact-transfers.service';

@Controller('api/contacts')
@UseGuards(ContactTransferGuard)
export class ContactTransfersController {
  constructor(
    private readonly transfers: ContactTransfersService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Get('export/csv')
  @Header('Cache-Control', 'private, no-store')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename=contacts-export.csv')
  @Header('X-Content-Type-Options', 'nosniff')
  async exportCsv(
    @Query('status') status: unknown,
    @Query('tags') tags: unknown,
    @Res() response: Response,
  ): Promise<void> {
    const context = this.verifiedContext();
    const csv = await this.transfers.exportCsv(
      context.organizationId,
      context.userId,
      status,
      tags,
      context.requestId,
    );
    response.send(csv);
  }

  @Post('import/csv')
  async importCsv(@Body() body: unknown): Promise<{
    success: true;
    message: string;
    imported: number;
    skipped: number;
    errors: Array<{ row: number; error: string }>;
    errorCount: number;
    errorsTruncated: boolean;
  }> {
    const context = this.verifiedContext();
    const result = await this.transfers.importContacts(
      context.organizationId,
      context.userId,
      body,
      context.requestId,
    );
    return {
      success: true,
      message: `Import completed: ${result.imported} imported, ${result.skipped} skipped`,
      ...result,
    };
  }

  private verifiedContext(): {
    organizationId: number;
    userId: number;
    requestId: string;
  } {
    const context = this.requestContext.current();
    if (!context.identity || !context.organization) {
      throw new Error('Verified contact-transfer context is unavailable');
    }
    return {
      organizationId: context.organization.organizationId,
      userId: context.identity.userId,
      requestId: context.requestId,
    };
  }
}
