import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ContactExportFilter,
  ContactImportResult,
  csvCell,
  IMPORT_FIELDS,
  ImportContactRow,
  ImportRowError,
  MAX_EXPORT_ROWS,
  MAX_IMPORT_COLUMNS,
  MAX_REPORTED_IMPORT_ERRORS,
  NormalizedImportContact,
  validateImportEnvelope,
} from './contact-transfer.contract';
import { ContactTransfersRepository } from './contact-transfers.repository';

const statuses = new Set(['active', 'inactive', 'archived']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+()\-.\s\d]+$/;

@Injectable()
export class ContactTransfersService {
  private readonly logger = new Logger(ContactTransfersService.name);

  constructor(private readonly repository: ContactTransfersRepository) {}

  async exportCsv(
    organizationId: number,
    userId: number,
    rawStatus: unknown,
    rawTags: unknown,
    requestId: string,
  ): Promise<string> {
    const filter = this.normalizeExportFilter(rawStatus, rawTags);
    try {
      const rows = await this.repository.exportRows(
        organizationId,
        filter,
        MAX_EXPORT_ROWS + 1,
      );
      if (rows.length > MAX_EXPORT_ROWS) {
        throw new PayloadTooLargeException({
          error: `Contact exports are limited to ${MAX_EXPORT_ROWS} rows`,
          code: 'EXPORT_TOO_LARGE',
        });
      }
      const headers = [
        'First Name',
        'Last Name',
        'Email',
        'Phone',
        'Company',
        'Job Title',
        'Street',
        'City',
        'State',
        'ZIP',
        'Country',
        'Status',
        'Source',
        'Tags',
        'Created At',
      ];
      const body = rows.map((row) =>
        [
          row.first_name,
          row.last_name,
          row.email,
          row.phone,
          row.company,
          row.job_title,
          row.street,
          row.city,
          row.state,
          row.zip,
          row.country,
          row.status,
          row.source,
          row.tags,
          new Date(row.created_at).toISOString(),
        ]
          .map(csvCell)
          .join(','),
      );
      this.audit('contact_transfer_exported', {
        organizationId,
        userId,
        requestId,
        exported: rows.length,
      });
      return [headers.join(','), ...body].join('\n');
    } catch (error) {
      if (error instanceof PayloadTooLargeException) throw error;
      throw new ServiceUnavailableException({
        error: 'Contact export is unavailable',
        code: 'SERVICE_UNAVAILABLE',
      });
    }
  }

  async importContacts(
    organizationId: number,
    userId: number,
    body: unknown,
    requestId: string,
  ): Promise<ContactImportResult> {
    const envelope = validateImportEnvelope(body);
    if (typeof envelope === 'string') {
      throw new BadRequestException({
        error: envelope,
        code: 'INVALID_IMPORT',
      });
    }

    const normalized: NormalizedImportContact[] = [];
    const errors: ImportRowError[] = [];
    let errorCount = 0;
    envelope.contacts.forEach((row, index) => {
      try {
        normalized.push(this.normalizeRow(row, index + 1));
      } catch (error) {
        errorCount += 1;
        if (errors.length < MAX_REPORTED_IMPORT_ERRORS) {
          errors.push({
            row: index + 1,
            error: error instanceof Error ? error.message : 'Invalid contact row',
          });
        }
      }
    });

    try {
      const outcome = await this.repository.importRows(
        organizationId,
        userId,
        normalized,
        envelope.skipDuplicates,
      );
      if (outcome.kind === 'limit') {
        throw new ForbiddenException({
          error: 'Contact import would exceed the active organization limit',
          code: 'PLAN_LIMIT_REACHED',
          current: outcome.current,
          limit: outcome.limit,
          attempted: outcome.attempted,
        });
      }
      const result = {
        imported: outcome.imported,
        skipped: outcome.skipped,
        errors,
        errorCount,
        errorsTruncated: errorCount > errors.length,
      };
      this.audit('contact_transfer_imported', {
        organizationId,
        userId,
        requestId,
        imported: result.imported,
        skipped: result.skipped,
        rejected: result.errorCount,
      });
      return result;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ServiceUnavailableException({
        error: 'Contact import is unavailable',
        code: 'SERVICE_UNAVAILABLE',
      });
    }
  }

