import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';
import { SignatureDocumentsService } from '../signature-documents/signature-documents.service';
import { SignatureDocument } from '../signature-documents/signature-document.types';
import {
  SIGNATURE_FILE_STORAGE,
  SignatureFileStorage,
} from '../signature-files/signature-file-storage.provider';
import { inspectSignaturePdf } from '../signature-files/signature-pdf.validator';
import { renderSignaturePreviewEmail } from './signature-delivery.email';
import { SignatureEmailPreviewInput } from './signature-delivery.inputs';
import {
  SignatureDeliveryRepository,
  SignatureDeliveryActionOutcome,
  SignatureDeliveryStateError,
} from './signature-delivery.repository';
import {
  SignatureDeliveryAction,
  signatureDeliveryActionFingerprint,
  signatureDeliveryActionKey,
} from './signature-delivery-action.idempotency';
import {
  SignatureEmailPreview,
  SignatureReminderSchedule,
} from './signature-delivery.types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const frontendOrigin = (): string => {
  const fallback = process.env.NODE_ENV === 'production'
    ? 'https://itemize.cloud'
    : 'http://localhost:5173';
  try {
    const configured = new URL(process.env.FRONTEND_URL ?? fallback);
    return configured.protocol === 'http:' || configured.protocol === 'https:'
      ? configured.origin
      : fallback;
  } catch {
    return fallback;
  }
};

@Injectable()
export class SignatureDeliveryService {
  constructor(
    private readonly repository: SignatureDeliveryRepository,
    private readonly documents: SignatureDocumentsService,
    @Inject(SIGNATURE_FILE_STORAGE)
    private readonly storage: SignatureFileStorage,
  ) {}

  async send(
    organizationId: number,
    id: number,
    userId: number,
    idempotencyKey: string,
  ): Promise<SignatureDocument> {
    await this.access(organizationId);
    this.id(id);
    const key = signatureDeliveryActionKey(idempotencyKey);
    const fingerprint = signatureDeliveryActionFingerprint('send', id);
    try {
      const source = await this.repository.preflightSource(organizationId, id);
      let inspection: { fileUrl: string; originalSha256: string; pageCount: number } | undefined;
      if (source?.status === 'draft' && source.fileUrl && !source.pageCount) {
        const pdf = await this.storage.read(source.fileUrl);
        if (!pdf) {
          throw new SignatureDeliveryStateError(
            'The PDF is unavailable. Upload it again before sending',
            'SIGNATURE_DOCUMENT_FILE_UNAVAILABLE',
          );
        }
        inspection = {
          fileUrl: source.fileUrl,
          originalSha256: createHash('sha256').update(pdf).digest('hex'),
          pageCount: (await inspectSignaturePdf(pdf)).pageCount,
        };
      }
      const outcome = await this.repository.enqueueInitial(
        organizationId,
        id,
        userId,
        key,
        fingerprint,
        inspection,
      );
      this.assertActionOutcome(outcome, 'send');
    } catch (error) {
      this.deliveryError(error);
    }
    return (await this.documents.detail(organizationId, id)).document;
  }

  async remind(
    organizationId: number,
    id: number,
    userId: number,
    idempotencyKey: string,
  ): Promise<SignatureDocument> {
    await this.access(organizationId);
    this.id(id);
    const key = signatureDeliveryActionKey(idempotencyKey);
    const fingerprint = signatureDeliveryActionFingerprint('remind', id);
    try {
      const outcome = await this.repository.enqueueReminder(
        organizationId,
        id,
        userId,
        key,
        fingerprint,
      );
      this.assertActionOutcome(outcome, 'remind');
    } catch (error) {
      this.deliveryError(error);
    }
    return (await this.documents.detail(organizationId, id)).document;
  }

  async retry(
    organizationId: number,
    id: number,
    userId: number,
    idempotencyKey: string,
  ): Promise<SignatureDocument> {
    await this.access(organizationId);
    this.id(id);
    const key = signatureDeliveryActionKey(idempotencyKey);
    const fingerprint = signatureDeliveryActionFingerprint('retry', id);
    try {
      const outcome = await this.repository.retryFailures(
        organizationId,
        id,
        userId,
        key,
        fingerprint,
      );
      this.assertActionOutcome(outcome, 'retry');
    } catch (error) {
      this.deliveryError(error);
    }
    return (await this.documents.detail(organizationId, id)).document;
  }

