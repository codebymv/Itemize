import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import { SendSocialMessageInput, UpdateSocialConversationInput } from './social.inputs';
import {
  SOCIAL_MESSAGE_PROVIDER,
  SocialMessageProvider,
  SocialProviderResult,
} from './social-message.provider';
import {
  SocialChannelRow,
  SocialConversationRow,
  SocialMessageRow,
  SocialRepository,
} from './social.repository';
import {
  DisconnectSocialChannelResult,
  SocialAnalytics,
  SocialChannel,
  SocialConversation,
  SocialConversationPage,
  SocialMessage,
  SocialMessageDelivery,
} from './social.types';

const CHANNEL_TYPES = new Set([
  'facebook',
  'instagram',
  'whatsapp',
  'twitter',
]);
const STATUSES = new Set(['open', 'closed', 'pending', 'spam']);
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type ListInput = {
  channelId?: number;
  channelType?: string;
  status?: string;
  assignedTo?: number;
  page?: number;
  limit?: number;
};

@Injectable()
export class SocialService {
  constructor(
    private readonly repository: SocialRepository,
    @Inject(SOCIAL_MESSAGE_PROVIDER)
    private readonly provider: SocialMessageProvider,
  ) {}

  async channels(
    organizationId: number,
    channelType?: string,
  ): Promise<SocialChannel[]> {
    const type =
      channelType === undefined
        ? undefined
        : this.channelType(channelType, 'channelType');
    try {
      return (await this.repository.listChannels(organizationId, type)).map(
        this.mapChannel,
      );
    } catch (error) {
      this.rethrow(error, 'Social channels are unavailable');
    }
  }

  async disconnectChannel(
    organizationId: number,
    channelId: number,
  ): Promise<DisconnectSocialChannelResult> {
    this.id(channelId, 'channelId');
    try {
      if (!(await this.repository.disconnectChannel(organizationId, channelId))) {
        throw itemizeGraphqlError('Social channel not found', 'NOT_FOUND');
      }
      return { success: true };
    } catch (error) {
      this.rethrow(error, 'Social channel could not be disconnected');
    }
  }

  async conversations(
    organizationId: number,
    input: ListInput,
  ): Promise<SocialConversationPage> {
    const page = this.id(input.page ?? 1, 'page');
    const limit = this.limit(input.limit ?? 20);
    const filters = {
      page,
      limit,
      ...(input.channelId === undefined
        ? {}
        : { channelId: this.id(input.channelId, 'channelId') }),
      ...(input.channelType === undefined
        ? {}
        : {
            channelType: this.channelType(
              input.channelType,
              'channelType',
            ),
          }),
      ...(!input.status || input.status === 'all'
        ? {}
        : { status: this.status(input.status) }),
      ...(input.assignedTo === undefined
        ? {}
        : { assignedTo: this.id(input.assignedTo, 'assignedTo') }),
    };
    try {
      const result = await this.repository.listConversations(
        organizationId,
        filters,
      );
      return {
        conversations: result.rows.map(this.mapConversation),
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      };
    } catch (error) {
      this.rethrow(error, 'Social conversations are unavailable');
    }
  }

  async conversation(
    organizationId: number,
    conversationId: number,
  ): Promise<SocialConversation> {
    this.id(conversationId, 'conversationId');
    try {
      return this.detail(
        await this.repository.findConversation(organizationId, conversationId),
      );
    } catch (error) {
      this.rethrow(error, 'Social conversation is unavailable');
    }
  }

  async openConversation(
    organizationId: number,
    conversationId: number,
  ): Promise<SocialConversation> {
    this.id(conversationId, 'conversationId');
    try {
      return this.detail(
        await this.repository.openConversation(organizationId, conversationId),
      );
    } catch (error) {
      this.rethrow(error, 'Social conversation could not be opened');
    }
  }

