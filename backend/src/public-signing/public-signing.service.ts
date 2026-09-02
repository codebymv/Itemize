import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivationService } from '../activation/activation.service';
import {
  SIGNATURE_FILE_STORAGE,
  SignatureFileStorage,
} from '../signature-files/signature-file-storage.provider';
import {
  DeliveredSignatureFile,
  SignatureFileDeliveryRequest,
  signatureFileEffectiveRange,
  signatureFileEtag,
  signatureFileNotModified,
  sliceSignatureFile,
} from '../signature-files/signature-file-http';
import {
  PublicSigningAudit,
  PublicSigningRepository,
} from './public-signing.repository';
import {
  normalizePublicSigningSubmission,
  publicSigningTokenHash,
  PublicSigningValidationError,
} from './public-signing.validation';
import {
  publicSigningDeclineFingerprint,
  publicSigningSubmissionFingerprint,
} from './public-signing.idempotency';
import {
  SIGNATURE_CONSENT_SHA256,
  SIGNATURE_CONSENT_TEXT,
  SIGNATURE_CONSENT_VERSION,
} from './signature-consent';

@Injectable()
export class PublicSigningService {
  constructor(
    private readonly repository: PublicSigningRepository,
    @Inject(SIGNATURE_FILE_STORAGE) private readonly storage: SignatureFileStorage,
    private readonly activation: ActivationService,
  ) {}

  async session(token: string, audit: PublicSigningAudit) {
    const tokenHash = this.tokenHash(token);
    const row = await this.repository.openSession(tokenHash, audit);
    if (!row) throw this.notFound();
    const { capability } = row;
    await this.activation.recordArtifactAdvanced({
      organizationId: capability.organization_id,
      artifactType: 'signature',
      artifactId: capability.document_id,
      stage: 'viewed',
      source: 'signature_recipient_viewed',
    });
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
      consent: {
        version: SIGNATURE_CONSENT_VERSION,
        text: SIGNATURE_CONSENT_TEXT,
        sha256: SIGNATURE_CONSENT_SHA256,
      },
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
      const submission = normalizePublicSigningSubmission(payload);
      const outcome = await this.repository.submit(
        tokenHash,
        submission,
        audit,
        publicSigningSubmissionFingerprint(submission),
      );
      if (outcome.kind !== 'ok') this.terminalFailure(outcome.kind);
      const result = outcome.result;
      if (!outcome.replayed) await this.activation.recordArtifactAdvanced({
        organizationId: result.organizationId,
        artifactType: 'signature',
        artifactId: result.documentId,
        stage: 'signed',
        source: 'signature_recipient_signed',
      });
      return {
        recipientId: result.recipientId,
        documentId: result.documentId,
        completionQueued: result.completionQueued,
      };
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
    const outcome = await this.repository.decline(
      tokenHash,
      normalized || null,
      audit,
      publicSigningDeclineFingerprint(normalized || null),
    );
    if (outcome.kind !== 'ok') this.terminalFailure(outcome.kind);
    return outcome.result;
  }

  async file(
    token: string,
    request: SignatureFileDeliveryRequest = {},
  ): Promise<DeliveredSignatureFile> {
    const row = await this.repository.file(this.tokenHash(token));
    if (!row) throw this.notFound();
    const etag = signatureFileEtag(row.originalSha256);
    const filename = this.filename(row.fileName || 'document.pdf');
    if (signatureFileNotModified(request.ifNoneMatch, etag)) {
      const metadata = this.storage.head
        ? await this.storage.head(row.fileUrl)
        : await this.storage.read(row.fileUrl).then((buffer) =>
            buffer ? { totalLength: buffer.length } : null,
          );
      if (!metadata) {
        throw new NotFoundException({
          success: false,
          error: { message: 'File not found', code: 'NOT_FOUND' },
        });
      }
      return {
        buffer: Buffer.alloc(0),
        filename,
        etag,
        notModified: true,
        totalLength: metadata.totalLength,
        range: null,
      };
    }
    const range = signatureFileEffectiveRange(request, etag);
    const file = this.storage.readRange
      ? await this.storage.readRange(row.fileUrl, range)
      : await this.storage.read(row.fileUrl).then((buffer) =>
          buffer ? sliceSignatureFile(buffer, range) : null,
        );
    if (!file) {
      throw new NotFoundException({
        success: false,
        error: { message: 'File not found', code: 'NOT_FOUND' },
      });
    }
    return {
      ...file,
      filename,
      etag,
      notModified: false,
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

  private terminalFailure(kind: 'not-found' | 'conflict'): never {
    if (kind === 'not-found') throw this.notFound();
    if (kind === 'conflict') {
      throw new ConflictException({
        success: false,
        error: {
          message: 'This signing response has already been finalized',
          code: 'CONFLICT',
          reason: 'SIGNATURE_RESPONSE_FINALIZED',
        },
      });
    }
    throw new Error('Unknown public signing terminal outcome');
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
