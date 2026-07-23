import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { SignatureFileStorage } from './signature-file-storage.provider';
import { SignatureFilesRepository } from './signature-files.repository';
import { SignatureFilesService } from './signature-files.service';

describe('SignatureFilesService', () => {
  const repository = {
    hasFeatureAccess: jest.fn(),
    canUploadDocument: jest.fn(),
    canUploadTemplate: jest.fn(),
    replaceDocument: jest.fn(),
    replaceTemplate: jest.fn(),
    findDocument: jest.fn(),
    findTemplate: jest.fn(),
  } as unknown as jest.Mocked<SignatureFilesRepository>;
  const storage = {
    store: jest.fn(),
    read: jest.fn(),
    remove: jest.fn(),
  } as jest.Mocked<SignatureFileStorage>;
  const service = new SignatureFilesService(repository, storage);
  let pdf: Buffer;
  let file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  };
  let document: Record<string, unknown>;

  beforeAll(async () => {
    const source = await PDFDocument.create();
    source.addPage([612, 792]);
    pdf = Buffer.from(await source.save());
    file = {
      buffer: pdf,
      mimetype: 'application/pdf',
      originalname: '../Agreement',
      size: pdf.length,
    };
    document = {
      id: 7,
      organization_id: 4,
      title: 'Agreement',
      document_number: null,
      description: null,
      message: null,
      file_url: '/uploads/signatures/new.pdf',
      file_name: 'Agreement.pdf',
      file_size: pdf.length,
      file_type: 'application/pdf',
      status: 'draft',
      expiration_days: 30,
      expires_at: null,
      sender_name: null,
      sender_email: null,
      sent_at: null,
      completed_at: null,
      signed_file_url: null,
      timezone: null,
      locale: null,
      created_by: 2,
      created_at: new Date(),
      updated_at: new Date(),
      routing_mode: 'parallel',
      template_id: null,
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository.hasFeatureAccess.mockResolvedValue(true);
    repository.canUploadDocument.mockResolvedValue(true);
    repository.canUploadTemplate.mockResolvedValue(true);
    storage.store.mockResolvedValue('/uploads/signatures/new.pdf');
    storage.remove.mockResolvedValue(undefined);
    storage.read.mockResolvedValue(pdf);
    repository.replaceDocument.mockResolvedValue(document as never);
    repository.replaceTemplate.mockResolvedValue({
      id: 8,
      organization_id: 4,
      title: 'Template',
      description: null,
      message: null,
      file_url: '/uploads/signatures/template.pdf',
      file_name: 'Template.pdf',
      file_size: pdf.length,
      file_type: 'application/pdf',
      created_by: 2,
      created_at: new Date(),
      updated_at: new Date(),
    });
    repository.findDocument.mockResolvedValue(document as never);
    repository.findTemplate.mockResolvedValue({
      id: 8,
      organization_id: 4,
      title: 'Template',
      description: null,
      message: null,
      file_url: '/uploads/signatures/template.pdf',
      file_name: 'Template.pdf',
      file_size: pdf.length,
      file_type: 'application/pdf',
      created_by: 2,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  it('stores verified PDF bytes and exposes only the authenticated source URL', async () => {
    await expect(service.uploadDocument(4, '7', file)).resolves.toMatchObject({
      id: 7,
      file_url: '/api/signatures/documents/7/file',
      signed_file_url: null,
    });
    expect(storage.store).toHaveBeenCalledWith({
      buffer: pdf,
      organizationId: 4,
      resourceId: 7,
      scope: 'document',
    });
    expect(repository.replaceDocument).toHaveBeenCalledWith(
      4,
      7,
      expect.objectContaining({
        url: '/uploads/signatures/new.pdf',
        name: 'Agreement.pdf',
        size: pdf.length,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('conceals foreign resources before writing storage', async () => {
    repository.canUploadDocument.mockResolvedValue(false);
    await expect(service.uploadDocument(4, '7', file)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.store).not.toHaveBeenCalled();
  });

  it('rejects MIME and structurally invalid PDF spoofing before storage', async () => {
    await expect(
      service.uploadTemplate(4, '8', {
        ...file,
        buffer: Buffer.from('not a pdf'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.store).not.toHaveBeenCalled();
  });

  it('removes newly stored bytes if the locked database swap loses authorization', async () => {
    repository.replaceDocument.mockResolvedValue(null);
    await expect(service.uploadDocument(4, '7', file)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.remove).toHaveBeenCalledWith(
      '/uploads/signatures/new.pdf',
    );
  });

  it('delivers source and completed bytes without accepting arbitrary locators', async () => {
    await expect(service.documentSource(4, '7')).resolves.toEqual({
      buffer: pdf,
      filename: 'Agreement.pdf',
    });
    expect(storage.read).toHaveBeenCalledWith(
      '/uploads/signatures/new.pdf',
    );
    await expect(service.completedDocument(4, '7')).rejects.toMatchObject({
      response: {
        error: { code: 'NOT_READY' },
      },
    });
  });

  it('fails closed when the organization lacks signature access', async () => {
    repository.hasFeatureAccess.mockResolvedValue(false);
    await expect(service.documentSource(4, '7')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repository.findDocument).not.toHaveBeenCalled();
  });
});
