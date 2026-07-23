import {
  BadRequestException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SIGNATURE_FILE_STORAGE,
  SignatureFileStorage,
} from '../signature-files/signature-file-storage.provider';
import {
  PublicSigningAudit,
  PublicSigningRepository,
} from './public-signing.repository';
import {
  normalizePublicSigningSubmission,
  publicSigningTokenHash,
  PublicSigningValidationError,
} from './public-signing.validation';

@Injectable()
export class PublicSigningService {
  constructor(
    private readonly repository: PublicSigningRepository,
    @Inject(SIGNATURE_FILE_STORAGE) private readonly storage: SignatureFileStorage,
  ) {}

  async session(token: string, audit: PublicSigningAudit) {
    const tokenHash = this.tokenHash(token);
    const row = await this.repository.openSession(tokenHash, audit);
    if (!row) throw this.notFound();
    const { capability } = row;
    return {
      document: {
        id: capability.document_id,
        title: capability.title,
        description: capability.description,
        message: capability.message,
        file_url: capability.file_url ? '/api/public/sign/current/file' : null,
        file_name: capability.file_name,
        file_type: capability.file_type,
        status: capability.document_status,
        expires_at: capability.expires_at,
        routing_mode: capability.routing_mode || 'parallel',
      },
      recipient: {
        id: capability.recipient_id,
        name: capability.recipient_name,
        email: capability.recipient_email,
        status: capability.recipient_status,
        routing_status: capability.routing_status,
        identity_method: capability.identity_method,
        identity_verified_at: capability.identity_verified_at,
      },
      fields: row.fields.map((field) => ({
        id: field.id,
        field_type: field.field_type,
        page_number: field.page_number,
        x_position: Number(field.x_position),
        y_position: Number(field.y_position),
        width: Number(field.width),
        height: Number(field.height),
        label: field.label,
        is_required: field.is_required,
      })),
    };
  }

  verify(): never {
    throw new GoneException({
      success: false,
      error: {
        message:
          'Additional signer verification is not enabled. Possession of a valid signing link is the verification method for this release.',
        code: 'SIGNER_VERIFICATION_NOT_ENABLED',
      },
    });
  }

  async submit(token: string, payload: unknown, audit: PublicSigningAudit) {
    const tokenHash = this.tokenHash(token);
    try {
      const fields = normalizePublicSigningSubmission(payload);
      const result = await this.repository.submit(tokenHash, fields, audit);
      if (!result) throw this.notFound();
      return result;
    } catch (error) {
      this.validation(error);
    }
  }

  async decline(
    token: string,
    payload: unknown,
    audit: PublicSigningAudit,
  ) {
    const tokenHash = this.tokenHash(token);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw this.bad('Decline payload is invalid', 'INVALID_DECLINE_PAYLOAD');
    }
    const record = payload as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== 'reason')) {
      throw this.bad('Decline payload is invalid', 'INVALID_DECLINE_PAYLOAD');
    }
    if (
      record.reason !== undefined
      && record.reason !== null
      && typeof record.reason !== 'string'
    ) {
      throw this.bad('Decline reason is invalid', 'INVALID_DECLINE_REASON');
    }
    const normalized = typeof record.reason === 'string'
      ? record.reason.trim()
      : '';
    if (normalized.length > 2000) {
      throw this.bad('Decline reason is too long', 'DECLINE_REASON_TOO_LONG');
    }
    const result = await this.repository.decline(
      tokenHash,
      normalized || null,
      audit,
    );
    if (!result) throw this.notFound();
    return result;
  }

  async file(token: string): Promise<{ buffer: Buffer; filename: string }> {
    const row = await this.repository.file(this.tokenHash(token));
    if (!row) throw this.notFound();
    const buffer = await this.storage.read(row.fileUrl);
    if (!buffer) {
      throw new NotFoundException({
        success: false,
        error: { message: 'File not found', code: 'NOT_FOUND' },
      });
    }
    return {
      buffer,
      filename: this.filename(row.fileName || 'document.pdf'),
    };
  }

  private tokenHash(token: string): string {
    const hash = publicSigningTokenHash(token);
    if (!hash) throw this.notFound();
    return hash;
  }

  private filename(value: string): string {
    const cleaned = value
      .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
    return cleaned.toLowerCase().endsWith('.pdf')
      ? cleaned || 'document.pdf'
      : `${cleaned || 'document'}.pdf`;
  }

  private validation(error: unknown): never {
    if (error instanceof PublicSigningValidationError) {
      throw this.bad(error.message, error.reason);
    }
    throw error;
  }

  private bad(message: string, reason: string): BadRequestException {
    return new BadRequestException({
      success: false,
      error: { message, code: 'BAD_REQUEST', reason },
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      success: false,
      error: {
        message: 'Signing link is invalid or expired',
        code: 'NOT_FOUND',
      },
    });
  }
}
