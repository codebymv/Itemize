import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { SendBulkReputationRequestsInput, SendReputationRequestInput } from './reputation-request.inputs';
import {
  REPUTATION_EMAIL_PROVIDER,
  REPUTATION_SMS_PROVIDER,
  ReputationEmailProvider,
  ReputationSmsProvider,
} from './reputation-request-delivery.providers';
import {
  NormalizedBulkRequest,
  NormalizedSendRequest,
  ReputationDeliveryPreparation,
  ReputationDeliverySnapshot,
  ReputationRequestChannel,
  ReputationRequestDeliveryRepository,
} from './reputation-request-delivery.repository';
import {
  ReputationRequestDeliveryBatchStatus,
  ReputationRequestDeliveryResult,
} from './reputation-request.types';
import { ReputationRequestsRepository } from './reputation-requests.repository';
import { ReputationRequestsService } from './reputation-requests.service';

const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLATFORM = new Set(['google', 'facebook', 'yelp', 'trustpilot', 'g2', 'capterra', 'custom']);

@Injectable()
export class ReputationRequestDeliveryService {
  constructor(
    private readonly deliveries: ReputationRequestDeliveryRepository,
    private readonly requestsRepository: ReputationRequestsRepository,
    private readonly requestsService: ReputationRequestsService,
    @Inject(REPUTATION_EMAIL_PROVIDER) private readonly email: ReputationEmailProvider,
    @Inject(REPUTATION_SMS_PROVIDER) private readonly sms: ReputationSmsProvider,
  ) {}

  async send(
    organizationId: number,
    userId: number,
    input: SendReputationRequestInput,
  ): Promise<ReputationRequestDeliveryResult> {
    const normalized = this.single(input);
    const prepared = await this.deliveries.prepareSend(organizationId, userId, normalized);
    const snapshot = this.prepared(prepared);
    if (normalized.scheduledAt === null) await this.attemptSnapshot(snapshot);
    return this.result(organizationId, snapshot.batch.id, prepared.kind === 'replayed');
  }

  async bulk(
    organizationId: number,
    userId: number,
    input: SendBulkReputationRequestsInput,
  ): Promise<ReputationRequestDeliveryResult> {
    const normalized = this.bulkInput(input);
    const prepared = await this.deliveries.prepareBulk(organizationId, userId, normalized);
    const snapshot = this.prepared(prepared);
    return this.result(organizationId, snapshot.batch.id, prepared.kind === 'replayed');
  }

  async resend(
    organizationId: number,
    userId: number,
    requestId: number,
    idempotencyKey: string,
  ): Promise<ReputationRequestDeliveryResult> {
    this.id(requestId);
    const key = this.key(idempotencyKey);
    const fingerprint = this.fingerprint({ operation: 'resend', requestId });
    const prepared = await this.deliveries.prepareResend(
      organizationId, userId, requestId, key, fingerprint,
    );
    const snapshot = this.prepared(prepared);
    await this.attemptSnapshot(snapshot);
    return this.result(organizationId, snapshot.batch.id, prepared.kind === 'replayed');
  }

  async runDue(limit = 100): Promise<{ attempted: number; sent: number }> {
    const due = await this.deliveries.due(Math.max(1, Math.min(limit, 500)));
    let sent = 0;
    for (const delivery of due) {
      if (await this.attempt(delivery.organizationId, delivery.id)) sent += 1;
    }
    return { attempted: due.length, sent };
  }

  private async attemptSnapshot(snapshot: ReputationDeliverySnapshot): Promise<void> {
    for (const delivery of snapshot.deliveries) {
      await this.attempt(Number(delivery.organization_id), Number(delivery.id));
    }
  }

  private async attempt(organizationId: number, deliveryId: number): Promise<boolean> {
    const claimed = await this.deliveries.claim(organizationId, deliveryId);
    if (!claimed) return false;
    try {
      const provider = claimed.channel === 'email'
        ? await this.email.send({
          to: claimed.recipient,
          subject: claimed.subject || 'We would love your feedback',
          text: claimed.payload.message,
          idempotencyKey: `review-request-email:${organizationId}:${claimed.id}`,
        })
        : await this.sms.send({ to: claimed.recipient, message: claimed.payload.message });
      if (provider.kind === 'rejected') {
        await this.deliveries.fail(
          organizationId, deliveryId, this.redact(provider.message, claimed.recipient), false,
        );
        return false;
      }
      await this.deliveries.complete(organizationId, deliveryId, provider.providerId);
      return true;
    } catch (error) {
      await this.deliveries.fail(
        organizationId,
        deliveryId,
        this.redact(error instanceof Error ? error.message : 'Unknown provider failure', claimed.recipient),
        claimed.channel === 'sms',
      );
      return false;
    }
  }

