export const MAX_IMPORT_ROWS = 10_000;
export const MAX_EXPORT_ROWS = 50_000;
export const MAX_IMPORT_COLUMNS = 20;
export const MAX_REPORTED_IMPORT_ERRORS = 100;

export const IMPORT_FIELDS = new Set([
  'first_name',
  'firstName',
  'last_name',
  'lastName',
  'email',
  'phone',
  'company',
  'job_title',
  'jobTitle',
  'street',
  'city',
  'state',
  'zip',
  'country',
  'status',
  'tags',
]);

export type ImportContactRow = Record<string, unknown>;

export type NormalizedImportContact = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  address: Record<string, string>;
  status: 'active' | 'inactive' | 'archived';
  tags: string[];
  rowNumber: number;
};

export type ImportRowError = {
  row: number;
  error: string;
};

export type ContactImportRequest = {
  contacts: ImportContactRow[];
  skipDuplicates: boolean;
};

export type ContactImportResult = {
  imported: number;
  skipped: number;
  errors: ImportRowError[];
  errorCount: number;
  errorsTruncated: boolean;
};

export type ContactExportFilter = {
  status?: 'active' | 'inactive' | 'archived';
  tags?: string[];
};

export type ContactExportRow = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  status: string;
  source: string;
  tags: string | null;
  created_at: Date | string;
};

export const protectSpreadsheetCell = (value: unknown): string => {
  const normalized = value === null || value === undefined ? '' : String(value);
  return /^[\t\r ]*[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
};

export const csvCell = (value: unknown): string =>
  `"${protectSpreadsheetCell(value).replace(/"/g, '""')}"`;

export const validateImportEnvelope = (
  body: unknown,
): ContactImportRequest | string => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Import body must be an object';
  }
  const candidate = body as Record<string, unknown>;
  if (!Array.isArray(candidate.contacts) || candidate.contacts.length === 0) {
    return 'No contacts data provided';
  }
  if (candidate.contacts.length > MAX_IMPORT_ROWS) {
    return `Contact imports are limited to ${MAX_IMPORT_ROWS} rows`;
  }
  const skipDuplicates = candidate.skipDuplicates ?? true;
  if (typeof skipDuplicates !== 'boolean') {
    return 'skipDuplicates must be a boolean';
  }
  if (
    candidate.contacts.some(
      (row) => !row || typeof row !== 'object' || Array.isArray(row),
    )
  ) {
    return 'Every imported contact must be an object';
  }
  return {
    contacts: candidate.contacts as ImportContactRow[],
    skipDuplicates,
  };
};
