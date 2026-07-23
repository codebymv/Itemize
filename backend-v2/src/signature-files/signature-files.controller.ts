import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { RequestContextService } from '../request-context/request-context.service';
import { SignatureFileGuard } from './signature-file.guard';
import { SignatureFilesService } from './signature-files.service';

const pdfUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 1,
    parts: 3,
    fieldNameSize: 100,
    fieldSize: 100,
  },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype !== 'application/pdf') {
      return callback(
        new BadRequestException({
          success: false,
          error: {
            message: 'Invalid file type. Only PDF files are allowed.',
            code: 'UPLOAD_ERROR',
          },
        }),
        false,
      );
    }
    callback(null, true);
  },
});

@Controller('api/signatures')
@UseGuards(SignatureFileGuard)
export class SignatureFilesController {
  constructor(
    private readonly files: SignatureFilesService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Post('documents/upload')
  @HttpCode(200)
  @UseInterceptors(pdfUpload)
  async uploadDocument(
    @Body('document_id') documentId: string | undefined,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return {
      success: true,
      data: await this.files.uploadDocument(
        this.organizationId(),
        documentId,
        file,
      ),
    };
  }

  @Post('templates/upload')
  @HttpCode(200)
  @UseInterceptors(pdfUpload)
  async uploadTemplate(
    @Body('template_id') templateId: string | undefined,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return {
      success: true,
      data: await this.files.uploadTemplate(
        this.organizationId(),
        templateId,
        file,
      ),
    };
  }

  @Get('documents/:id/file')
  async documentSource(
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.files.documentSource(this.organizationId(), id);
    this.send(response, file, 'inline');
  }

  @Get('documents/:id/download')
  async completedDocument(
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.files.completedDocument(this.organizationId(), id);
    this.send(response, file, 'attachment');
  }

  @Get('templates/:id/file')
  async templateSource(
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.files.templateSource(this.organizationId(), id);
    this.send(response, file, 'inline');
  }

  private send(
    response: Response,
    file: { buffer: Buffer; filename: string },
    disposition: 'inline' | 'attachment',
  ): void {
    response.set({
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `${disposition}; filename="${file.filename}"`,
      'Content-Length': String(file.buffer.length),
      'Content-Security-Policy': 'sandbox',
      'Content-Type': 'application/pdf',
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(file.buffer);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified signature file context is unavailable');
    }
    return organization.organizationId;
  }
}
