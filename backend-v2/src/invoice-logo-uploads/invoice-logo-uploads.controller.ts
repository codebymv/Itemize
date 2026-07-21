import {
  BadRequestException, Controller, HttpCode, Param, Post, UploadedFile,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RequestContextService } from '../request-context/request-context.service';
import { InvoiceLogoUploadGuard } from './invoice-logo-upload.guard';
import { InvoiceLogoUploadsService } from './invoice-logo-uploads.service';

const upload = FileInterceptor('logo', {
  storage: memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 1, parts: 2 },
  fileFilter: (_request, file, callback) => {
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype)) {
      return callback(new BadRequestException({
        error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.',
        code: 'BAD_REQUEST',
      }), false);
    }
    callback(null, true);
  },
});

@Controller('api/invoices')
@UseGuards(InvoiceLogoUploadGuard)
export class InvoiceLogoUploadsController {
  constructor(
    private readonly logos: InvoiceLogoUploadsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Post('businesses/:id/logo')
  @HttpCode(200)
  @UseInterceptors(upload)
  async business(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    return { success: true, data: await this.logos.business(this.organizationId(), id, file) };
  }

  @Post('settings/logo')
  @HttpCode(200)
  @UseInterceptors(upload)
  async settings(@UploadedFile() file?: Express.Multer.File) {
    const data = await this.logos.settings(this.organizationId(), file);
    return { success: true, data: { success: true, ...data } };
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) throw new Error('Verified invoice logo context is unavailable');
    return organization.organizationId;
  }
}
