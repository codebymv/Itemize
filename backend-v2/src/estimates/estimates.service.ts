import { Injectable } from '@nestjs/common';
import { ItemizeGraphqlErrorCode, itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  CreateEstimateInput, EstimateFilterInput, EstimateItemInput, UpdateEstimateInput,
} from './estimate.inputs';
import { DeleteEstimateResult, Estimate, EstimateItem, EstimatePage } from './estimate.types';
import {
  EstimateAggregate, EstimateItemRow, EstimateItemValues, EstimateUpdates,
  EstimateValues, EstimateWriteOutcome, EstimatesRepository,
} from './estimates.repository';

const MONEY = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const QUANTITY = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const RATE = /^(?:(?:0|[1-9]\d?)(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(['draft', 'sent', 'accepted', 'declined', 'expired']);

@Injectable()
export class EstimatesService {
  constructor(private readonly estimates: EstimatesRepository) {}

  async list(
    organizationId: number,
    filter: EstimateFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<EstimatePage> {
    const normalized = this.page(page);
    const status = filter.status === undefined || filter.status === 'all'
      ? undefined : this.status(filter.status);
    const contactId = filter.contactId === undefined
      ? undefined : this.id(filter.contactId, 'contactId');
    const searchPattern = this.search(filter.search);
    const result = await this.estimates.findPage({
      organizationId,
      ...(status === undefined ? {} : { status }),
      ...(contactId === undefined ? {} : { contactId }),
      ...(searchPattern === undefined ? {} : { searchPattern }),
      pageSize: normalized.pageSize,
      offset: normalized.offset,
    });
    return {
      nodes: result.rows.map((estimate) => this.mapAggregate({ estimate, items: [] })),
      pageInfo: pageInfo(normalized.page, normalized.pageSize, result.total),
    };
  }

  async get(organizationId: number, estimateId: number): Promise<Estimate> {
    this.id(estimateId, 'id');
    const aggregate = await this.estimates.findById(organizationId, estimateId);
    if (!aggregate) this.notFound();
    return this.mapAggregate(aggregate);
  }

  async create(
    organizationId: number,
    userId: number,
    input: CreateEstimateInput,
  ): Promise<Estimate> {
    const values: EstimateValues = {
      contactId: this.optionalId(input.contactId, 'contactId'),
      customerName: this.text(input.customerName, 'customerName', 255),
      customerEmail: this.email(input.customerEmail),
      customerPhone: this.text(input.customerPhone, 'customerPhone', 50),
      customerAddress: this.text(input.customerAddress, 'customerAddress', 10_000),
      validUntil: this.optionalDate(input.validUntil, 'validUntil'),
      items: this.items(input.items),
      discountType: this.discountType(input.discountType, input.discountValue),
      discountValue: this.decimal(input.discountValue, 'discountValue', MONEY),
      notes: this.text(input.notes, 'notes', 50_000),
      termsAndConditions: this.text(input.termsAndConditions, 'termsAndConditions', 50_000),
    };
    return this.saved(await this.estimates.create(organizationId, userId, values));
  }

  async update(
    organizationId: number,
    estimateId: number,
    input: UpdateEstimateInput,
  ): Promise<Estimate> {
    this.id(estimateId, 'id');
    if (
      (input.discountType !== undefined || input.discountValue !== undefined) &&
      input.items === undefined
    ) {
      throw itemizeGraphqlError('items are required when estimate totals change', 'BAD_USER_INPUT', {
        field: 'items', reason: 'ESTIMATE_ITEMS_REQUIRED_FOR_TOTAL_CHANGE',
      });
    }
    if (input.validUntil === null) this.nullField('validUntil');
    if (input.discountValue === null) this.nullField('discountValue');
    if (input.items === null) this.nullField('items');
    const updates: EstimateUpdates = {
      ...(this.has(input, 'contactId')
        ? { contactId: this.optionalId(input.contactId, 'contactId') } : {}),
      ...(this.has(input, 'customerName')
        ? { customerName: this.text(input.customerName, 'customerName', 255) } : {}),
      ...(this.has(input, 'customerEmail')
        ? { customerEmail: this.email(input.customerEmail) } : {}),
      ...(this.has(input, 'customerPhone')
        ? { customerPhone: this.text(input.customerPhone, 'customerPhone', 50) } : {}),
      ...(this.has(input, 'customerAddress')
        ? { customerAddress: this.text(input.customerAddress, 'customerAddress', 10_000) } : {}),
      ...(input.validUntil === undefined
        ? {} : { validUntil: this.date(input.validUntil as string, 'validUntil') }),
      ...(input.items === undefined
        ? {} : { items: this.items(input.items as EstimateItemInput[]) }),
      ...(this.has(input, 'discountType')
        ? { discountType: this.discountType(input.discountType, input.discountValue ?? '0') } : {}),
      ...(input.discountValue === undefined ? {} : {
        discountValue: this.decimal(input.discountValue as string, 'discountValue', MONEY),
      }),
      ...(this.has(input, 'notes')
        ? { notes: this.text(input.notes, 'notes', 50_000) } : {}),
      ...(this.has(input, 'termsAndConditions') ? {
        termsAndConditions: this.text(
          input.termsAndConditions, 'termsAndConditions', 50_000,
        ),
      } : {}),
    };
    return this.saved(await this.estimates.update(organizationId, estimateId, updates));
  }

  async delete(
    organizationId: number,
    estimateId: number,
  ): Promise<DeleteEstimateResult> {
    this.id(estimateId, 'id');
    const deleted = await this.estimates.delete(organizationId, estimateId);
    if (!deleted) this.notFound();
    return {
      success: true,
      deletedId: Number(deleted.id),
      estimateNumber: deleted.estimate_number,
    };
  }

  private saved(outcome: EstimateWriteOutcome): Estimate {
    if (outcome.kind === 'saved') return this.mapAggregate(outcome.aggregate);
    const messages: Record<
      Exclude<EstimateWriteOutcome['kind'], 'saved'>,
      [string, ItemizeGraphqlErrorCode]
    > = {
      'not-found': ['Estimate not found', 'NOT_FOUND'],
      'not-editable': ['Estimate cannot be edited in its current status', 'CONFLICT'],
      'contact-not-found': ['Contact not found', 'NOT_FOUND'],
      'product-not-found': ['Product not found', 'NOT_FOUND'],
      'invalid-date-order': ['validUntil cannot be before issueDate', 'BAD_USER_INPUT'],
      'invalid-discount': ['discountValue is invalid', 'BAD_USER_INPUT'],
      'negative-total': ['Discount cannot make the estimate total negative', 'BAD_USER_INPUT'],
    };
    const [message, code] = messages[outcome.kind];
    throw itemizeGraphqlError(message, code, {
      reason: outcome.kind.replaceAll('-', '_').toUpperCase(),
    });
  }

  private items(inputs: EstimateItemInput[]): EstimateItemValues[] {
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 100) {
      throw itemizeGraphqlError(
        'items must contain between 1 and 100 line items',
        'BAD_USER_INPUT',
        { field: 'items', reason: 'INVALID_ESTIMATE_ITEMS' },
      );
    }
    return inputs.map((input, index) => ({
      productId: this.optionalId(input.productId, `items.${index}.productId`),
      name: this.requiredText(input.name, `items.${index}.name`, 255),
      description: this.text(input.description, `items.${index}.description`, 10_000),
      quantity: this.positiveDecimal(input.quantity, `items.${index}.quantity`, QUANTITY),
      unitPrice: this.decimal(input.unitPrice, `items.${index}.unitPrice`, MONEY),
      taxRate: this.decimal(input.taxRate, `items.${index}.taxRate`, RATE),
    }));
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

  private search(value?: string): string | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 100) {
      throw itemizeGraphqlError('search is invalid', 'BAD_USER_INPUT', {
        field: 'search', reason: 'INVALID_ESTIMATE_SEARCH',
      });
    }
    return `%${normalized.replace(/[\\%_]/g, '\\$&')}%`;
  }

  private status(value: string): string {
    if (!STATUSES.has(value)) {
      throw itemizeGraphqlError('status is invalid', 'BAD_USER_INPUT', {
        field: 'status', reason: 'INVALID_ESTIMATE_STATUS',
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
        field, reason: 'INVALID_ESTIMATE_ID',
      });
    }
    return value;
  }

  private requiredText(value: string, field: string, max: number): string {
    const normalized = String(value ?? '').trim();
    if (normalized.length < 1 || normalized.length > max) {
      throw itemizeGraphqlError(`${field} is invalid`, 'BAD_USER_INPUT', {
        field, reason: 'INVALID_ESTIMATE_TEXT',
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
        field, reason: 'INVALID_ESTIMATE_TEXT',
      });
    }
    return normalized;
  }

  private email(value: string | null | undefined): string | null {
    const normalized = this.text(value, 'customerEmail', 255);
    if (normalized !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw itemizeGraphqlError('customerEmail is invalid', 'BAD_USER_INPUT', {
        field: 'customerEmail', reason: 'INVALID_ESTIMATE_EMAIL',
      });
    }
    return normalized;
  }

  private decimal(value: string, field: string, pattern: RegExp): string {
    const normalized = String(value).trim();
    if (!pattern.test(normalized)) {
      throw itemizeGraphqlError(`${field} is invalid`, 'BAD_USER_INPUT', {
        field, reason: 'INVALID_ESTIMATE_DECIMAL',
      });
    }
    return normalized;
  }

  private positiveDecimal(value: string, field: string, pattern: RegExp): string {
    const normalized = this.decimal(value, field, pattern);
    if (Number(normalized) <= 0) {
      throw itemizeGraphqlError(`${field} must be positive`, 'BAD_USER_INPUT', {
        field, reason: 'INVALID_ESTIMATE_QUANTITY',
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
        { field: 'discountType', reason: 'ESTIMATE_DISCOUNT_TYPE_REQUIRED' },
      );
    }
    if (!['fixed', 'percent'].includes(value)) {
      throw itemizeGraphqlError('discountType is invalid', 'BAD_USER_INPUT', {
        field: 'discountType', reason: 'INVALID_ESTIMATE_DISCOUNT_TYPE',
      });
    }
    if (value === 'percent' && Number(amount) > 100) {
      throw itemizeGraphqlError('discountValue is invalid', 'BAD_USER_INPUT', {
        field: 'discountValue', reason: 'INVALID_ESTIMATE_DISCOUNT_VALUE',
      });
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
    const normalized = String(value).trim();
    if (!DATE.test(normalized)) this.invalidDate(field);
    const [year, month, day] = normalized.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) this.invalidDate(field);
    return normalized;
  }

  private invalidDate(field: string): never {
    throw itemizeGraphqlError(`${field} is invalid`, 'BAD_USER_INPUT', {
      field, reason: 'INVALID_ESTIMATE_DATE',
    });
  }

  private nullField(field: string): never {
    throw itemizeGraphqlError(`${field} cannot be null`, 'BAD_USER_INPUT', {
      field, reason: 'INVALID_ESTIMATE_NULL',
    });
  }

  private has(value: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  private notFound(): never {
    throw itemizeGraphqlError('Estimate not found', 'NOT_FOUND', {
      reason: 'ESTIMATE_NOT_FOUND',
    });
  }

  private mapAggregate(aggregate: EstimateAggregate): Estimate {
    const row = aggregate.estimate;
    return {
      id: Number(row.id),
      organizationId: Number(row.organization_id),
      estimateNumber: row.estimate_number,
      contactId: row.contact_id === null ? null : Number(row.contact_id),
      businessId: row.business_id === null ? null : Number(row.business_id),
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      customerPhone: row.customer_phone,
      customerAddress: row.customer_address,
      issueDate: row.issue_date,
      validUntil: row.valid_until,
      subtotal: row.subtotal,
      taxAmount: row.tax_amount,
      discountAmount: row.discount_amount,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      total: row.total,
      currency: row.currency,
      status: row.status,
      notes: row.notes,
      termsAndConditions: row.terms_and_conditions,
      sentAt: row.sent_at,
      viewedAt: row.viewed_at,
      acceptedAt: row.accepted_at,
      declinedAt: row.declined_at,
      convertedInvoiceId: row.converted_invoice_id === null
        ? null : Number(row.converted_invoice_id),
      customFields: row.custom_fields ?? {},
      createdById: row.created_by === null ? null : Number(row.created_by),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contactFirstName: row.contact_first_name,
      contactLastName: row.contact_last_name,
      contactEmail: row.contact_email,
      items: aggregate.items.map((item) => this.mapItem(item)),
    };
  }

  private mapItem(row: EstimateItemRow): EstimateItem {
    return {
      id: Number(row.id),
      estimateId: Number(row.estimate_id),
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