  private normalizeExportFilter(
    rawStatus: unknown,
    rawTags: unknown,
  ): ContactExportFilter {
    if (
      rawStatus !== undefined &&
      (typeof rawStatus !== 'string' || !statuses.has(rawStatus))
    ) {
      throw new BadRequestException({
        error: 'status must be active, inactive, or archived',
        code: 'INVALID_EXPORT_FILTER',
      });
    }
    let tags: string[] | undefined;
    if (rawTags !== undefined) {
      const candidates = Array.isArray(rawTags)
        ? rawTags.flatMap((value) =>
            typeof value === 'string' ? value.split(',') : [],
          )
        : typeof rawTags === 'string'
          ? rawTags.split(',')
          : [];
      tags = [...new Set(candidates.map((tag) => tag.trim()).filter(Boolean))];
      if (
        tags.length === 0 ||
        tags.length > 50 ||
        tags.some((tag) => tag.length > 50)
      ) {
        throw new BadRequestException({
          error: 'tags must contain 1-50 values of at most 50 characters',
          code: 'INVALID_EXPORT_FILTER',
        });
      }
    }
    return {
      ...(typeof rawStatus === 'string'
        ? { status: rawStatus as ContactExportFilter['status'] }
        : {}),
      ...(tags ? { tags } : {}),
    };
  }

  private normalizeRow(
    row: ImportContactRow,
    rowNumber: number,
  ): NormalizedImportContact {
    const columns = Object.keys(row);
    if (columns.length > MAX_IMPORT_COLUMNS) {
      throw new Error(
        `Row has more than ${MAX_IMPORT_COLUMNS} columns`,
      );
    }
    const unknown = columns.filter((column) => !IMPORT_FIELDS.has(column));
    if (unknown.length > 0) {
      throw new Error(`Unknown columns: ${unknown.join(', ')}`);
    }

    const firstName = this.aliasString(
      row,
      'first_name',
      'firstName',
      100,
    );
    const lastName = this.aliasString(row, 'last_name', 'lastName', 100);
    const company = this.string(row.company, 'company', 200);
    const jobTitle = this.aliasString(row, 'job_title', 'jobTitle', 100);
    const email = this.string(row.email, 'email', 255)?.toLowerCase() ?? null;
    if (email && !emailPattern.test(email)) {
      throw new Error('Invalid email format');
    }
    const phone = this.string(row.phone, 'phone', 50);
    if (phone && (!phonePattern.test(phone) || !/\d/.test(phone))) {
      throw new Error('Invalid phone number');
    }
    if (!firstName && !lastName && !email && !company) {
      throw new Error(
        'At least one of first name, last name, email, or company is required',
      );
    }

    const rawStatus = this.string(row.status, 'status', 20) ?? 'active';
    if (!statuses.has(rawStatus)) {
      throw new Error('status must be active, inactive, or archived');
    }
    return {
      firstName,
      lastName,
      email,
      phone,
      company,
      jobTitle,
      address: {
        ...this.addressValue(row.street, 'street', 200),
        ...this.addressValue(row.city, 'city', 100),
        ...this.addressValue(row.state, 'state', 100),
        ...this.addressValue(row.zip, 'zip', 30),
        ...this.addressValue(row.country, 'country', 100),
      },
      status: rawStatus as NormalizedImportContact['status'],
      tags: this.tags(row.tags),
      rowNumber,
    };
  }

  private aliasString(
    row: ImportContactRow,
    snake: string,
    camel: string,
    max: number,
  ): string | null {
    const snakePresent = Object.prototype.hasOwnProperty.call(row, snake);
    const camelPresent = Object.prototype.hasOwnProperty.call(row, camel);
    if (
      snakePresent &&
      camelPresent &&
      row[snake] !== row[camel]
    ) {
      throw new Error(`${snake} and ${camel} must not conflict`);
    }
    return this.string(
      snakePresent ? row[snake] : row[camel],
      snake,
      max,
    );
  }

  private string(
    value: unknown,
    field: string,
    max: number,
  ): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
      throw new Error(`${field} must be a string`);
    }
    const normalized = value.trim();
    if (normalized.length > max) {
      throw new Error(`${field} must not exceed ${max} characters`);
    }
    return normalized || null;
  }

  private addressValue(
    value: unknown,
    field: string,
    max: number,
  ): Record<string, string> {
    const normalized = this.string(value, field, max);
    return normalized ? { [field]: normalized } : {};
  }

  private tags(value: unknown): string[] {
    if (value === undefined || value === null || value === '') return [];
    const candidates =
      typeof value === 'string'
        ? value.split(';')
        : Array.isArray(value)
          ? value
          : null;
    if (!candidates || candidates.some((tag) => typeof tag !== 'string')) {
      throw new Error('tags must be a semicolon-delimited string or string array');
    }
    const normalized = [
      ...new Set(candidates.map((tag) => tag.trim()).filter(Boolean)),
    ];
    if (
      normalized.length > 50 ||
      normalized.some((tag) => tag.length > 50)
    ) {
      throw new Error(
        'tags must contain at most 50 values of at most 50 characters',
      );
    }
    return normalized;
  }

  private audit(event: string, details: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ event, ...details }));
  }
}
