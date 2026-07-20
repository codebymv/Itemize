import { Injectable } from '@nestjs/common';
import { ItemizeGraphqlErrorCode, itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  CreateRecurringInvoiceFromInvoiceInput,
  CreateRecurringInvoiceInput,
  RecurringInvoiceFilterInput,
  RecurringInvoiceItemInput,
  UpdateRecurringInvoiceInput,
} from './recurring-invoice.inputs';
import {
  DeleteRecurringInvoiceResult,
  RecurringInvoice,
  RecurringInvoiceGenerationResult,
  RecurringInvoiceHistoryPage,
  RecurringInvoiceItem,
  RecurringInvoicePage,
} from './recurring-invoice.types';
import {
  RecurringInvoiceCloneOutcome,
  RecurringInvoiceGenerationOutcome,
  RecurringInvoiceLifecycleOutcome,
  RecurringInvoiceItemValues,
  RecurringInvoiceRow,
  RecurringInvoiceUpdates,
  RecurringInvoiceValues,
  RecurringInvoiceWriteOutcome,
  RecurringInvoicesRepository,
} from './recurring-invoices.repository';

const MONEY = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const QUANTITY = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const RATE = /^(?:(?:0|[1-9]\d?)(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FREQUENCIES = new Set(['weekly', 'monthly', 'quarterly', 'yearly']);
const STATUSES = new Set(['active', 'paused', 'completed']);
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,128}$/;

@Injectable()
export class RecurringInvoicesService {
  constructor(private readonly recurringInvoices: RecurringInvoicesRepository) {}

  async list(
    organizationId: number,
    filter: RecurringInvoiceFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<RecurringInvoicePage> {
    const normalized = this.page(page);
    const status = filter.status === undefined || filter.status === 'all'
      ? undefined : this.status(filter.status);
    const result = await this.recurringInvoices.findPage({
      organizationId,
      ...(status === undefined ? {} : { status }),
      pageSize: normalized.pageSize,
      offset: normalized.offset,
    });
    return {
      nodes: result.rows.map((row) => this.map(row)),
      pageInfo: pageInfo(normalized.page, normalized.pageSize, result.total),
    };
  }

  async get(organizationId: number, recurringInvoiceId: number): Promise<RecurringInvoice> {
    this.id(recurringInvoiceId, 'id');
    const row = await this.recurringInvoices.findById(organizationId, recurringInvoiceId);
    if (!row) this.notFound();
    return this.map(row);
  }

  async previewInvoiceNumber(organizationId: number): Promise<string> {
    return this.recurringInvoices.previewInvoiceNumber(organizationId);
  }

  async create(
    organizationId: number,
    userId: number,
    input: CreateRecurringInvoiceInput,
  ): Promise<RecurringInvoice> {
    const values: RecurringInvoiceValues = {
      templateName: this.requiredText(input.templateName, 'templateName', 255),
      contactId: this.optionalId(input.contactId, 'contactId'),
      customerName: this.text(input.customerName, 'customerName', 255),
      customerEmail: this.email(input.customerEmail),
      frequency: this.frequency(input.frequency),
      startDate: this.date(input.startDate, 'startDate'),
      endDate: this.optionalDate(input.endDate, 'endDate'),
      items: this.items(input.items),
      discountType: this.discountType(input.discountType, input.discountValue),
      discountValue: this.decimal(input.discountValue, 'discountValue', MONEY),
      notes: this.text(input.notes, 'notes', 50_000),
      paymentTerms: this.text(input.paymentTerms, 'paymentTerms', 50),
    };
    return this.saved(await this.recurringInvoices.create(organizationId, userId, values));
  }

  async createFromInvoice(
    organizationId: number,
    userId: number,
    invoiceId: number,
    input: CreateRecurringInvoiceFromInvoiceInput,
  ): Promise<RecurringInvoice> {
    this.id(invoiceId, 'invoiceId');
    const values = {
      templateName: this.requiredText(input.templateName, 'templateName', 255),
      frequency: this.frequency(input.frequency),
      startDate: this.date(input.startDate, 'startDate'),
      endDate: this.optionalDate(input.endDate, 'endDate'),
    };
    if (values.endDate !== null && values.endDate < values.startDate) {
      throw itemizeGraphqlError(
        'endDate cannot be before startDate', 'BAD_USER_INPUT',
        { field: 'endDate', reason: 'INVALID_DATE_ORDER' },
      );
    }
    return this.cloned(await this.recurringInvoices.createFromInvoice(
      organizationId, userId, invoiceId, values,
    ));
  }

  async update(
    organizationId: number,
    recurringInvoiceId: number,
    input: UpdateRecurringInvoiceInput,
  ): Promise<RecurringInvoice> {
    this.id(recurringInvoiceId, 'id');
    if (input.items === null) this.nullField('items');
    if (input.discountValue === null) this.nullField('discountValue');
    const updates: RecurringInvoiceUpdates = {
      ...(this.has(input, 'templateName') ? {
        templateName: this.requiredText(input.templateName as string, 'templateName', 255),
      } : {}),
      ...(this.has(input, 'contactId') ? {
        contactId: this.optionalId(input.contactId, 'contactId'),
      } : {}),
      ...(this.has(input, 'customerName') ? {
        customerName: this.text(input.customerName, 'customerName', 255),
      } : {}),
      ...(this.has(input, 'customerEmail') ? {
        customerEmail: this.email(input.customerEmail),
      } : {}),
      ...(this.has(input, 'frequency') ? {
        frequency: this.frequency(input.frequency as string),
      } : {}),
      ...(input.endDate === undefined ? {} : {
        endDate: this.optionalDate(input.endDate, 'endDate'),
      }),
      ...(input.items === undefined ? {} : {
        items: this.items(input.items as RecurringInvoiceItemInput[]),
      }),
      ...(this.has(input, 'discountType') ? {
        discountType: this.discountType(input.discountType, input.discountValue ?? '0'),
      } : {}),
      ...(input.discountValue === undefined ? {} : {
        discountValue: this.decimal(input.discountValue as string, 'discountValue', MONEY),
      }),
      ...(this.has(input, 'notes') ? {
        notes: this.text(input.notes, 'notes', 50_000),
      } : {}),
      ...(this.has(input, 'paymentTerms') ? {
        paymentTerms: this.text(input.paymentTerms, 'paymentTerms', 50),
      } : {}),
    };
    return this.saved(await this.recurringInvoices.update(
      organizationId, recurringInvoiceId, updates,
    ));
  }

  async delete(
    organizationId: number,
    recurringInvoiceId: number,
  ): Promise<DeleteRecurringInvoiceResult> {
    this.id(recurringInvoiceId, 'id');
    const deleted = await this.recurringInvoices.delete(
      organizationId, recurringInvoiceId,
    );
    if (!deleted) this.notFound();
    return {
      success: true,
      deletedId: Number(deleted.id),
      templateName: deleted.template_name,
    };
  }

  async pause(
    organizationId: number,
    recurringInvoiceId: number,
  ): Promise<RecurringInvoice> {
    this.id(recurringInvoiceId, 'id');
    return this.lifecycle(
      await this.recurringInvoices.pause(organizationId, recurringInvoiceId),
      'active',
    );
  }

  async resume(
    organizationId: number,
    recurringInvoiceId: number,
  ): Promise<RecurringInvoice> {
    this.id(recurringInvoiceId, 'id');
    return this.lifecycle(
      await this.recurringInvoices.resume(organizationId, recurringInvoiceId),
      'paused',
    );
  }

  async generateNow(
    organizationId: number,
    userId: number,
    recurringInvoiceId: number,
    idempotencyKey: string,
  ): Promise<RecurringInvoiceGenerationResult> {
    this.id(recurringInvoiceId, 'id');
    const key = String(idempotencyKey ?? '').trim();
    if (!IDEMPOTENCY_KEY.test(key)) {
      throw itemizeGraphqlError(
        'idempotencyKey must be 1-128 safe ASCII characters',
        'BAD_USER_INPUT',
        { field: 'idempotencyKey', reason: 'INVALID_IDEMPOTENCY_KEY' },
      );
    }
    return this.generated(await this.recurringInvoices.generateNow(
      organizationId, userId, recurringInvoiceId, key,
    ));
  }

  async history(
    organizationId: number,
    recurringInvoiceId: number,
    page: PageInput = new PageInput(),
  ): Promise<RecurringInvoiceHistoryPage> {
    this.id(recurringInvoiceId, 'id');
    const normalized = this.page(page);
    const result = await this.recurringInvoices.findHistoryPage(
      organizationId,
      recurringInvoiceId,
      normalized.pageSize,
      normalized.offset,
    );
    if (result.kind === 'not-found') this.notFound();
    return {
      nodes: result.rows.map((row) => ({
        id: Number(row.id),
        invoiceNumber: row.invoice_number,
        total: row.total,
        status: row.status,
        createdAt: row.created_at,
      })),
      pageInfo: pageInfo(normalized.page, normalized.pageSize, result.total),
    };
  }

  private lifecycle(
    outcome: RecurringInvoiceLifecycleOutcome,
    expectedStatus: 'active' | 'paused',
  ): RecurringInvoice {
    if (outcome.kind === 'saved') return this.map(outcome.row);
    if (outcome.kind === 'not-found') this.notFound();
    throw itemizeGraphqlError(
      `Recurring invoice must be ${expectedStatus}`,
      'CONFLICT',
      {
        reason: expectedStatus === 'active'
          ? 'RECURRING_INVOICE_NOT_ACTIVE'
          : 'RECURRING_INVOICE_NOT_PAUSED',
        actualStatus: outcome.actualStatus,
      },
    );
  }

  private generated(
    outcome: RecurringInvoiceGenerationOutcome,
  ): RecurringInvoiceGenerationResult {
    if (outcome.kind === 'generated') return outcome.result;
    if (outcome.kind === 'not-found') this.notFound();
    if (outcome.kind === 'completed') {
      throw itemizeGraphqlError(
        'Cannot generate an invoice from a completed recurring invoice',
        'CONFLICT',
        { reason: 'RECURRING_INVOICE_COMPLETED', actualStatus: 'completed' },
      );
    }
    throw itemizeGraphqlError(
      'Recurring invoice contains invalid generation data',
      'BAD_USER_INPUT',
      { reason: 'INVALID_RECURRING_GENERATION_TEMPLATE' },
    );
  }

  private cloned(outcome: RecurringInvoiceCloneOutcome): RecurringInvoice {
    if (outcome.kind === 'saved') return this.map(outcome.row);
    if (outcome.kind === 'not-found') {
      throw itemizeGraphqlError('Invoice not found', 'NOT_FOUND', {
        reason: 'SOURCE_INVOICE_NOT_FOUND',
      });
    }
    if (outcome.kind === 'invalid-state') {
      throw itemizeGraphqlError(
        'Cancelled or refunded invoices cannot become recurring',
        'BAD_USER_INPUT',
        {
          reason: 'SOURCE_INVOICE_NOT_CONVERTIBLE',
          actualStatus: outcome.actualStatus,
        },
      );
    }
    const messages: Record<
      Exclude<RecurringInvoiceCloneOutcome['kind'], 'saved' | 'not-found' | 'invalid-state'>,
      [string, string]
    > = {
      'no-items': ['Invoice has no line items', 'SOURCE_INVOICE_HAS_NO_ITEMS'],
      'invalid-source': [
        'Invoice contains data that cannot be copied to a recurring template',
        'SOURCE_INVOICE_INVALID',
      ],
      'invalid-discount': [
        'Invoice discount cannot be copied to a recurring template',
        'SOURCE_INVOICE_DISCOUNT_INVALID',
      ],
      'negative-total': [
        'Invoice discount would make the recurring total negative',
        'SOURCE_INVOICE_NEGATIVE_TOTAL',
      ],
    };
    const [message, reason] = messages[outcome.kind];
    throw itemizeGraphqlError(message, 'BAD_USER_INPUT', { reason });
  }

  private saved(outcome: RecurringInvoiceWriteOutcome): RecurringInvoice {
    if (outcome.kind === 'saved') return this.map(outcome.row);
    const messages: Record<
      Exclude<RecurringInvoiceWriteOutcome['kind'], 'saved'>,
      [string, ItemizeGraphqlErrorCode]
    > = {
      'not-found': ['Recurring invoice not found', 'NOT_FOUND'],
      'contact-not-found': ['Contact not found', 'NOT_FOUND'],
      'product-not-found': ['Product not found', 'NOT_FOUND'],
      'invalid-date-order': ['endDate cannot be before startDate', 'BAD_USER_INPUT'],
      'invalid-discount': ['Recurring invoice discount is invalid', 'BAD_USER_INPUT'],
      'negative-total': ['Discount cannot make the recurring total negative', 'BAD_USER_INPUT'],
    };
    const [message, code] = messages[outcome.kind];
    throw itemizeGraphqlError(message, code, {
      reason: outcome.kind.replaceAll('-', '_').toUpperCase(),
    });
  }

  private items(inputs: RecurringInvoiceItemInput[]): RecurringInvoiceItemValues[] {
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 100) {
      throw itemizeGraphqlError(
        'items must contain between 1 and 100 line items', 'BAD_USER_INPUT',
        { field: 'items', reason: 'INVALID_RECURRING_ITEMS' },
      );
    }
    return inputs.map((input, index) => ({
      productId: this.optionalId(input.productId, `items.${index}.productId`),
      name: this.requiredText(input.name, `items.${index}.name`, 255),
      description: this.text(input.description, `items.${index}.description`, 10_000),
      quantity: this.positiveDecimal(
        input.quantity, `items.${index}.quantity`, QUANTITY,
      ),
      unitPrice: this.decimal(input.unitPrice, `items.${index}.unitPrice`, MONEY),
      taxRate: this.decimal(input.taxRate, `items.${index}.taxRate`, RATE),
    }));
  }

  private map(row: RecurringInvoiceRow): RecurringInvoice {
    return {
      id: Number(row.id),
      organizationId: Number(row.organization_id),
      templateName: row.template_name,
      contactId: row.contact_id === null ? null : Number(row.contact_id),
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      frequency: row.frequency,
      startDate: row.start_date,
      endDate: row.end_date,
      nextRunDate: row.next_run_date,
      lastGeneratedAt: row.last_generated_at,
      status: row.status,
      items: this.storedItems(row.items),
      subtotal: row.subtotal,
      taxAmount: row.tax_amount,
      discountAmount: row.discount_amount,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      total: row.total,
      currency: row.currency,
      notes: row.notes,
      paymentTerms: row.payment_terms,
      customFields: row.custom_fields ?? {},
      sourceInvoiceId: row.source_invoice_id === null
        ? null : Number(row.source_invoice_id),
      createdById: row.created_by === null ? null : Number(row.created_by),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contactFirstName: row.contact_first_name,
      contactLastName: row.contact_last_name,
      contactEmail: row.contact_email,
      sourceInvoiceNumber: row.source_invoice_number,
      invoicesGenerated: Number(row.invoices_generated),
    };
  }

  private storedItems(value: unknown): RecurringInvoiceItem[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const item = entry as Record<string, unknown>;
      const rawProductId = item.productId ?? item.product_id;
      const productId = Number(rawProductId);
      return [{
        productId: Number.isSafeInteger(productId) && productId > 0 ? productId : null,
        name: String(item.name ?? ''),
        description: item.description === undefined || item.description === null
          ? null : String(item.description),
        quantity: String(item.quantity ?? '1'),
        unitPrice: String(item.unitPrice ?? item.unit_price ?? '0'),
        taxRate: String(item.taxRate ?? item.tax_rate ?? '0'),
      }];
    });
  }

  private page(input: PageInput) {
    if (
      !Number.isInteger(input.page) || input.page < 1 ||
      !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100
    ) {
      throw itemizeGraphqlError('Invalid page input', 'BAD_USER_INPUT', {
        field: 'page', reason: 'INVALID_PAGE',
      });
    }
    return {
      page: input.page,
      pageSize: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    };
  }

  private status(value: string): string {
    if (!STATUSES.has(value)) {
      throw itemizeGraphqlError('status is invalid', 'BAD_USER_INPUT', {
        field: 'status', reason: 'INVALID_RECURRING_STATUS',
      });
    }
    return value;
  }

  private frequency(value: string): string {
    if (!FREQUENCIES.has(value)) {
      throw itemizeGraphqlError('frequency is invalid', 'BAD_USER_INPUT', {
        field: 'frequency', reason: 'INVALID_RECURRING_FREQUENCY',
      });
    }
    return value;
  }

  private optionalId(value: number | null | undefined, field: string): number | null {
    if (value === undefined || value === null) return null;
    return this.id(value, field);
  }

  private id(value: number, field: string): number {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(`${field} is invalid`, 'BAD_USER_INPUT', {
        field, reason: 'INVALID_RECURRING_ID',
      });
    }
    return value;
  }

  private requiredText(value: string, field: string, max: number): string {
    const normalized = String(value ?? '').trim();
    if (normalized.length < 1 || normalized.length > max) {
      throw itemizeGraphqlError(`${field} is invalid`, 'BAD_USER_INPUT', {
        field, reason: 'INVALID_RECURRING_TEXT',
      });
    }
    return normalized;
  }

  private text(
    value: string | null | undefined,
    field: string,
    max: number,
  ): string | null {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    if (normalized.length === 0) return null;
    if (normalized.length > max) {
      throw itemizeGraphqlError(`${field} is too long`, 'BAD_USER_INPUT', {
        field, reason: 'INVALID_RECURRING_TEXT',
      });
    }
    return normalized;
  }

  private email(value: string | null | undefined): string | null {
    const normalized = this.text(value, 'customerEmail', 255);
    if (normalized !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw itemizeGraphqlError('customerEmail is invalid', 'BAD_USER_INPUT', {
        field: 'customerEmail', reason: 'INVALID_RECURRING_EMAIL',
      });
    }
    return normalized;
  }

  private decimal(value: string, field: string, pattern: RegExp): string {
    const normalized = String(value).trim();
    if (!pattern.test(normalized)) {
      throw itemizeGraphqlError(`${field} is invalid`, 'BAD_USER_INPUT', {
        field, reason: 'INVALID_RECURRING_DECIMAL',
      });
    }
    return normalized;
  }

  private positiveDecimal(value: string, field: string, pattern: RegExp): string {
    const normalized = this.decimal(value, field, pattern);
    if (Number(normalized) <= 0) {
      throw itemizeGraphqlError(`${field} must be positive`, 'BAD_USER_INPUT', {
        field, reason: 'INVALID_RECURRING_QUANTITY',
      });
    }
    return normalized;
  }

  private discountType(
    value: string | null | undefined,
    discountValue: string,
  ): string | null {
    const amount = this.decimal(discountValue, 'discountValue', MONEY);
    if (value === undefined || value === null || value === '') {
      if (Number(amount) === 0) return null;
      throw itemizeGraphqlError(
        'discountType is required for a non-zero discount', 'BAD_USER_INPUT',
        { field: 'discountType', reason: 'RECURRING_DISCOUNT_TYPE_REQUIRED' },
      );
    }
    if (!['fixed', 'percent'].includes(value)) {
      throw itemizeGraphqlError('discountType is invalid', 'BAD_USER_INPUT', {
        field: 'discountType', reason: 'INVALID_RECURRING_DISCOUNT_TYPE',
      });
    }
    if (value === 'percent' && Number(amount) > 100) {
      throw itemizeGraphqlError('discountValue is invalid', 'BAD_USER_INPUT', {
        field: 'discountValue', reason: 'INVALID_RECURRING_DISCOUNT_VALUE',
      });
    }
    return value;
  }

  private optionalDate(value: string | null | undefined, field: string): string | null {
    if (value === undefined || value === null || value === '') return null;
    return this.date(value, field);
  }

  private date(value: string, field: string): string {
    const normalized = String(value).trim();
    if (!DATE.test(normalized)) this.invalidDate(field);
    const [year, month, day] = normalized.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) this.invalidDate(field);
    return normalized;
  }

  private invalidDate(field: string): never {
    throw itemizeGraphqlError(`${field} is invalid`, 'BAD_USER_INPUT', {
      field, reason: 'INVALID_RECURRING_DATE',
    });
  }

  private nullField(field: string): never {
    throw itemizeGraphqlError(`${field} cannot be null`, 'BAD_USER_INPUT', {
      field, reason: 'INVALID_RECURRING_NULL',
    });
  }

  private has(value: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  private notFound(): never {
    throw itemizeGraphqlError('Recurring invoice not found', 'NOT_FOUND', {
      reason: 'RECURRING_INVOICE_NOT_FOUND',
    });
  }
}
