import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import {
  ChatWidgetConfigInput,
  SendAgentChatMessageInput,
} from './chat-widget.inputs';
import {
  ChatMessageRow,
  ChatSessionRow,
  ChatWidgetRepository,
  ChatWidgetRow,
  ChatWidgetValues,
} from './chat-widget.repository';
import {
  ChatAgentMessageDelivery,
  ChatMessage,
  ChatSession,
  ChatSessionPage,
  ChatWidgetConfig,
  ChatWidgetEmbedCode,
  ConvertChatSessionResult,
} from './chat-widget.types';

const POSITIONS = new Set([
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
]);
const SESSION_STATUSES = new Set(['active', 'ended', 'converted']);
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DAYS = new Set([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

@Injectable()
export class ChatWidgetService {
  constructor(private readonly repository: ChatWidgetRepository) {}

  async widget(organizationId: number): Promise<ChatWidgetConfig | null> {
    try {
      const row = await this.repository.getWidget(organizationId);
      return row ? this.mapWidget(row) : null;
    } catch (error) {
      this.rethrow(error, 'Chat widget configuration is unavailable');
    }
  }

  async createWidget(
    organizationId: number,
    input: ChatWidgetConfigInput,
  ): Promise<ChatWidgetConfig> {
    const values = this.values(input, false);
    try {
      const outcome = await this.repository.createWidget(
        organizationId,
        values,
      );
      if (outcome.kind === 'already_exists') {
        throw itemizeGraphqlError(
          'A chat widget already exists for this organization',
          'CONFLICT',
          { reason: 'CHAT_WIDGET_ALREADY_EXISTS' },
        );
      }
      if (outcome.kind === 'assignee_not_found') {
        this.bad(
          'Default assignee is not a member of this organization',
          'input.defaultAssignedTo',
          'INVALID_ASSIGNEE',
        );
      }
      if (outcome.kind !== 'ok') {
        throw itemizeGraphqlError('Chat widget could not be created', 'SERVICE_UNAVAILABLE');
      }
      return this.mapWidget(outcome.row);
    } catch (error) {
      this.rethrow(error, 'Chat widget could not be created');
    }
  }

  async updateWidget(
    organizationId: number,
    input: ChatWidgetConfigInput,
  ): Promise<ChatWidgetConfig> {
    const values = this.values(input, true);
    if (Object.keys(values).length === 0) {
      this.bad(
        'Chat widget update must include at least one field',
        'input',
        'EMPTY_CHAT_WIDGET_UPDATE',
      );
    }
    try {
      const outcome = await this.repository.updateWidget(
        organizationId,
        values,
      );
      if (outcome.kind === 'not_found') {
        throw itemizeGraphqlError('Chat widget not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'assignee_not_found') {
        this.bad(
          'Default assignee is not a member of this organization',
          'input.defaultAssignedTo',
          'INVALID_ASSIGNEE',
        );
      }
      if (outcome.kind !== 'ok') {
        throw itemizeGraphqlError('Chat widget could not be updated', 'SERVICE_UNAVAILABLE');
      }
      return this.mapWidget(outcome.row);
    } catch (error) {
      this.rethrow(error, 'Chat widget could not be updated');
    }
  }

  async embedCode(organizationId: number): Promise<ChatWidgetEmbedCode> {
    try {
      const widget = await this.repository.getWidget(organizationId);
      if (!widget) throw itemizeGraphqlError('Chat widget not found', 'NOT_FOUND');
      const origin = this.frontendOrigin();
      const source = JSON.stringify(`${origin}/widget.js`);
      const key = JSON.stringify(widget.widget_key);
      return {
        widgetKey: widget.widget_key,
        embedCode: `<!-- Itemize Chat Widget -->
<script>
(function(w,d,s,o,f,js,fjs){
w['ItemizeChat']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
js=d.createElement(s),fjs=d.getElementsByTagName(s)[0];
js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
}(window,document,'script','ichat',${source}));
ichat('init', ${key});
</script>`,
      };
    } catch (error) {
      this.rethrow(error, 'Chat widget embed code is unavailable');
    }
  }

  async sessions(
    organizationId: number,
    input: { status?: string; page?: number; limit?: number },
  ): Promise<ChatSessionPage> {
    const page = this.id(input.page ?? 1, 'page');
    const limit = this.limit(input.limit ?? 50);
    let status: string | null = null;
    if (input.status && input.status !== 'all') {
      if (!SESSION_STATUSES.has(input.status)) {
        this.bad(
          'status must be active, ended, converted, or all',
          'status',
          'INVALID_CHAT_SESSION_STATUS',
        );
      }
      status = input.status;
    }
    try {
      const result = await this.repository.listSessions(
        organizationId,
        status,
        page,
        limit,
      );
      return {
        sessions: result.rows.map(this.mapSession),
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      };
    } catch (error) {
      this.rethrow(error, 'Chat sessions are unavailable');
    }
  }

  async session(
    organizationId: number,
    sessionId: number,
  ): Promise<ChatSession> {
    this.id(sessionId, 'sessionId');
    try {
      const result = await this.repository.getSession(
        organizationId,
        sessionId,
      );
      if (!result) throw itemizeGraphqlError('Chat session not found', 'NOT_FOUND');
      return {
        ...this.mapSession(result.session),
        messages: result.messages.map(this.mapMessage),
      };
    } catch (error) {
      this.rethrow(error, 'Chat session is unavailable');
    }
  }

  async sendAgentMessage(
    organizationId: number,
    userId: number,
    sessionId: number,
    input: SendAgentChatMessageInput,
  ): Promise<ChatAgentMessageDelivery> {
    this.id(sessionId, 'sessionId');
    const content = String(input.content ?? '').trim();
    if (!content || content.length > 5_000) {
      this.bad(
        'input.content must contain between 1 and 5000 characters',
        'input.content',
        'INVALID_CHAT_MESSAGE',
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
    try {
      const outcome = await this.repository.sendAgentMessage(
        organizationId,
        userId,
        sessionId,
        content,
        idempotencyKey,
      );
      if (outcome.kind === 'session_not_found') {
        throw itemizeGraphqlError(
          'Active chat session not found',
          'NOT_FOUND',
        );
      }
      if (outcome.kind === 'key_conflict') {
        throw itemizeGraphqlError(
          'idempotencyKey was already used for a different chat message',
          'CONFLICT',
          { reason: 'IDEMPOTENCY_KEY_REUSED' },
        );
      }
      return { replayed: outcome.replayed, message: this.mapMessage(outcome.row) };
    } catch (error) {
      this.rethrow(error, 'Chat message could not be sent');
    }
  }

  async convertSession(
    organizationId: number,
    userId: number,
    sessionId: number,
  ): Promise<ConvertChatSessionResult> {
    this.id(sessionId, 'sessionId');
    try {
      const outcome = await this.repository.convertSession(
        organizationId,
        userId,
        sessionId,
      );
      if (outcome.kind === 'session_not_found') {
        throw itemizeGraphqlError('Chat session not found', 'NOT_FOUND');
      }
      if (outcome.kind === 'already_converted') {
        throw itemizeGraphqlError(
          'Chat session was already converted',
          'CONFLICT',
          { reason: 'CHAT_SESSION_ALREADY_CONVERTED' },
        );
      }
      return {
        success: true,
        contactId: outcome.contactId,
        conversationId: outcome.conversationId,
      };
    } catch (error) {
      this.rethrow(error, 'Chat session could not be converted');
    }
  }

  private values(
    input: ChatWidgetConfigInput,
    partial: boolean,
  ): ChatWidgetValues {
    const values: ChatWidgetValues = {};
    const include = (key: keyof ChatWidgetConfigInput) =>
      !partial || input[key] !== undefined;
    if (include('name') && input.name !== undefined) {
      values.name = this.text(input.name, 'input.name', 1, 255);
    }
    if (include('primaryColor') && input.primaryColor !== undefined) {
      values.primaryColor = this.color(input.primaryColor, 'input.primaryColor');
    }
    if (include('textColor') && input.textColor !== undefined) {
      values.textColor = this.color(input.textColor, 'input.textColor');
    }
    if (include('position') && input.position !== undefined) {
      if (!POSITIONS.has(input.position)) {
        this.bad(
          'input.position is invalid',
          'input.position',
          'INVALID_CHAT_WIDGET_POSITION',
        );
      }
      values.position = input.position;
    }
    if (include('iconStyle') && input.iconStyle !== undefined) {
      values.iconStyle = this.text(input.iconStyle, 'input.iconStyle', 1, 20);
    }
    if (include('customIconUrl')) {
      values.customIconUrl =
        input.customIconUrl == null
          ? null
          : this.httpUrl(input.customIconUrl, 'input.customIconUrl');
    }
    for (const [key, field, max] of [
      ['welcomeTitle', 'input.welcomeTitle', 255],
      ['welcomeMessage', 'input.welcomeMessage', 5_000],
      ['placeholderText', 'input.placeholderText', 255],
      ['offlineMessage', 'input.offlineMessage', 5_000],
    ] as const) {
      const value = input[key];
      if (include(key) && value !== undefined) {
        values[key] = this.text(value, field, 1, max);
      }
    }
    for (const key of [
      'requireEmail',
      'requireName',
      'requirePhone',
      'isActive',
      'showBranding',
      'notificationSound',
      'autoAssignAvailable',
    ] as const) {
      if (include(key) && input[key] !== undefined) values[key] = input[key];
    }
    if (include('customFields') && input.customFields !== undefined) {
      values.customFields = this.customFields(input.customFields);
    }
    if (include('autoOpenDelay') && input.autoOpenDelay !== undefined) {
      if (
        !Number.isSafeInteger(input.autoOpenDelay) ||
        input.autoOpenDelay < 0 ||
        input.autoOpenDelay > 86_400
      ) {
        this.bad(
          'input.autoOpenDelay must be between 0 and 86400 seconds',
          'input.autoOpenDelay',
          'INVALID_AUTO_OPEN_DELAY',
        );
      }
      values.autoOpenDelay = input.autoOpenDelay;
    }
    if (include('businessHours')) {
      values.businessHours =
        input.businessHours == null
          ? null
          : this.businessHours(input.businessHours);
    }
    if (include('defaultAssignedTo')) {
      values.defaultAssignedTo =
        input.defaultAssignedTo == null
          ? null
          : this.id(input.defaultAssignedTo, 'input.defaultAssignedTo');
    }
    if (include('allowedDomains') && input.allowedDomains !== undefined) {
      values.allowedDomains = this.allowedDomains(input.allowedDomains);
    }
    return values;
  }

  private customFields(value: unknown): unknown[] {
    if (!Array.isArray(value) || value.length > 20) {
      this.bad(
        'input.customFields must be an array of at most 20 fields',
        'input.customFields',
        'INVALID_CUSTOM_FIELDS',
      );
    }
    const identifiers = new Set<string>();
    for (const item of value) {
      if (!this.isRecord(item)) {
        this.bad(
          'Each custom field must be an object',
          'input.customFields',
          'INVALID_CUSTOM_FIELDS',
        );
      }
      const id = String(item.id ?? '').trim();
      const label = String(item.label ?? '').trim();
      const type = String(item.type ?? '');
      if (
        !id ||
        id.length > 64 ||
        identifiers.has(id) ||
        !label ||
        label.length > 100 ||
        !['text', 'email', 'phone', 'select'].includes(type) ||
        typeof item.required !== 'boolean'
      ) {
        this.bad(
          'Custom field definitions are invalid',
          'input.customFields',
          'INVALID_CUSTOM_FIELDS',
        );
      }
      identifiers.add(id);
      if (type === 'select') {
        if (
          !Array.isArray(item.options) ||
          item.options.length < 1 ||
          item.options.length > 50 ||
          item.options.some(
            (option) =>
              typeof option !== 'string' ||
              !option.trim() ||
              option.length > 100,
          )
        ) {
          this.bad(
            'Select custom fields require 1-50 options',
            'input.customFields',
            'INVALID_CUSTOM_FIELDS',
          );
        }
      }
    }
    this.jsonSize(value, 'input.customFields', 16_384);
    return value;
  }

  private businessHours(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!this.isRecord(value)) {
      this.bad(
        'input.businessHours must be an object',
        'input.businessHours',
        'INVALID_BUSINESS_HOURS',
      );
    }
    for (const [day, hours] of Object.entries(value)) {
      if (!DAYS.has(day) || hours === null) continue;
      if (!this.isRecord(hours)) {
        this.bad(
          'Business-hour entries must be objects or null',
          'input.businessHours',
          'INVALID_BUSINESS_HOURS',
        );
      }
      if (hours.closed === true) continue;
      if (
        typeof hours.start !== 'string' ||
        typeof hours.end !== 'string' ||
        !TIME.test(hours.start) ||
        !TIME.test(hours.end) ||
        hours.start >= hours.end
      ) {
        this.bad(
          'Business hours require a valid start before end',
          'input.businessHours',
          'INVALID_BUSINESS_HOURS',
        );
      }
    }
    this.jsonSize(value, 'input.businessHours', 4_096);
    return value;
  }

  private allowedDomains(values: string[]): string[] {
    if (!Array.isArray(values) || values.length > 50) {
      this.bad(
        'input.allowedDomains cannot contain more than 50 domains',
        'input.allowedDomains',
        'INVALID_ALLOWED_DOMAINS',
      );
    }
    const normalized = values.map((value) => String(value).trim().toLowerCase());
    if (
      normalized.some(
        (value) =>
          !value ||
          value.length > 253 ||
          /[\u0000-\u001f\u007f\s]/.test(value),
      ) ||
      new Set(normalized).size !== normalized.length
    ) {
      this.bad(
        'input.allowedDomains must contain unique bounded domain values',
        'input.allowedDomains',
        'INVALID_ALLOWED_DOMAINS',
      );
    }
    return normalized;
  }

  private readonly mapWidget = (row: ChatWidgetRow): ChatWidgetConfig => ({
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    widgetKey: row.widget_key,
    name: row.name,
    primaryColor: row.primary_color,
    textColor: row.text_color,
    position: row.position,
    iconStyle: row.icon_style,
    customIconUrl: row.custom_icon_url,
    welcomeTitle: row.welcome_title,
    welcomeMessage: row.welcome_message,
    placeholderText: row.placeholder_text,
    requireEmail: row.require_email === true,
    requireName: row.require_name === true,
    requirePhone: row.require_phone === true,
    customFields: row.custom_fields ?? [],
    isActive: row.is_active === true,
    autoOpenDelay: Number(row.auto_open_delay),
    showBranding: row.show_branding === true,
    notificationSound: row.notification_sound === true,
    businessHours: row.business_hours,
    offlineMessage: row.offline_message,
    defaultAssignedTo:
      row.default_assigned_to === null
        ? null
        : Number(row.default_assigned_to),
    autoAssignAvailable: row.auto_assign_available === true,
    totalConversations: Number(row.total_conversations),
    totalMessages: Number(row.total_messages),
    allowedDomains: row.allowed_domains ?? [],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });

  private readonly mapSession = (row: ChatSessionRow): ChatSession => ({
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    widgetId: Number(row.widget_id),
    visitorName: row.visitor_name,
    visitorEmail: row.visitor_email,
    visitorPhone: row.visitor_phone,
    customData: row.custom_data ?? {},
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    referrerUrl: row.referrer_url,
    currentPageUrl: row.current_page_url,
    country: row.country,
    city: row.city,
    timezone: row.timezone,
    contactId: row.contact_id === null ? null : Number(row.contact_id),
    conversationId:
      row.conversation_id === null ? null : Number(row.conversation_id),
    status: row.status,
    isOnline: row.is_online === true,
    lastSeenAt: new Date(row.last_seen_at),
    startedAt: new Date(row.started_at),
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
    widgetName: row.widget_name,
    unreadCount:
      row.unread_count == null ? null : Number(row.unread_count),
    lastMessage: row.last_message,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });

  private readonly mapMessage = (row: ChatMessageRow): ChatMessage => ({
    id: Number(row.id),
    sessionId: Number(row.session_id),
    organizationId: Number(row.organization_id),
    senderType: row.sender_type,
    senderUserId:
      row.sender_user_id === null ? null : Number(row.sender_user_id),
    content: row.content,
    contentType: row.content_type,
    attachmentUrl: row.attachment_url,
    attachmentName: row.attachment_name,
    attachmentSize:
      row.attachment_size === null ? null : Number(row.attachment_size),
    isRead: row.is_read === true,
    readAt: row.read_at ? new Date(row.read_at) : null,
    agentName: row.agent_name,
    createdAt: new Date(row.created_at),
  });

  private frontendOrigin(): string {
    try {
      const url = new URL(process.env.FRONTEND_URL || 'https://itemize.cloud');
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      return url.origin;
    } catch {
      throw itemizeGraphqlError(
        'Chat widget frontend origin is not configured',
        'SERVICE_UNAVAILABLE',
      );
    }
  }

  private text(
    value: string,
    field: string,
    min: number,
    max: number,
  ): string {
    const normalized = String(value ?? '').trim();
    if (normalized.length < min || normalized.length > max) {
      this.bad(
        `${field} must contain between ${min} and ${max} characters`,
        field,
        'INVALID_TEXT',
      );
    }
    return normalized;
  }

  private color(value: string, field: string): string {
    const normalized = String(value ?? '').trim();
    if (!/^#[0-9a-f]{6}$/i.test(normalized)) {
      this.bad(`${field} must be a six-digit hex color`, field, 'INVALID_COLOR');
    }
    return normalized.toUpperCase();
  }

  private httpUrl(value: string, field: string): string {
    const normalized = String(value ?? '').trim();
    if (!normalized || normalized.length > 500) {
      this.bad(`${field} must be a bounded URL`, field, 'INVALID_URL');
    }
    try {
      const url = new URL(normalized);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      return url.toString();
    } catch {
      this.bad(`${field} must be an HTTP(S) URL`, field, 'INVALID_URL');
    }
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
    );
  }

  private jsonSize(value: unknown, field: string, max: number): void {
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      this.bad(`${field} must be JSON serializable`, field, 'INVALID_JSON');
    }
    if (Buffer.byteLength(serialized, 'utf8') > max) {
      this.bad(`${field} is too large`, field, 'TOO_LARGE');
    }
  }

  private bad(message: string, field: string, reason: string): never {
    throw itemizeGraphqlError(message, 'BAD_USER_INPUT', { field, reason });
  }

  private rethrow(error: unknown, message: string): never {
    if (error instanceof GraphQLError) throw error;
    throw itemizeGraphqlError(message, 'SERVICE_UNAVAILABLE');
  }
}