  private async result(
    organizationId: number,
    batchId: number,
    replayed: boolean,
  ): Promise<ReputationRequestDeliveryResult> {
    const snapshot = await this.deliveries.findSnapshot(organizationId, batchId);
    if (!snapshot) throw new Error('Review request delivery batch disappeared');
    const requestIds = [...new Set(snapshot.deliveries.map((delivery) => Number(delivery.review_request_id)))];
    const rows = await this.requestsRepository.findByIds(organizationId, requestIds);
    if (rows.length !== requestIds.length) throw new Error('Review request delivery lost a request');
    const sent = requestIds.filter((requestId) => {
      const items = snapshot.deliveries.filter((delivery) => Number(delivery.review_request_id) === requestId);
      return items.length > 0 && items.every((delivery) => delivery.status === 'sent');
    }).length;
    return {
      batchId: Number(snapshot.batch.id),
      status: snapshot.batch.status as ReputationRequestDeliveryBatchStatus,
      replayed,
      accepted: requestIds.length,
      sent,
      requests: rows.map((row) => this.requestsService.map(row)),
    };
  }

  private single(input: SendReputationRequestInput): NormalizedSendRequest {
    const key = this.key(input.idempotencyKey);
    const contactId = input.contactId === undefined ? null : this.id(input.contactId);
    const email = this.optional(input.contactEmail, 254)?.toLowerCase() ?? null;
    if (email && !EMAIL.test(email)) this.invalid('contactEmail', 'INVALID_REVIEW_REQUEST_EMAIL');
    const phone = input.contactPhone === undefined ? null : this.phone(input.contactPhone);
    if (contactId === null && email === null && phone === null) {
      this.invalid('contact', 'REVIEW_REQUEST_CONTACT_REQUIRED');
    }
    const channel = this.channel(input.channel);
    const customMessage = this.optional(input.customMessage, 1600) ?? null;
    const preferredPlatform = this.platform(input.preferredPlatform);
    const redirectUrl = this.url(input.redirectUrl);
    const scheduledAt = this.scheduled(input.scheduledAt);
    const normalized = {
      contactId, contactEmail: email, contactPhone: phone,
      contactName: this.optional(input.contactName, 255) ?? null,
      channel, customMessage, preferredPlatform, redirectUrl, scheduledAt,
    };
    return { idempotencyKey: key, fingerprint: this.fingerprint(normalized), ...normalized };
  }

  private bulkInput(input: SendBulkReputationRequestsInput): NormalizedBulkRequest {
    const key = this.key(input.idempotencyKey);
    if (!Array.isArray(input.contactIds) || input.contactIds.length === 0 || input.contactIds.length > 100) {
      this.invalid('contactIds', 'REVIEW_REQUEST_CONTACT_COUNT_INVALID');
    }
    const contactIds = [...new Set(input.contactIds.map((id) => this.id(id)))].sort((a, b) => a - b);
    const normalized = {
      contactIds,
      channel: this.channel(input.channel),
      customMessage: this.optional(input.customMessage, 1600) ?? null,
      preferredPlatform: this.platform(input.preferredPlatform),
    };
    return { idempotencyKey: key, fingerprint: this.fingerprint(normalized), ...normalized };
  }

