import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  CreateInvoiceBusinessInput,
  UpdateInvoiceBusinessInput,
} from './invoice-business.inputs';
import {
  DeleteInvoiceBusinessResult,
  InvoiceBusiness,
  InvoiceBusinessPage,
} from './invoice-business.types';
import {
  InvoiceBusinessRow,
  InvoiceBusinessesRepository,
  InvoiceBusinessUpdates,
} from './invoice-businesses.repository';
import { InvoiceLogoRemovalResult } from '../invoice-logo-cleanup/invoice-logo-cleanup.types';

@Injectable()
export class InvoiceBusinessesService {
  constructor(private readonly businesses: InvoiceBusinessesRepository) {}

  async list(
    organizationId: number,
    page: PageInput = new PageInput(),
  ): Promise<InvoiceBusinessPage> {
    const normalized = this.page(page);
    const result = await this.businesses.findPage(
      organizationId,
      normalized.pageSize,
      normalized.offset,
    );
    return {
      nodes: result.rows.map(this.map),
      pageInfo: pageInfo(
        normalized.page,
        normalized.pageSize,
        result.total,
      ),
    };
  }

  async find(
    organizationId: number,
    businessId: number,
  ): Promise<InvoiceBusiness> {
    this.id(businessId);
    const row = await this.businesses.findById(organizationId, businessId);
    if (!row) this.notFound();
    return this.map(row);
  }

  async create(
    organizationId: number,
    input: CreateInvoiceBusinessInput,
  ): Promise<InvoiceBusiness> {
    return this.map(
      await this.businesses.create(organizationId, {
        name: this.name(input.name),
        email: this.optional(input.email, 'email', 255),
        phone: this.optional(input.phone, 'phone', 50),
        address: this.optional(input.address, 'address', 10_000),
        taxId: this.optional(input.taxId, 'taxId', 100),
      }),
    );
  }

  async update(
    organizationId: number,
    businessId: number,
    input: UpdateInvoiceBusinessInput,
  ): Promise<InvoiceBusiness> {
    this.id(businessId);
    if (input.name === null) this.nullField('name');
    if (input.isActive === null) this.nullField('isActive');
    const updates: InvoiceBusinessUpdates = {
      ...(input.name === undefined
        ? {}
        : { name: this.name(input.name as string) }),
      ...(Object.prototype.hasOwnProperty.call(input, 'email')
        ? { email: this.optional(input.email, 'email', 255) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'phone')
        ? { phone: this.optional(input.phone, 'phone', 50) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'address')
        ? { address: this.optional(input.address, 'address', 10_000) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'taxId')
        ? { taxId: this.optional(input.taxId, 'taxId', 100) }
        : {}),
      ...(input.isActive === undefined
        ? {}
        : { isActive: input.isActive as boolean }),
    };
    const row = await this.businesses.update(
      organizationId,
      businessId,
      updates,
    );
    if (!row) this.notFound();
    return this.map(row);
  }

  async delete(
    organizationId: number,
    businessId: number,
  ): Promise<DeleteInvoiceBusinessResult> {
    this.id(businessId);
    if (!(await this.businesses.deactivate(organizationId, businessId))) {
      this.notFound();
    }
    return { deletedId: businessId, success: true };
  }

  async removeLogo(
    organizationId: number,
    businessId: number,
  ): Promise<InvoiceLogoRemovalResult> {
    this.id(businessId);
    const removed = await this.businesses.removeLogo(organizationId, businessId);
    if (!removed) this.notFound();
    return { success: true, cleanupQueued: removed.cleanupQueued };
  }

  private page(input: PageInput) {
    if (
      !Number.isInteger(input.page) ||
      input.page < 1 ||
      !Number.isInteger(input.pageSize) ||
      input.pageSize < 1 ||
      input.pageSize > 100
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

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'id must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_INVOICE_BUSINESS_ID' },
      );
    }
  }

  private name(value: string): string {
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 255) {
      throw itemizeGraphqlError(
        'name must be between 1 and 255 characters',
        'BAD_USER_INPUT',
        { field: 'name', reason: 'INVALID_INVOICE_BUSINESS_NAME' },
      );
    }
    return normalized;
  }

  private optional(
    value: string | null | undefined,
    field: string,
    maxLength: number,
  ): string | null {
    if (value === undefined || value === null) return null;
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) {
      throw itemizeGraphqlError(
        `${field} is too long`,
        'BAD_USER_INPUT',
        {
          field,
          reason: `INVALID_INVOICE_BUSINESS_${field.toUpperCase()}`,
        },
      );
    }
    return normalized;
  }

  private nullField(field: string): never {
    throw itemizeGraphqlError(`${field} cannot be null`, 'BAD_USER_INPUT', {
      field,
      reason: 'NULL_INVOICE_BUSINESS_FIELD',
    });
  }

  private notFound(): never {
    throw itemizeGraphqlError('Invoice business not found', 'NOT_FOUND');
  }

  private readonly map = (row: InvoiceBusinessRow): InvoiceBusiness => ({
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    taxId: row.tax_id,
    logoUrl: row.logo_url,
    isActive: row.is_active,
    lastUsedAt:
      row.last_used_at === null ? null : new Date(row.last_used_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}
