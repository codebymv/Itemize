import { Injectable } from '@nestjs/common';
import {
  ItemizeGraphqlErrorCode,
  itemizeGraphqlError,
} from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  CreateInvoiceInput,
  InvoiceFilterInput,
  InvoiceItemInput,
  UpdateInvoiceInput,
} from './invoice.inputs';
import {
  DeleteInvoiceResult,
  Invoice,
  InvoiceItem,
  InvoicePage,
} from './invoice.types';
import {
  InvoiceAggregate,
  InvoiceItemRow,
  InvoiceItemValues,
  InvoiceRow,
  InvoicesRepository,
  InvoiceUpdates,
  InvoiceValues,
  InvoiceWriteOutcome,
} from './invoices.repository';

const MONEY = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const QUANTITY = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const RATE = /^(?:(?:0|[1-9]\d?)(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set([
  'draft', 'sent', 'viewed', 'paid', 'partial', 'overdue', 'cancelled',
  'refunded',
]);

@Injectable()
export class InvoicesService {
  constructor(private readonly invoices: InvoicesRepository) {}

  async list(
    organizationId: number,
    filter: InvoiceFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<InvoicePage> {
    const normalized = this.page(page);
    const status =
      filter.status === undefined || filter.status === 'all'
        ? undefined
        : this.status(filter.status);
    const contactId =
      filter.contactId === undefined
        ? undefined
        : this.id(filter.contactId, 'contactId');
    const searchPattern = this.search(filter.search);
    const result = await this.invoices.findPage({
      organizationId,
      ...(status === undefined ? {} : { status }),
      ...(contactId === undefined ? {} : { contactId }),
      ...(searchPattern === undefined ? {} : { searchPattern }),
      pageSize: normalized.pageSize,
      offset: normalized.offset,
    });
    return {
      nodes: result.rows.map((row) => this.mapAggregate({
        invoice: row,
        items: [],
        payments: [],
      })),
      pageInfo: pageInfo(normalized.page, normalized.pageSize, result.total),
    };
  }

  async get(organizationId: number, invoiceId: number): Promise<Invoice> {
    this.id(invoiceId, 'id');
    const aggregate = await this.invoices.findById(organizationId, invoiceId);
    if (!aggregate) this.notFound();
    return this.mapAggregate(aggregate);
  }

  async create(
    organizationId: number,
    userId: number,
    input: CreateInvoiceInput,
  ): Promise<Invoice> {
    const values: InvoiceValues = {
      contactId: this.optionalId(input.contactId, 'contactId'),
      businessId: this.optionalId(input.businessId, 'businessId'),
      customerName: this.text(input.customerName, 'customerName', 255),
      customerEmail: this.email(input.customerEmail),
      customerPhone: this.text(input.customerPhone, 'customerPhone', 50),
      customerAddress: this.text(
        input.customerAddress,
        'customerAddress',
        10_000,
      ),
      issueDate: this.optionalDate(input.issueDate, 'issueDate'),
      dueDate: this.optionalDate(input.dueDate, 'dueDate'),
      items: this.items(input.items),
      discountType: this.discountType(input.discountType, input.discountValue),
      discountValue: this.decimal(
        input.discountValue,
        'discountValue',
        MONEY,
      ),
      taxRate: this.decimal(input.taxRate, 'taxRate', RATE),
      notes: this.text(input.notes, 'notes', 50_000),
      termsAndConditions: this.text(
        input.termsAndConditions,
        'termsAndConditions',
        50_000,
      ),
      paymentTerms: this.text(input.paymentTerms, 'paymentTerms', 10_000),
    };
    this.dateOrder(values.issueDate, values.dueDate);
    return this.saved(
      await this.invoices.create(organizationId, userId, values),
    );
  }

  async update(
    organizationId: number,
    invoiceId: number,
    input: UpdateInvoiceInput,
  ): Promise<Invoice> {
    this.id(invoiceId, 'id');
    if (
      (input.taxRate !== undefined ||
        input.discountType !== undefined ||
        input.discountValue !== undefined) &&
      input.items === undefined
    ) {
      throw itemizeGraphqlError(
        'items are required when invoice totals change',
        'BAD_USER_INPUT',
        { field: 'items', reason: 'INVOICE_ITEMS_REQUIRED_FOR_TOTAL_CHANGE' },
      );
    }
    for (const field of [
      'issueDate', 'dueDate', 'discountValue', 'taxRate',
    ] as const) {
      if (input[field] === null) this.nullField(field);
    }
    if (input.items === null) this.nullField('items');
    const updates: InvoiceUpdates = {
      ...(this.has(input, 'contactId')
        ? { contactId: this.optionalId(input.contactId, 'contactId') }
        : {}),
      ...(this.has(input, 'businessId')
        ? { businessId: this.optionalId(input.businessId, 'businessId') }
        : {}),
      ...(this.has(input, 'customerName')
        ? { customerName: this.text(input.customerName, 'customerName', 255) }
        : {}),
      ...(this.has(input, 'customerEmail')
        ? { customerEmail: this.email(input.customerEmail) }
        : {}),
      ...(this.has(input, 'customerPhone')
        ? { customerPhone: this.text(input.customerPhone, 'customerPhone', 50) }
        : {}),
      ...(this.has(input, 'customerAddress')
        ? {
            customerAddress: this.text(
              input.customerAddress,
              'customerAddress',
              10_000,
            ),
          }
        : {}),
      ...(input.issueDate === undefined
        ? {}
        : { issueDate: this.date(input.issueDate as string, 'issueDate') }),
      ...(input.dueDate === undefined
        ? {}
        : { dueDate: this.date(input.dueDate as string, 'dueDate') }),
      ...(input.items === undefined
        ? {}
        : { items: this.items(input.items as InvoiceItemInput[]) }),
      ...(this.has(input, 'discountType')
        ? {
            discountType: this.discountType(
              input.discountType,
              input.discountValue ?? '0',
            ),
          }
        : {}),
      ...(input.discountValue === undefined
        ? {}
        : {
            discountValue: this.decimal(
              input.discountValue as string,
              'discountValue',
              MONEY,
            ),
          }),
      ...(input.taxRate === undefined
        ? {}
        : {
            taxRate: this.decimal(
              input.taxRate as string,
              'taxRate',
              RATE,
            ),
          }),
      ...(this.has(input, 'notes')
        ? { notes: this.text(input.notes, 'notes', 50_000) }
        : {}),
      ...(this.has(input, 'termsAndConditions')
        ? {
            termsAndConditions: this.text(
              input.termsAndConditions,
              'termsAndConditions',
              50_000,
            ),
          }
        : {}),
      ...(this.has(input, 'paymentTerms')
        ? {
            paymentTerms: this.text(
              input.paymentTerms,
              'paymentTerms',
              10_000,
            ),
          }
        : {}),
    };
    this.dateOrder(updates.issueDate, updates.dueDate);
    return this.saved(
      await this.invoices.update(organizationId, invoiceId, updates),
    );
  }

  async delete(
    organizationId: number,
    invoiceId: number,
  ): Promise<DeleteInvoiceResult> {
    this.id(invoiceId, 'id');
    const deleted = await this.invoices.delete(organizationId, invoiceId);
    if (!deleted) this.notFound();
    return {
      success: true,
      deletedId: Number(deleted.id),
      invoiceNumber: deleted.invoice_number,
    };
  }

  private saved(outcome: InvoiceWriteOutcome): Invoice {
    if (outcome.kind === 'saved') return this.mapAggregate(outcome.aggregate);
    const messages: Record<
      Exclude<InvoiceWriteOutcome['kind'], 'saved'>,
      [string, ItemizeGraphqlErrorCode]
    > = {
      'not-found': ['Invoice not found', 'NOT_FOUND'],
      'not-editable': ['Invoice cannot be edited in its current status', 'CONFLICT'],
      'contact-not-found': ['Contact not found', 'NOT_FOUND'],
      'business-not-found': ['Business not found', 'NOT_FOUND'],
      'product-not-found': ['Product not found', 'NOT_FOUND'],
      'invalid-date-order': ['dueDate cannot be before issueDate', 'BAD_USER_INPUT'],
      'negative-total': ['Discount cannot make the invoice total negative', 'BAD_USER_INPUT'],
    };
    const [message, code] = messages[outcome.kind];
    throw itemizeGraphqlError(message, code, {
      reason: outcome.kind.replaceAll('-', '_').toUpperCase(),
    });
  }

  private items(inputs: InvoiceItemInput[]): InvoiceItemValues[] {
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 100) {
      throw itemizeGraphqlError(
        'items must contain between 1 and 100 line items',
        'BAD_USER_INPUT',
        { field: 'items', reason: 'INVALID_INVOICE_ITEMS' },
      );
    }
    return inputs.map((input, index) => ({
      productId: this.optionalId(input.productId, `items.${index}.productId`),
      name: this.requiredText(input.name, `items.${index}.name`, 255),
      description: this.text(
        input.description,
        `items.${index}.description`,
        10_000,
      ),
      quantity: this.positiveDecimal(
        input.quantity,
        `items.${index}.quantity`,
        QUANTITY,
      ),
      unitPrice: this.decimal(
        input.unitPrice,
        `items.${index}.unitPrice`,
        MONEY,
      ),
      taxRate: this.decimal(
        input.taxRate,
        `items.${index}.taxRate`,
        RATE,
      ),
    }));
  }

  private page(input: PageInput) {
    if (
      !Number.isInteger(input.page) || input.page < 1 ||
      !Number.isInteger(input.pageSize) ||
      input.pageSize < 1 || input.pageSize > 100
    ) {
      throw itemizeGraphqlError('Invalid page input', 'BAD_USER_INPUT', {
        field: 'page',
        reason: 'INVALID_PAGE',
      });
    }
    return {
      page: input.page,
      pageSize: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    };
  }

  private search(value?: string): string | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 100) {
      throw itemizeGraphqlError('search is invalid', 'BAD_USER_INPUT', {
        field: 'search',
        reason: 'INVALID_INVOICE_SEARCH',
      });
    }
    return `%${normalized.replace(/[\\%_]/g, '\\$&')}%`;
  }

  private status(value: string): string {
    if (!STATUSES.has(value)) {
      throw itemizeGraphqlError('status is invalid', 'BAD_USER_INPUT', {
        field: 'status',
        reason: 'INVALID_INVOICE_STATUS',
      });
    }
    return value;
  }

  private optionalId(
    value: number | null | undefined,
    field: string,
  ): number | null {
    if (value === undefined || value === null) return null;
    return this.id(value, field);
  }

  private id(value: number, field: string): number {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(`${field} is invalid`, 'BAD_USER_INPUT', {
        field,
        reason: 'INVALID_INVOICE_ID',
      });
    }
    return value;
  }

  private requiredText(value: string, field: string, max: number): string {
    const normalized = String(value ?? '').trim();
    if (normalized.length < 1 || normalized.length > max) {
      throw itemizeGraphqlError(`${field} is invalid`, 'BAD_USER_INPUT', {
        field,
        reason: 'INVALID_INVOICE_TEXT',
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
        field,
        reason: 'INVALID_INVOICE_TEXT',
      });
    }
    return normalized;
  }

  private email(value: string | null | undefined): string | null {
    const normalized = this.text(value, 'customerEmail', 255);
    if (
      normalized !== null &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ) {
      throw itemizeGraphqlError('customerEmail is invalid', 'BAD_USER_INPUT', {
        field: 'customerEmail',
        reason: 'INVALID_INVOICE_EMAIL',
      });
    }
    return normalized;
  }

  private decimal(value: string, field: string, pattern: RegExp): string {
    const normalized = String(value).trim();
    if (!pattern.test(normalized)) {
      throw itemizeGraphqlError(`${field} is invalid`, 'BAD_USER_INPUT', {
        field,
        reason: 'INVALID_INVOICE_DECIMAL',
      });
    }
    return normalized;
  }

  private positiveDecimal(
    value: string,
    field: string,
    pattern: RegExp,
  ): string {
    const normalized = this.decimal(value, field, pattern);
    if (Number(normalized) <= 0) {
      throw itemizeGraphqlError(`${field} must be positive`, 'BAD_USER_INPUT', {
        field,
        reason: 'INVALID_INVOICE_QUANTITY',
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
        'discountType is required for a non-zero discount',
        'BAD_USER_INPUT',
        { field: 'discountType', reason: 'INVOICE_DISCOUNT_TYPE_REQUIRED' },
      );
    }
    if (!['fixed', 'percent'].includes(value)) {
      throw itemizeGraphqlError('discountType is invalid', 'BAD_USER_INPUT', {
        field: 'discountType',
        reason: 'INVALID_INVOICE_DISCOUNT_TYPE',
      });
    }
    if (value === 'percent' && Number(amount) > 100) {
      throw itemizeGraphqlError(
        'percentage discount cannot exceed 100',
        'BAD_USER_INPUT',
        { field: 'discountValue', reason: 'INVALID_INVOICE_DISCOUNT' },
      );
    }
    return value;
  }

  private optionalDate(
    value: string | null | undefined,
    field: string,
  ): string | null {
    if (value === undefined || value === null || value === '') return null;
    return this.date(value, field);
  }

  private date(value: string, field: string): string {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (
      !DATE.test(value) ||
      Number.isNaN(parsed.valueOf()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw itemizeGraphqlError(`${field} is invalid`, 'BAD_USER_INPUT', {
        field,
        reason: 'INVALID_INVOICE_DATE',
      });
    }
    return value;
  }

  private dateOrder(
    issueDate: string | null | undefined,
    dueDate: string | null | undefined,
  ): void {
    if (issueDate && dueDate && dueDate < issueDate) {
      throw itemizeGraphqlError(
        'dueDate cannot be before issueDate',
        'BAD_USER_INPUT',
        { field: 'dueDate', reason: 'INVALID_INVOICE_DATE_ORDER' },
      );
    }
  }

  private has(value: object, field: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, field);
  }

  private nullField(field: string): never {
    throw itemizeGraphqlError(`${field} cannot be null`, 'BAD_USER_INPUT', {
      field,
      reason: 'NULL_INVOICE_FIELD',
    });
  }

  private notFound(): never {
    throw itemizeGraphqlError('Invoice not found', 'NOT_FOUND');
  }

  private mapAggregate(aggregate: InvoiceAggregate): Invoice {
    const row = aggregate.invoice;
    return {
      id: Number(row.id),
      organizationId: Number(row.organization_id),
      invoiceNumber: row.invoice_number,
      contactId: row.contact_id === null ? null : Number(row.contact_id),
      businessId: row.business_id === null ? null : Number(row.business_id),
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      customerPhone: row.customer_phone,
      customerAddress: row.customer_address,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      subtotal: row.subtotal,
      taxRate: row.tax_rate,
      taxAmount: row.tax_amount,
      discountAmount: row.discount_amount,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      total: row.total,
      amountPaid: row.amount_paid,
      amountDue: row.amount_due,
      currency: row.currency,
      status: row.status,
      paymentTerms: row.payment_terms,
      paymentInstructions: row.payment_instructions,
      notes: row.notes,
      termsAndConditions: row.terms_and_conditions,
      stripeInvoiceId: row.stripe_invoice_id,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      stripeHostedInvoiceUrl: row.stripe_hosted_invoice_url,
      stripePdfUrl: row.stripe_pdf_url,
      sentAt: row.sent_at === null ? null : new Date(row.sent_at),
      viewedAt: row.viewed_at === null ? null : new Date(row.viewed_at),
      paidAt: row.paid_at === null ? null : new Date(row.paid_at),
      isRecurring: row.is_recurring,
      recurringInterval: row.recurring_interval,
      parentInvoiceId:
        row.parent_invoice_id === null ? null : Number(row.parent_invoice_id),
      customFields: row.custom_fields ?? {},
      createdById: row.created_by === null ? null : Number(row.created_by),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      contactFirstName: row.contact_first_name,
      contactLastName: row.contact_last_name,
      contactEmail: row.contact_email,
      items: aggregate.items.map(this.mapItem),
      payments: aggregate.payments.map((payment) => ({
        id: Number(payment.id),
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.payment_method,
        status: payment.status,
        notes: payment.notes,
        paidAt: payment.paid_at === null ? null : new Date(payment.paid_at),
        createdAt: new Date(payment.created_at),
      })),
      business:
        row.business_id === null || row.business_name === null
          ? null
          : {
              id: Number(row.business_id),
              name: row.business_name,
              email: row.business_email,
              phone: row.business_phone,
              address: row.business_address,
              taxId: row.business_tax_id,
              logoUrl: row.business_logo_url,
            },
    };
  }

  private readonly mapItem = (row: InvoiceItemRow): InvoiceItem => ({
    id: Number(row.id),
    invoiceId: Number(row.invoice_id),
    organizationId: Number(row.organization_id),
    productId: row.product_id === null ? null : Number(row.product_id),
    name: row.name,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    taxRate: row.tax_rate,
    taxAmount: row.tax_amount,
    discountAmount: row.discount_amount,
    total: row.total,
    sortOrder: Number(row.sort_order),
    productName: row.product_name,
    createdAt: new Date(row.created_at),
  });
}
