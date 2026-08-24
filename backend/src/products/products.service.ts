import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  CreateProductInput,
  ProductFilterInput,
  UpdateProductInput,
} from './product.inputs';
import { DeleteProductResult, Product, ProductPage } from './product.types';
import {
  ProductRow,
  ProductsRepository,
  ProductUpdates,
  ProductValues,
} from './products.repository';

const MONEY = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const TAX_RATE = /^(?:(?:0|[1-9]\d?)(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/;
const CURRENCY = /^[A-Z]{3}$/;
const PRODUCT_TYPES = new Set(['one_time', 'recurring']);
const BILLING_PERIODS = new Set(['weekly', 'monthly', 'quarterly', 'yearly']);

@Injectable()
export class ProductsService {
  constructor(private readonly products: ProductsRepository) {}

  async list(
    organizationId: number,
    filter: ProductFilterInput = {},
    page: PageInput = new PageInput(),
  ): Promise<ProductPage> {
    const normalizedPage = this.page(page);
    const searchPattern = this.search(filter.search);
    const result = await this.products.findPage({
      organizationId,
      ...(filter.isActive === undefined
        ? {}
        : { isActive: filter.isActive }),
      ...(searchPattern === undefined ? {} : { searchPattern }),
      pageSize: normalizedPage.pageSize,
      offset: normalizedPage.offset,
    });
    return {
      nodes: result.rows.map(this.map),
      pageInfo: pageInfo(
        normalizedPage.page,
        normalizedPage.pageSize,
        result.total,
      ),
    };
  }

  async create(
    organizationId: number,
    userId: number,
    input: CreateProductInput,
  ): Promise<Product> {
    const productType = this.productType(input.productType);
    const billingPeriod = this.billingPeriod(
      input.billingPeriod,
      productType,
      true,
    );
    const values: ProductValues = {
      name: this.name(input.name),
      description: this.optionalText(input.description, 'description', 10_000),
      sku: this.optionalText(input.sku, 'sku', 100),
      price: this.decimal(input.price, 'price', MONEY),
      currency: this.currency(input.currency),
      productType,
      billingPeriod,
      taxRate: this.decimal(input.taxRate, 'taxRate', TAX_RATE),
      taxable: input.taxable,
      isActive: input.isActive,
    };
    return this.map(
      await this.products.create(organizationId, userId, values),
    );
  }

  async update(
    organizationId: number,
    productId: number,
    input: UpdateProductInput,
  ): Promise<Product> {
    this.id(productId);
    const existing = await this.products.findById(organizationId, productId);
    if (!existing) this.notFound();
    for (const field of [
      'name',
      'price',
      'currency',
      'productType',
      'taxRate',
      'taxable',
      'isActive',
    ] as const) {
      if (input[field] === null) this.nullField(field);
    }
    const productType =
      input.productType === undefined
        ? undefined
        : this.productType(input.productType as string);
    const effectiveProductType = productType ?? existing.product_type;
    const updates: ProductUpdates = {
      ...(input.name === undefined
        ? {}
        : { name: this.name(input.name as string) }),
      ...(Object.prototype.hasOwnProperty.call(input, 'description')
        ? {
            description: this.optionalText(
              input.description,
              'description',
              10_000,
            ),
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'sku')
        ? { sku: this.optionalText(input.sku, 'sku', 100) }
        : {}),
      ...(input.price === undefined
        ? {}
        : { price: this.decimal(input.price as string, 'price', MONEY) }),
      ...(input.currency === undefined
        ? {}
        : { currency: this.currency(input.currency as string) }),
      ...(productType === undefined ? {} : { productType }),
      ...(Object.prototype.hasOwnProperty.call(input, 'billingPeriod') ||
      productType !== undefined
        ? {
            billingPeriod: this.billingPeriod(
              input.billingPeriod,
              effectiveProductType,
              effectiveProductType === 'recurring',
            ),
          }
        : {}),
      ...(input.taxRate === undefined
        ? {}
        : {
            taxRate: this.decimal(
              input.taxRate as string,
              'taxRate',
              TAX_RATE,
            ),
          }),
      ...(input.taxable === undefined
        ? {}
        : { taxable: input.taxable as boolean }),
      ...(input.isActive === undefined
        ? {}
        : { isActive: input.isActive as boolean }),
    };
    const row = await this.products.update(
      organizationId,
      productId,
      updates,
    );
    if (!row) this.notFound();
    return this.map(row);
  }

  async delete(
    organizationId: number,
    productId: number,
  ): Promise<DeleteProductResult> {
    this.id(productId);
    if (!(await this.products.delete(organizationId, productId))) {
      this.notFound();
    }
    return { deletedId: productId, success: true };
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

  private search(value?: string): string | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 100) {
      throw itemizeGraphqlError(
        'search must be between 1 and 100 characters',
        'BAD_USER_INPUT',
        { field: 'search', reason: 'INVALID_PRODUCT_SEARCH' },
      );
    }
    return `%${normalized.replace(/[\\%_]/g, '\\$&')}%`;
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'id must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_PRODUCT_ID' },
      );
    }
  }

  private name(value: string): string {
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 255) {
      throw itemizeGraphqlError(
        'name must be between 1 and 255 characters',
        'BAD_USER_INPUT',
        { field: 'name', reason: 'INVALID_PRODUCT_NAME' },
      );
    }
    return normalized;
  }

  private optionalText(
    value: string | null | undefined,
    field: string,
    maxLength: number,
  ): string | null {
    if (value === undefined || value === null) return null;
    const normalized = value.trim();
    if (normalized.length === 0) return null;
    if (normalized.length > maxLength) {
      throw itemizeGraphqlError(
        `${field} is too long`,
        'BAD_USER_INPUT',
        { field, reason: `INVALID_PRODUCT_${field.toUpperCase()}` },
      );
    }
    return normalized;
  }

  private decimal(
    value: string,
    field: string,
    pattern: RegExp,
  ): string {
    const normalized = String(value).trim();
    if (!pattern.test(normalized)) {
      throw itemizeGraphqlError(
        `${field} must be a non-negative decimal with at most two places`,
        'BAD_USER_INPUT',
        { field, reason: `INVALID_PRODUCT_${field.toUpperCase()}` },
      );
    }
    return normalized;
  }

  private currency(value: string): string {
    const normalized = value.trim().toUpperCase();
    if (!CURRENCY.test(normalized)) {
      throw itemizeGraphqlError(
        'currency must be a three-letter code',
        'BAD_USER_INPUT',
        { field: 'currency', reason: 'INVALID_PRODUCT_CURRENCY' },
      );
    }
    return normalized;
  }

  private productType(value: string): string {
    if (!PRODUCT_TYPES.has(value)) {
      throw itemizeGraphqlError(
        'productType must be one_time or recurring',
        'BAD_USER_INPUT',
        { field: 'productType', reason: 'INVALID_PRODUCT_TYPE' },
      );
    }
    return value;
  }

  private billingPeriod(
    value: string | null | undefined,
    productType: string | undefined,
    required: boolean,
  ): string | null {
    if (productType === 'one_time') return null;
    if (value === undefined || value === null || value === '') {
      if (!required) return null;
      throw itemizeGraphqlError(
        'billingPeriod is required for recurring products',
        'BAD_USER_INPUT',
        { field: 'billingPeriod', reason: 'PRODUCT_BILLING_PERIOD_REQUIRED' },
      );
    }
    if (!BILLING_PERIODS.has(value)) {
      throw itemizeGraphqlError(
        'billingPeriod is invalid',
        'BAD_USER_INPUT',
        { field: 'billingPeriod', reason: 'INVALID_PRODUCT_BILLING_PERIOD' },
      );
    }
    return value;
  }

  private nullField(field: string): never {
    throw itemizeGraphqlError(`${field} cannot be null`, 'BAD_USER_INPUT', {
      field,
      reason: 'NULL_PRODUCT_FIELD',
    });
  }

  private notFound(): never {
    throw itemizeGraphqlError('Product not found', 'NOT_FOUND');
  }

  private readonly map = (row: ProductRow): Product => ({
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    name: row.name,
    description: row.description,
    sku: row.sku,
    price: row.price,
    currency: row.currency,
    productType: row.product_type,
    billingPeriod: row.billing_period,
    taxRate: row.tax_rate,
    taxable: row.taxable,
    isActive: row.is_active,
    createdById:
      row.created_by === null ? null : Number(row.created_by),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}
