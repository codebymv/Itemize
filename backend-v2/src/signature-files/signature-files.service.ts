import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  SIGNATURE_FILE_STORAGE,
  SignatureFileStorage,
  SignatureFileScope,
} from './signature-file-storage.provider';
import {
  SignatureDocumentFileRow,
  SignatureFilesRepository,
  SignatureTemplateFileRow,
} from './signature-files.repository';

type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type DeliveredSignatureFile = {
  buffer: Buffer;
  filename: string;
};

@Injectable()
export class SignatureFilesService {
  private readonly logger = new Logger(SignatureFilesService.name);

  constructor(
    private readonly repository: SignatureFilesRepository,
    @Inject(SIGNATURE_FILE_STORAGE)
    private readonly storage: SignatureFileStorage,
  ) {}

  async uploadDocument(
    organizationId: number,
    rawDocumentId: unknown,
    file: UploadFile | undefined,
  ): Promise<Record<string, unknown>> {
    await this.assertFeature(organizationId);
    const documentId = this.id(rawDocumentId, 'Document');
    if (!(await this.repository.canUploadDocument(organizationId, documentId))) {
      this.notFound('Draft document');
    }
    const stored = await this.store(
      organizationId,
      documentId,
      'document',
      file,
    );
    try {
      const row = await this.repository.replaceDocument(
        organizationId,
        documentId,
        stored,
      );
      if (!row) this.notFound('Draft document');
      return this.document(row);
    } catch (error) {
      await this.compensate(stored.url, organizationId, 'document', documentId);
      throw error;
    }
  }

  async uploadTemplate(
    organizationId: number,
    rawTemplateId: unknown,
    file: UploadFile | undefined,
  ): Promise<Record<string, unknown>> {
    await this.assertFeature(organizationId);
    const templateId = this.id(rawTemplateId, 'Template');
    if (!(await this.repository.canUploadTemplate(organizationId, templateId))) {
      this.notFound('Template');
    }
    const stored = await this.store(
      organizationId,
      templateId,
      'template',
      file,
    );
    try {
      const row = await this.repository.replaceTemplate(
        organizationId,
        templateId,
        stored,
      );
      if (!row) this.notFound('Template');
      return this.template(row);
    } catch (error) {
      await this.compensate(stored.url, organizationId, 'template', templateId);
      throw error;
    }
  }

  async documentSource(
    organizationId: number,
    rawDocumentId: string,
  ): Promise<DeliveredSignatureFile> {
    await this.assertFeature(organizationId);
    const documentId = this.id(rawDocumentId, 'Document');
    const row = await this.repository.findDocument(organizationId, documentId);
    if (!row) this.notFound('Document');
    return this.deliver(row.file_url, row.file_name, 'document.pdf', 'File');
  }

  async completedDocument(
    organizationId: number,
    rawDocumentId: string,
  ): Promise<DeliveredSignatureFile> {
    await this.assertFeature(organizationId);
    const documentId = this.id(rawDocumentId, 'Document');
    const row = await this.repository.findDocument(organizationId, documentId);
    if (!row) this.notFound('Document');
    if (!row.signed_file_url) {
      throw new NotFoundException({
        success: false,
        error: {
          message: 'Signed document not available',
          code: 'NOT_READY',
        },
      });
    }
    return this.deliver(
      row.signed_file_url,
      row.file_name,
      'signed-document.pdf',
      'Signed file',
    );
  }

  async templateSource(
    organizationId: number,
    rawTemplateId: string,
  ): Promise<DeliveredSignatureFile> {
    await this.assertFeature(organizationId);
    const templateId = this.id(rawTemplateId, 'Template');
    const row = await this.repository.findTemplate(organizationId, templateId);
    if (!row) this.notFound('Template');
    return this.deliver(row.file_url, row.file_name, 'template.pdf', 'File');
  }

  private async store(
    organizationId: number,
    resourceId: number,
    scope: SignatureFileScope,
    file: UploadFile | undefined,
  ): Promise<{ url: string; name: string; size: number; sha256: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        success: false,
        error: {
          message: `${scope === 'document' ? 'Document' : 'Template'} ID and file are required`,
          code: 'BAD_REQUEST',
        },
      });
    }
    if (
      file.mimetype !== 'application/pdf' ||
      file.buffer.length < 5 ||
      file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
    ) {
      throw new BadRequestException({
        success: false,
        error: {
          message: 'Invalid PDF file content',
          code: 'UPLOAD_ERROR',
        },
      });
    }
    const url = await this.storage.store({
      buffer: file.buffer,
      organizationId,
      resourceId,
      scope,
    });
    return {
      url,
      name: this.filename(file.originalname, `${scope}.pdf`),
      size: file.buffer.length,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  private async deliver(
    fileUrl: string | null,
    filename: string | null,
    fallback: string,
    resource: string,
  ): Promise<DeliveredSignatureFile> {
    if (!fileUrl) this.notFound(resource);
    const buffer = await this.storage.read(fileUrl);
    if (!buffer) this.notFound(resource);
    return { buffer, filename: this.filename(filename, fallback) };
  }

  private async assertFeature(organizationId: number): Promise<void> {
    if (!(await this.repository.hasFeatureAccess(organizationId))) {
      throw new ForbiddenException({
        success: false,
        error: {
          message: 'E-Signatures require an upgrade.',
          code: 'FEATURE_NOT_AVAILABLE',
        },
      });
    }
  }

  private async compensate(
    fileUrl: string,
    organizationId: number,
    scope: SignatureFileScope,
    resourceId: number,
  ): Promise<void> {
    try {
      await this.storage.remove(fileUrl);
    } catch (error) {
      this.logger.error('Failed to compensate uncommitted signature upload', {
        organizationId,
        scope,
        resourceId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  private document(row: SignatureDocumentFileRow): Record<string, unknown> {
    return {
      ...row,
      file_url: row.file_url
        ? `/api/signatures/documents/${row.id}/file`
        : null,
      signed_file_url: row.signed_file_url
        ? `/api/signatures/documents/${row.id}/download`
        : null,
    };
  }

  private template(row: SignatureTemplateFileRow): Record<string, unknown> {
    return {
      ...row,
      file_url: row.file_url
        ? `/api/signatures/templates/${row.id}/file`
        : null,
    };
  }

  private filename(value: unknown, fallback: string): string {
    const normalized = String(value ?? fallback)
      .split(/[\\/]/)
      .at(-1)!
      .replace(/[^A-Za-z0-9._ -]/g, '_')
      .slice(0, 150);
    const safe = normalized || fallback;
    return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
  }

  private id(value: unknown, resource: string): number {
    const normalized = String(value ?? '');
    if (!/^[1-9]\d{0,9}$/.test(normalized)) this.notFound(resource);
    const id = Number(normalized);
    if (!Number.isSafeInteger(id) || id > 2_147_483_647) {
      this.notFound(resource);
    }
    return id;
  }

  private notFound(resource: string): never {
    throw new NotFoundException({
      success: false,
      error: { message: `${resource} not found`, code: 'NOT_FOUND' },
    });
  }
}
