import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { UpdateInvoiceSettingsInput } from './invoice-settings.inputs';
import {
  InvoiceSettingsRepository,
  InvoiceSettingsRow,
  InvoiceSettingsValues,
  InvoiceSettingsWriteOutcome,
} from './invoice-settings.repository';
import { InvoiceSettings } from './invoice-settings.types';
import { InvoiceLogoRemovalResult } from '../invoice-logo-cleanup/invoice-logo-cleanup.types';

const TAX_RATE = /^(?:(?:0|[1-9]\d?)(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/;
const PREFIX = /^[A-Za-z0-9._\/-]{1,10}$/;
const CURRENCY = /^[A-Z]{3}$/;

@Injectable()
export class InvoiceSettingsService {
  constructor(private readonly settings: InvoiceSettingsRepository) {}

  async get(organizationId: number): Promise<InvoiceSettings> {
    const row = await this.settings.find(organizationId);
    return row ? this.map(row) : this.defaults(organizationId);
  }

  async update(
    organizationId: number,
    input: UpdateInvoiceSettingsInput,
  ): Promise<InvoiceSettings> {
    const required = [
      'invoicePrefix',
      'nextInvoiceNumber',
      'defaultPaymentTerms',
      'defaultTaxRate',
      'defaultCurrency',
    ] as const;
    for (const field of required) {
      if (Object.prototype.hasOwnProperty.call(input, field) && input[field] === null) {
        throw itemizeGraphqlError(`${field} cannot be null`, 'BAD_USER_INPUT', {
          field,
          reason: 'NULL_INVOICE_SETTINGS_FIELD',
        });
      }
    }
    const values: InvoiceSettingsValues = {
      ...(input.invoicePrefix === undefined ? {} : {
        invoicePrefix: this.prefix(input.invoicePrefix as string),
      }),
      ...(input.nextInvoiceNumber === undefined ? {} : {
        nextInvoiceNumber: this.integer(
          input.nextInvoiceNumber as number,
          'nextInvoiceNumber',
          1,
          2_147_483_646,
        ),
      }),
      ...(input.defaultPaymentTerms === undefined ? {} : {
        defaultPaymentTerms: this.integer(
          input.defaultPaymentTerms as number,
          'defaultPaymentTerms',
          0,
          36_500,
        ),
      }),
      ...(this.has(input, 'defaultNotes') ? {
        defaultNotes: this.optional(input.defaultNotes, 'defaultNotes', 50_000),
      } : {}),
      ...(this.has(input, 'defaultTerms') ? {
        defaultTerms: this.optional(input.defaultTerms, 'defaultTerms', 50_000),
      } : {}),
      ...(input.defaultTaxRate === undefined ? {} : {
        defaultTaxRate: this.decimal(input.defaultTaxRate as string),
      }),
      ...(this.has(input, 'taxId') ? {
        taxId: this.optional(input.taxId, 'taxId', 50),
      } : {}),
      ...(this.has(input, 'businessName') ? {
        businessName: this.optional(input.businessName, 'businessName', 255),
      } : {}),
      ...(this.has(input, 'businessAddress') ? {
        businessAddress: this.optional(
          input.businessAddress,
          'businessAddress',
          10_000,
        ),
      } : {}),
      ...(this.has(input, 'businessPhone') ? {
        businessPhone: this.optional(input.businessPhone, 'businessPhone', 50),
      } : {}),
      ...(this.has(input, 'businessEmail') ? {
        businessEmail: this.email(input.businessEmail),
      } : {}),
      ...(input.defaultCurrency === undefined ? {} : {
        defaultCurrency: this.currency(input.defaultCurrency as string),
      }),
    };
    return this.saved(await this.settings.update(organizationId, values));
  }

  async removeLogo(organizationId: number): Promise<InvoiceLogoRemovalResult> {
    const result = await this.settings.removeLogo(organizationId);
    return { success: true, cleanupQueued: result.cleanupQueued };
  }

  private saved(outcome: InvoiceSettingsWriteOutcome): InvoiceSettings {
    if (outcome.kind === 'saved') return this.map(outcome.row);
    if (outcome.kind === 'counter-regression') {
      throw itemizeGraphqlError(
        'nextInvoiceNumber cannot move backwards',
        'CONFLICT',
        {
          field: 'nextInvoiceNumber',
          reason: 'INVOICE_COUNTER_REGRESSION',
          current: outcome.current,
        },
      );
    }
    throw itemizeGraphqlError(
      'The requested next invoice number already exists',
      'CONFLICT',
      {
        reason: 'INVOICE_NUMBER_ALREADY_EXISTS',
      },
    );
  }

  private prefix(value: string): string {
    const normalized = String(value).trim();
    if (!PREFIX.test(normalized)) {
      throw itemizeGraphqlError(
        'invoicePrefix must contain 1-10 safe characters',
        'BAD_USER_INPUT',
        { field: 'invoicePrefix', reason: 'INVALID_INVOICE_PREFIX' },
      );
    }
    return normalized;
  }

  private integer(
    value: number,
    field: string,
    minimum: number,
    maximum: number,
  ): number {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw itemizeGraphqlError(`${field} is out of range`, 'BAD_USER_INPUT', {
        field,
        reason: `INVALID_${field.replace(/([A-Z])/g, '_$1').toUpperCase()}`,
      });
    }
    return value;
  }

  private decimal(value: string): string {
    const normalized = String(value).trim();
    if (!TAX_RATE.test(normalized)) {
      throw itemizeGraphqlError(
        'defaultTaxRate must be between 0 and 100 with at most 2 decimals',
        'BAD_USER_INPUT',
        { field: 'defaultTaxRate', reason: 'INVALID_DEFAULT_TAX_RATE' },
      );
    }
    return normalized;
  }

  private currency(value: string): string {
    const normalized = String(value).trim().toUpperCase();
    if (!CURRENCY.test(normalized)) {
      throw itemizeGraphqlError(
        'defaultCurrency must be a 3-letter currency code',
        'BAD_USER_INPUT',
        { field: 'defaultCurrency', reason: 'INVALID_DEFAULT_CURRENCY' },
      );
    }
    return normalized;
  }

  private email(value: string | null | undefined): string | null {
    const normalized = this.optional(value, 'businessEmail', 255);
    if (
      normalized !== null &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ) {
      throw itemizeGraphqlError('businessEmail is invalid', 'BAD_USER_INPUT', {
        field: 'businessEmail',
        reason: 'INVALID_BUSINESS_EMAIL',
      });
    }
    return normalized;
  }

  private optional(
    value: string | null | undefined,
    field: string,
    maximum: number,
  ): string | null {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    if (!normalized) return null;
    if (normalized.length > maximum) {
      throw itemizeGraphqlError(`${field} is too long`, 'BAD_USER_INPUT', {
        field,
        reason: `INVALID_${field.replace(/([A-Z])/g, '_$1').toUpperCase()}`,
      });
    }
    return normalized;
  }

  private has(input: object, field: string): boolean {
    return Object.prototype.hasOwnProperty.call(input, field);
  }

  private defaults(organizationId: number): InvoiceSettings {
    return {
      id: null,
      organizationId,
      stripeAccountId: null,
      stripePublishableKey: null,
      stripeConnected: false,
      stripeConnectedAt: null,
      invoicePrefix: 'INV-',
      nextInvoiceNumber: 1,
      defaultPaymentTerms: 30,
      defaultNotes: null,
      defaultTerms: null,
      defaultTaxRate: '10.00',
      taxId: null,
      businessName: null,
      businessAddress: null,
      businessPhone: null,
      businessEmail: null,
      logoUrl: null,
      defaultCurrency: 'USD',
      createdAt: null,
      updatedAt: null,
    };
  }

  private map(row: InvoiceSettingsRow): InvoiceSettings {
    return {
      id: Number(row.id),
      organizationId: Number(row.organization_id),
      stripeAccountId: row.stripe_account_id,
      stripePublishableKey: row.stripe_publishable_key,
      stripeConnected: row.stripe_connected,
      stripeConnectedAt: row.stripe_connected_at,
      invoicePrefix: row.invoice_prefix,
      nextInvoiceNumber: Number(row.next_invoice_number),
      defaultPaymentTerms: Number(row.default_payment_terms),
      defaultNotes: row.default_notes,
      defaultTerms: row.default_terms,
      defaultTaxRate: row.default_tax_rate,
      taxId: row.tax_id,
      businessName: row.business_name,
      businessAddress: row.business_address,
      businessPhone: row.business_phone,
      businessEmail: row.business_email,
      logoUrl: row.logo_url,
      defaultCurrency: row.default_currency,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