  async schedule(
    organizationId: number,
    id: number,
    days: number,
    userId: number,
  ): Promise<SignatureReminderSchedule> {
    await this.access(organizationId);
    this.id(id);
    if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
      throw this.bad(
        'Reminder days must be an integer between 1 and 365',
        'days',
        'INVALID_SIGNATURE_REMINDER_DAYS',
      );
    }
    try {
      const result = await this.repository.scheduleReminders(organizationId, id, days, userId);
      if (!result) {
        throw itemizeGraphqlError('Active signature document not found', 'NOT_FOUND');
      }
      return result;
    } catch (error) {
      this.deliveryError(error);
    }
  }

  async preview(
    organizationId: number,
    input: SignatureEmailPreviewInput,
  ): Promise<SignatureEmailPreview> {
    await this.access(organizationId);
    const message = this.required(input.message, 'message', 50_000);
    const documentTitle = this.optional(input.documentTitle, 'documentTitle', 255);
    const senderName = this.optional(input.senderName, 'senderName', 255);
    const senderEmail = this.optional(input.senderEmail, 'senderEmail', 255);
    const recipientName = this.optional(input.recipientName, 'recipientName', 255);
    if (senderEmail !== null && !EMAIL.test(senderEmail)) {
      throw this.bad('senderEmail is invalid', 'senderEmail', 'INVALID_SIGNATURE_SENDER_EMAIL');
    }

    return renderSignaturePreviewEmail({
      to: '',
      recipientName,
      documentTitle: documentTitle || 'Document',
      senderName,
      senderEmail,
      message,
      expiresAt: input.expiresAt?.toISOString() ?? null,
    }, `${frontendOrigin()}/sign/preview`);
  }

  private required(value: string, field: string, max: number): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      throw this.bad(
        'Message content is required',
        field,
        'EMPTY_SIGNATURE_EMAIL_MESSAGE',
      );
    }
    if (normalized.length > max) {
      throw this.bad(
        'Message content is too long',
        field,
        'SIGNATURE_EMAIL_MESSAGE_TOO_LONG',
      );
    }
    return normalized;
  }

  private optional(
    value: string | null | undefined,
    field: string,
    max: number,
  ): string | null {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    if (!normalized) return null;
    if (normalized.length > max) {
      throw this.bad(
        `${field} is too long`,
        field,
        `SIGNATURE_EMAIL_${field.toUpperCase()}_TOO_LONG`,
      );
    }
    return normalized;
  }

  private bad(message: string, field: string, reason: string) {
    return itemizeGraphqlError(message, 'BAD_USER_INPUT', { field, reason });
  }

  private async access(organizationId: number): Promise<void> {
    if (!(await this.repository.hasFeatureAccess(organizationId))) {
      throw itemizeGraphqlError('E-Signatures require an upgrade.', 'FORBIDDEN', {
        reason: 'FEATURE_NOT_AVAILABLE',
      });
    }
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw this.bad('id must be a positive integer', 'id', 'INVALID_SIGNATURE_DOCUMENT_ID');
    }
  }

  private assertActionOutcome(
    outcome: SignatureDeliveryActionOutcome,
    action: SignatureDeliveryAction,
  ): void {
    if (outcome.kind === 'not_found') {
      throw itemizeGraphqlError('Signature document not found', 'NOT_FOUND');
    }
    if (outcome.kind === 'idempotency_conflict') {
      throw itemizeGraphqlError(
        `idempotencyKey was already used for a different signature ${action} request`,
        'CONFLICT',
        { field: 'idempotencyKey', reason: 'IDEMPOTENCY_KEY_REUSED' },
      );
    }
    if (outcome.kind === 'idempotency_result_unavailable') {
      throw itemizeGraphqlError(
        'The signature document from this request is no longer available',
        'CONFLICT',
        { field: 'idempotencyKey', reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE' },
      );
    }
  }

  private deliveryError(error: unknown): never {
    if (error instanceof SignatureDeliveryStateError) {
      throw itemizeGraphqlError(error.message, 'CONFLICT', { reason: error.reason });
    }
    throw error;
  }
}