  async updateConversation(
    organizationId: number,
    conversationId: number,
    input: UpdateSocialConversationInput,
  ): Promise<SocialConversation> {
    this.id(conversationId, 'conversationId');
    if (
      input.status === undefined &&
      input.assignedTo === undefined &&
      input.contactId === undefined &&
      input.tags === undefined
    ) {
      this.bad(
        'Social conversation update must include at least one field',
        'input',
        'EMPTY_SOCIAL_CONVERSATION_UPDATE',
      );
    }
    const values = {
      ...(input.status === undefined ? {} : { status: this.status(input.status) }),
      ...(input.assignedTo === undefined
        ? {}
        : {
            assignedTo:
              input.assignedTo === null
                ? null
                : this.id(input.assignedTo, 'input.assignedTo'),
          }),
      ...(input.contactId === undefined
        ? {}
        : {
            contactId:
              input.contactId === null
                ? null
                : this.id(input.contactId, 'input.contactId'),
          }),
      ...(input.tags === undefined ? {} : { tags: this.tags(input.tags) }),
    };
    try {
      const outcome = await this.repository.updateConversation(
        organizationId,
        conversationId,
        values,
      );
      if (outcome.kind === 'conversation_not_found') {
        throw itemizeGraphqlError('Social conversation not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'assignee_not_found') {
        this.bad(
          'Assignee is not a member of this organization',
          'input.assignedTo',
          'INVALID_ASSIGNEE',
        );
      }
      if (outcome.kind === 'contact_not_found') {
        this.bad(
          'Contact does not belong to this organization',
          'input.contactId',
          'INVALID_CONTACT',
        );
      }
      return this.mapConversation(outcome.row);
    } catch (error) {
      this.rethrow(error, 'Social conversation could not be updated');
    }
  }

  async analytics(
    organizationId: number,
    period: number,
  ): Promise<SocialAnalytics> {
    if (!Number.isSafeInteger(period) || period < 1 || period > 365) {
      this.bad(
        'period must be between 1 and 365 days',
        'period',
        'INVALID_SOCIAL_ANALYTICS_PERIOD',
      );
    }
    try {
      const rows = await this.repository.analytics(organizationId, period);
      return {
        period,
        channels: rows.channels.map((row) => ({
          channelType: row.channel_type,
          conversationCount: Number(row.conversation_count),
          messageCount: Number(row.message_count),
          inboundCount: Number(row.inbound_count),
          outboundCount: Number(row.outbound_count),
        })),
        averageResponseTimeMinutes: rows.averageResponseMinutes,
        messagesOverTime: rows.messagesOverTime.map((row) => ({
          date: new Date(row.date),
          inbound: Number(row.inbound),
          outbound: Number(row.outbound),
        })),
        statusDistribution: rows.statusDistribution.map((row) => ({
          status: row.status,
          count: Number(row.count),
        })),
      };
    } catch (error) {
      this.rethrow(error, 'Social analytics are unavailable');
    }
  }

  async sendMessage(
    organizationId: number,
    userId: number,
    conversationId: number,
    input: SendSocialMessageInput,
  ): Promise<SocialMessageDelivery> {
    this.id(conversationId, 'conversationId');
    const text = String(input.text ?? '').trim();
    if (!text || text.length > 2_000) {
      this.bad(
        'input.text must contain between 1 and 2000 characters',
        'input.text',
        'INVALID_SOCIAL_MESSAGE',
      );
    }
    const idempotencyKey = String(input.idempotencyKey ?? '').trim();
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      this.bad(
        'input.idempotencyKey must be 1-128 safe ASCII characters',
        'input.idempotencyKey',
        'INVALID_IDEMPOTENCY_KEY',
      );
    }
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ conversationId, text }))
      .digest('hex');
    try {
      const outcome = await this.repository.enqueueDelivery({
        organizationId,
        userId,
        conversationId,
        text,
        idempotencyKey,
        fingerprint,
      });
      if (outcome.kind === 'conversation_not_found') {
        throw itemizeGraphqlError('Social conversation not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'channel_unavailable') {
        throw itemizeGraphqlError(
          'The social channel is not connected for outbound messaging',
          'CONFLICT',
          { reason: 'SOCIAL_CHANNEL_UNAVAILABLE' },
        );
      }
      if (outcome.kind === 'key_conflict') {
        throw itemizeGraphqlError(
          'idempotencyKey was already used for a different message',
          'CONFLICT',
          { reason: 'IDEMPOTENCY_KEY_REUSED' },
        );
      }
      return {
        id: Number(outcome.job.id),
        status: outcome.job.status,
        accepted: true,
        replayed: outcome.kind === 'replayed',
        message: this.mapMessage(outcome.message),
        createdAt: new Date(outcome.job.created_at),
      };
    } catch (error) {
      this.rethrow(error, 'Social message could not be queued');
    }
  }

  async runDue(limit = 100): Promise<{
    attempted: number;
    accepted: number;
    rejected: number;
    reconciliationRequired: number;
  }> {
    const due = await this.repository.dueDeliveryIds(
      Math.max(1, Math.min(limit, 500)),
    );
    let accepted = 0;
    let rejected = 0;
    let reconciliationRequired = 0;
    for (const candidate of due) {
      const job = await this.repository.claimDelivery(
        candidate.organizationId,
        candidate.id,
      );
      if (!job) continue;
      if (
        !job.is_connected ||
        !job.page_id ||
        !job.page_access_token ||
        !['facebook', 'instagram'].includes(job.channel_type)
      ) {
        await this.repository.rejectDelivery(
          job.organization_id,
          job.id,
          'Social channel is not connected for outbound messaging',
        );
        rejected += 1;
        continue;
      }
      let result: SocialProviderResult;
      try {
        result = await this.provider.send({
          pageId: job.page_id,
          participantId: job.participant_id,
          accessToken: job.page_access_token,
          text: job.text_content,
        });
      } catch {
        await this.repository.requireReconciliation(
          job.organization_id,
          job.id,
          'Meta provider outcome is unknown and requires reconciliation',
        );
        reconciliationRequired += 1;
        continue;
      }
      if (result.kind === 'accepted') {
        try {
          await this.repository.completeDelivery(
            job.organization_id,
            job.id,
            result.providerId,
          );
          accepted += 1;
        } catch {
          await this.repository.requireReconciliation(
            job.organization_id,
            job.id,
            'Meta accepted the message but local completion requires reconciliation',
          );
          reconciliationRequired += 1;
        }
      } else if (result.kind === 'rejected') {
        await this.repository.rejectDelivery(
          job.organization_id,
          job.id,
          result.message,
        );
        rejected += 1;
      } else {
        await this.repository.requireReconciliation(
          job.organization_id,
          job.id,
          result.message,
        );
        reconciliationRequired += 1;
      }
    }
    return {
      attempted: due.length,
      accepted,
      rejected,
      reconciliationRequired,
    };
  }

  private detail(
    result: {
      conversation: SocialConversationRow;
      messages: SocialMessageRow[];
    } | null,
  ): SocialConversation {
    if (!result) {
      throw itemizeGraphqlError('Social conversation not found', 'NOT_FOUND');
    }
    return {
      ...this.mapConversation(result.conversation),
      messages: result.messages.map(this.mapMessage),
    };
  }

  private readonly mapChannel = (row: SocialChannelRow): SocialChannel => ({
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    channelType: row.channel_type,
    externalId: row.external_id,
    name: row.name,
    username: row.username,
    profilePictureUrl: row.profile_picture_url,
    pageId: row.page_id,
    instagramBusinessAccountId: row.instagram_business_account_id,
    permissions: row.permissions ?? [],
    isActive: row.is_active === true,
    isConnected: row.is_connected === true,
    connectionError: row.connection_error,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null,
    webhookVerified: row.webhook_verified === true,
    createdBy: row.created_by === null ? null : Number(row.created_by),
    createdByName: row.created_by_name,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });

  private readonly mapConversation = (
    row: SocialConversationRow,
  ): SocialConversation => ({
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    channelId: Number(row.channel_id),
    threadId: row.thread_id,
    participantId: row.participant_id,
    participantName: row.participant_name,
    participantUsername: row.participant_username,
    participantProfilePic: row.participant_profile_pic,
    contactId: row.contact_id === null ? null : Number(row.contact_id),
    status: row.status,
    assignedTo: row.assigned_to === null ? null : Number(row.assigned_to),
    assignedToName: row.assigned_to_name,
    unreadCount: Number(row.unread_count),
    messageCount: Number(row.message_count),
    lastMessageText: row.last_message_text,
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : null,
    lastMessageFrom: row.last_message_from,
    tags: row.tags ?? [],
    channelType: row.channel_type,
    channelName: row.channel_name,
    contactFirstName: row.contact_first_name,
    contactLastName: row.contact_last_name,
    contactEmail: row.contact_email,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });

  private readonly mapMessage = (row: SocialMessageRow): SocialMessage => ({
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    conversationId: Number(row.conversation_id),
    channelId: Number(row.channel_id),
    externalMessageId: row.external_message_id,
    messageType: row.message_type,
    textContent: row.text_content,
    mediaUrl: row.media_url,
    mediaType: row.media_type,
    mediaFilename: row.media_filename,
    direction: row.direction,
    senderId: row.sender_id,
    senderName: row.sender_name,
    sentBy: row.sent_by === null ? null : Number(row.sent_by),
    sentByName: row.sent_by_name,
    status: row.status,
    errorMessage: row.error_message,
    messageTimestamp: new Date(row.message_timestamp),
    readAt: row.read_at ? new Date(row.read_at) : null,
    createdAt: new Date(row.created_at),
  });

  private channelType(value: string, field: string): string {
    if (!CHANNEL_TYPES.has(value)) {
      this.bad(
        `${field} must be facebook, instagram, whatsapp, or twitter`,
        field,
        'INVALID_SOCIAL_CHANNEL_TYPE',
      );
    }
    return value;
  }

  private status(value: string): string {
    if (!STATUSES.has(value)) {
      this.bad(
        'status must be open, closed, pending, or spam',
        'input.status',
        'INVALID_SOCIAL_CONVERSATION_STATUS',
      );
    }
    return value;
  }

  private tags(values: string[]): string[] {
    if (!Array.isArray(values) || values.length > 50) {
      this.bad('input.tags cannot contain more than 50 tags', 'input.tags', 'INVALID_TAGS');
    }
    const tags = values.map((value) => String(value).trim());
    if (
      tags.some((value) => !value || value.length > 64) ||
      new Set(tags).size !== tags.length
    ) {
      this.bad(
        'input.tags must contain unique values between 1 and 64 characters',
        'input.tags',
        'INVALID_TAGS',
      );
    }
    return tags;
  }

  private id(value: number, field: string): number {
    if (!Number.isSafeInteger(value) || value < 1) {
      this.bad(`${field} must be a positive integer`, field, 'INVALID_ID');
    }
    return value;
  }

  private limit(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
      this.bad('limit must be between 1 and 100', 'limit', 'INVALID_LIMIT');
    }
    return value;
  }

  private bad(message: string, field: string, reason: string): never {
    throw itemizeGraphqlError(message, 'BAD_USER_INPUT', { field, reason });
  }

  private rethrow(error: unknown, message: string): never {
    if (error instanceof GraphQLError) throw error;
    throw itemizeGraphqlError(message, 'SERVICE_UNAVAILABLE');
  }
}