  private prepared(prepared: ReputationDeliveryPreparation): ReputationDeliverySnapshot {
    if (prepared.kind === 'created' || prepared.kind === 'replayed') return prepared.snapshot;
    if (prepared.kind === 'key_conflict') {
      throw itemizeGraphqlError('idempotencyKey was already used for different review-request delivery', 'CONFLICT', {
        field: 'idempotencyKey', reason: 'REVIEW_REQUEST_IDEMPOTENCY_CONFLICT',
      });
    }
    if (prepared.kind === 'contact_not_found') {
      throw itemizeGraphqlError('One or more contacts were not found', 'NOT_FOUND', {
        reason: 'REVIEW_REQUEST_CONTACT_NOT_FOUND', contactIds: prepared.contactIds,
      });
    }
    if (prepared.kind === 'missing_recipient') {
      throw itemizeGraphqlError(`A ${prepared.channel} recipient is required`, 'BAD_USER_INPUT', {
        field: prepared.channel === 'email' ? 'contactEmail' : 'contactPhone',
        reason: 'REVIEW_REQUEST_RECIPIENT_REQUIRED', contactIds: prepared.contactIds,
      });
    }
    if (prepared.kind === 'request_not_found') {
      throw itemizeGraphqlError('Review request not found', 'NOT_FOUND', {
        reason: 'REVIEW_REQUEST_NOT_FOUND',
      });
    }
    if (prepared.kind === 'delivery_in_progress') {
      throw itemizeGraphqlError('Review request already has an unresolved delivery', 'CONFLICT', {
        reason: 'REVIEW_REQUEST_DELIVERY_IN_PROGRESS',
      });
    }
    if (prepared.kind === 'invalid_state') {
      throw itemizeGraphqlError('Review request cannot be resent in its current state', 'CONFLICT', {
        reason: 'REVIEW_REQUEST_RESEND_INVALID_STATE', actualStatus: prepared.status,
      });
    }
    throw new Error(`Unhandled review request delivery preparation: ${prepared.kind}`);
  }

  private key(value: string): string {
    const key = String(value ?? '').trim();
    if (!KEY.test(key)) this.invalid('idempotencyKey', 'INVALID_IDEMPOTENCY_KEY');
    return key;
  }

  private id(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
      this.invalid('id', 'INVALID_REVIEW_REQUEST_ID');
    }
    return value;
  }

  private channel(value: string): ReputationRequestChannel {
    const channel = String(value ?? '').trim().toLowerCase();
    if (!['email', 'sms', 'both'].includes(channel)) this.invalid('channel', 'INVALID_REVIEW_REQUEST_CHANNEL');
    return channel as ReputationRequestChannel;
  }

  private optional(value: string | undefined, max: number): string | undefined {
    if (value === undefined) return undefined;
    const normalized = String(value).trim();
    if (!normalized) return undefined;
    if (normalized.length > max) this.invalid('input', 'REVIEW_REQUEST_VALUE_TOO_LONG');
    return normalized;
  }

  private platform(value?: string): string | null {
    const platform = this.optional(value, 50)?.toLowerCase();
    if (!platform) return null;
    if (!PLATFORM.has(platform)) this.invalid('preferredPlatform', 'INVALID_REVIEW_REQUEST_PLATFORM');
    return platform;
  }

  private phone(value: string): string {
    const compact = String(value).trim().replace(/[^\d+]/g, '');
    const normalized = compact.startsWith('+') ? compact
      : compact.length === 10 ? `+1${compact}`
        : compact.length === 11 && compact.startsWith('1') ? `+${compact}` : `+${compact}`;
    if (!/^\+[1-9]\d{6,14}$/.test(normalized)) this.invalid('contactPhone', 'INVALID_REVIEW_REQUEST_PHONE');
    return normalized;
  }

  private url(value?: string): string | null {
    const normalized = this.optional(value, 2048);
    if (!normalized) return null;
    try {
      const url = new URL(normalized);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
      return url.toString();
    } catch { return this.invalid('redirectUrl', 'INVALID_REVIEW_REQUEST_REDIRECT'); }
  }

  private scheduled(value?: Date): Date | null {
    if (value === undefined) return null;
    const date = value instanceof Date ? value : new Date(value);
    const now = Date.now();
    if (Number.isNaN(date.getTime()) || date.getTime() <= now || date.getTime() > now + 365 * 86_400_000) {
      this.invalid('scheduledAt', 'INVALID_REVIEW_REQUEST_SCHEDULE');
    }
    return date;
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private redact(message: string, recipient: string): string {
    return String(message || 'Provider failure').split(recipient).join('[recipient]');
  }

  private invalid(field: string, reason: string): never {
    throw itemizeGraphqlError('Review request delivery input is invalid', 'BAD_USER_INPUT', { field, reason });
  }
}
