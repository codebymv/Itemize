import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  CreateConversationInput,
  SendConversationMessageInput,
  UpdateConversationInput,
} from './conversation.inputs';
import {
  Conversation,
  ConversationMessage,
  ConversationPage,
} from './conversation.types';
import {
  ConversationMessageRow,
  ConversationRow,
  ConversationsRepository,
} from './conversations.repository';
import {
  conversationCreationFingerprint,
  conversationCreationKey,
} from './conversation-creation.idempotency';
import {
  conversationMessageFingerprint,
  conversationMessageKey,
} from './conversation-message.idempotency';

const CONVERSATION_STATUSES = new Set(['open', 'closed', 'snoozed']);

type ListInput = {
  status?: string;
  channel?: string;
  assignedTo?: number;
  contactId?: number;
  page?: number;
  limit?: number;
};

@Injectable()
export class ConversationsService {
  constructor(private readonly conversations: ConversationsRepository) {}

  async list(
    organizationId: number,
    input: ListInput,
  ): Promise<ConversationPage> {
    const page = this.page(input.page ?? 1);
    const limit = this.limit(input.limit ?? 50);
    const status =
      !input.status || input.status === 'all'
        ? undefined
        : this.status(input.status);
    const channel = !input.channel || input.channel === 'all'
      ? undefined
      : this.text(input.channel, 'channel', 50);
    const assignedTo =
      input.assignedTo === undefined
        ? undefined
        : this.id(input.assignedTo, 'assignedTo');
    const contactId =
      input.contactId === undefined
        ? undefined
        : this.id(input.contactId, 'contactId');
    try {
      const result = await this.conversations.findAll(organizationId, {
        status,
        channel,
        assignedTo,
        contactId,
        page,
        limit,
      });
      return {
        conversations: result.conversations.map(this.mapConversation),
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  async get(
    organizationId: number,
    conversationId: number,
  ): Promise<Conversation> {
    this.id(conversationId, 'id');
    try {
      const result = await this.conversations.findById(
        organizationId,
        conversationId,
      );
      if (!result) {
        throw itemizeGraphqlError('Conversation not found', 'NOT_FOUND');
      }
      return {
        ...this.mapConversation(result.conversation),
        messages: result.messages.map(this.mapMessage),
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  async create(
    organizationId: number,
    userId: number,
    input: CreateConversationInput,
    idempotencyKey: string,
  ): Promise<Conversation> {
    const contactId = this.id(input.contactId, 'contactId');
    const subject = this.nullableText(input.subject, 'subject', 500);
    const channel = this.text(input.channel ?? 'internal', 'channel', 50);
    const initialMessage = this.nullableText(
      input.initialMessage,
      'initialMessage',
      100_000,
    );
    try {
      const values = {
        contactId,
        subject,
        channel,
        initialMessage,
      };
      const outcome = await this.conversations.create(
        organizationId,
        userId,
        values,
        conversationCreationKey(idempotencyKey),
        conversationCreationFingerprint(values),
      );
      if (outcome.kind === 'idempotency-conflict') {
        throw itemizeGraphqlError(
          'idempotencyKey was already used for a different conversation creation request',
          'CONFLICT',
          { field: 'idempotencyKey', reason: 'IDEMPOTENCY_KEY_REUSED' },
        );
      }
      if (outcome.kind === 'result-unavailable') {
        throw itemizeGraphqlError(
          'The conversation created by this request is no longer available',
          'CONFLICT',
          { field: 'idempotencyKey', reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE' },
        );
      }
      if (outcome.kind === 'contact_not_found') {
        throw itemizeGraphqlError('Contact not found', 'NOT_FOUND');
      }
      return this.mapConversation(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async update(
    organizationId: number,
    conversationId: number,
    input: UpdateConversationInput,
  ): Promise<Conversation> {
    this.id(conversationId, 'id');
    if (input.status === undefined && input.snoozedUntil === undefined) {
      throw itemizeGraphqlError(
        'Conversation update must include at least one field',
        'BAD_USER_INPUT',
        { reason: 'EMPTY_CONVERSATION_UPDATE' },
      );
    }
    const status =
      input.status === undefined ? undefined : this.status(input.status);
    const snoozedUntil =
      input.snoozedUntil === undefined
        ? status !== undefined && status !== 'snoozed'
          ? null
          : undefined
        : this.date(input.snoozedUntil, 'snoozedUntil');
    if (status === 'snoozed' && !snoozedUntil) {
      throw itemizeGraphqlError(
        'snoozedUntil is required when snoozing a conversation',
        'BAD_USER_INPUT',
        { field: 'snoozedUntil', reason: 'SNOOZE_DATE_REQUIRED' },
      );
    }
    try {
      const row = await this.conversations.update(
        organizationId,
        conversationId,
        {
          ...(status === undefined ? {} : { status }),
          ...(snoozedUntil === undefined ? {} : { snoozedUntil }),
        },
      );
      if (!row) {
        throw itemizeGraphqlError('Conversation not found', 'NOT_FOUND');
      }
      return this.mapConversation(row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async assign(
    organizationId: number,
    conversationId: number,
    assignedTo: number | null,
  ): Promise<Conversation> {
    this.id(conversationId, 'id');
    const assignee =
      assignedTo === null ? null : this.id(assignedTo, 'assignedTo');
    try {
      const outcome = await this.conversations.assign(
        organizationId,
        conversationId,
        assignee,
      );
      if (outcome.kind === 'conversation_not_found') {
        throw itemizeGraphqlError('Conversation not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'assignee_not_found') {
        throw itemizeGraphqlError(
          'Assignee is not a member of this organization',
          'BAD_USER_INPUT',
          { field: 'assignedTo', reason: 'INVALID_ASSIGNEE' },
        );
      }
      return this.mapConversation(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async markRead(
    organizationId: number,
    conversationId: number,
  ): Promise<Conversation> {
    this.id(conversationId, 'id');
    try {
      const row = await this.conversations.markRead(
        organizationId,
        conversationId,
      );
      if (!row) {
        throw itemizeGraphqlError('Conversation not found', 'NOT_FOUND');
      }
      return this.mapConversation(row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async sendMessage(
    organizationId: number,
    userId: number,
    conversationId: number,
    input: SendConversationMessageInput,
    idempotencyKey: string,
  ): Promise<ConversationMessage> {
    this.id(conversationId, 'conversationId');
    const content = this.text(input.content, 'content', 100_000);
    const channel = this.text(input.channel ?? 'internal', 'channel', 50);
    const contentHtml = this.nullableText(
      input.contentHtml,
      'contentHtml',
      250_000,
    );
    const metadata = this.record(input.metadata ?? {}, 'metadata');
    try {
      const values = { content, channel, contentHtml, metadata };
      const outcome = await this.conversations.sendMessage(
        organizationId,
        userId,
        conversationId,
        values,
        conversationMessageKey(idempotencyKey),
        conversationMessageFingerprint(conversationId, values),
      );
      if (outcome.kind === 'idempotency-conflict') {
        throw itemizeGraphqlError(
          'idempotencyKey was already used for a different conversation message',
          'CONFLICT',
          { field: 'idempotencyKey', reason: 'IDEMPOTENCY_KEY_REUSED' },
        );
      }
      if (outcome.kind === 'result-unavailable') {
        throw itemizeGraphqlError(
          'The conversation message created by this request is no longer available',
          'CONFLICT',
          { field: 'idempotencyKey', reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE' },
        );
      }
      if (outcome.kind === 'conversation_not_found') {
        throw itemizeGraphqlError('Conversation not found', 'NOT_FOUND');
      }
      return this.mapMessage(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  private id(value: number, field: string): number {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        `${field} must be a positive integer`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_ID' },
      );
    }
    return value;
  }

  private page(value: number): number {
    return this.id(value, 'page');
  }

  private limit(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
      throw itemizeGraphqlError(
        'limit must be between 1 and 100',
        'BAD_USER_INPUT',
        { field: 'limit', reason: 'INVALID_LIMIT' },
      );
    }
    return value;
  }

  private status(value: string): string {
    if (!CONVERSATION_STATUSES.has(value)) {
      throw itemizeGraphqlError(
        'status must be open, closed, or snoozed',
        'BAD_USER_INPUT',
        { field: 'status', reason: 'INVALID_CONVERSATION_STATUS' },
      );
    }
    return value;
  }

  private text(value: string, field: string, max: number): string {
    const normalized = value?.trim();
    if (!normalized || normalized.length > max) {
      throw itemizeGraphqlError(
        `${field} must contain between 1 and ${max} characters`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_CONVERSATION_FIELD' },
      );
    }
    return normalized;
  }

  private nullableText(
    value: string | null | undefined,
    field: string,
    max: number,
  ): string | null {
    if (value === null || value === undefined || value.trim() === '') {
      return null;
    }
    if (value.length > max) {
      throw itemizeGraphqlError(
        `${field} cannot exceed ${max} characters`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_CONVERSATION_FIELD' },
      );
    }
    return value.trim();
  }

  private date(value: Date | null, field: string): Date | null {
    if (value === null) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw itemizeGraphqlError(
        `${field} must be a valid timestamp`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_DATE' },
      );
    }
    return parsed;
  }

  private record(
    value: unknown,
    field: string,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw itemizeGraphqlError(
        `${field} must be an object`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_METADATA' },
      );
    }
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > 64 * 1024) {
      throw itemizeGraphqlError(
        `${field} cannot exceed 64 KiB`,
        'BAD_USER_INPUT',
        { field, reason: 'METADATA_TOO_LARGE' },
      );
    }
    return value as Record<string, unknown>;
  }

  private readonly mapConversation = (row: ConversationRow): Conversation => ({
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    contactId: row.contact_id === null ? null : Number(row.contact_id),
    assignedTo: row.assigned_to === null ? null : Number(row.assigned_to),
    assignedToName: row.assigned_to_name,
    status: row.status,
    snoozedUntil: row.snoozed_until
      ? new Date(row.snoozed_until)
      : null,
    channel: row.channel,
    subject: row.subject,
    lastMessageAt: row.last_message_at
      ? new Date(row.last_message_at)
      : null,
    lastMessagePreview: row.last_message_preview,
    unreadCount: Number(row.unread_count),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    contactFirstName: row.contact_first_name,
    contactLastName: row.contact_last_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    socialConversationId:
      row.social_conversation_id === null ? null : Number(row.social_conversation_id),
    providerAccountName: row.provider_account_name,
    providerParticipantName: row.provider_participant_name,
    providerParticipantUsername: row.provider_participant_username,
    providerParticipantProfilePic: row.provider_participant_profile_pic,
    chatSessionId:
      row.chat_session_id === null ? null : Number(row.chat_session_id),
    chatSessionStatus: row.chat_session_status,
    chatVisitorName: row.chat_visitor_name,
    chatVisitorEmail: row.chat_visitor_email,
    chatVisitorPhone: row.chat_visitor_phone,
    chatWidgetName: row.chat_widget_name,
  });

  private readonly mapMessage = (
    row: ConversationMessageRow,
  ): ConversationMessage => ({
    id: Number(row.id),
    conversationId: Number(row.conversation_id),
    organizationId: Number(row.organization_id),
    senderType: row.sender_type,
    senderUserId:
      row.sender_user_id === null ? null : Number(row.sender_user_id),
    senderContactId:
      row.sender_contact_id === null ? null : Number(row.sender_contact_id),
    senderUserName: row.sender_user_name,
    senderContactFirstName: row.sender_contact_first_name,
    senderContactLastName: row.sender_contact_last_name,
    channel: row.channel,
    content: row.content,
    contentHtml: row.content_html,
    metadata:
      row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    isRead: row.is_read === true,
    createdAt: new Date(row.created_at),
  });

  private rethrow(error: unknown): never {
    if (error instanceof GraphQLError) throw error;
    throw itemizeGraphqlError(
      'Conversation service is unavailable',
      'SERVICE_UNAVAILABLE',
    );
  }
}
