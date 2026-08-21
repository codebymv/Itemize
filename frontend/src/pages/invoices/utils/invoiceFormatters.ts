/**
 * Utility functions for formatting invoice-related data
 */

import { Contact } from '@/types';
import { Invoice } from '@/services/invoicesApi';

/**
 * Formats an address object or string into a single-line comma-separated string
 */
export function formatAddress(
  address: Contact['address'] | Invoice['customer_address'] | undefined
): string {
  if (!address) return '';
  if (typeof address === 'string') return address;

  const parts = [
    address.street,
    address.city,
    address.state,
    address.zip,
    address.country,
  ].filter(Boolean);

  return parts.join(', ');
}

/**
 * Calculates due date from issue date and payment terms
 */
export function calculateDueDate(issueDateStr: string, terms: number): string {
  const [year, month, day] = issueDateStr.split('-').map(Number);
  const issue = new Date(year, month - 1, day); // month is 0-indexed
  issue.setDate(issue.getDate() + terms);
  return `${issue.getFullYear()}-${String(issue.getMonth() + 1).padStart(2, '0')}-${String(issue.getDate()).padStart(2, '0')}`;
}

/**
 * Formats currency amount based on currency code
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

/**
 * Gets human-readable payment terms label
 */
export function getPaymentTermsLabel(days: number): string {
  if (days === 0) return 'Due on receipt';
  return `Within ${days} days`;
}

/**
 * Gets today's date in YYYY-MM-DD format (local timezone)
 */
export function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Formats a calendar date without allowing the viewer's timezone to shift it.
 *
 * API date fields may arrive as either YYYY-MM-DD or an ISO timestamp at UTC
 * midnight. In both cases, the first ten characters are the intended calendar
 * date rather than an instant that should be converted to local time.
 */
export function formatDateOnly(dateString: string, locale = 'en-US'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString);
  if (!match) return dateString;

  const [, yearString, monthString, dayString] = match;
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return dateString;
  }

  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC' }).format(date);
}

export const DEFAULT_INVOICE_FOOTER = 'Thank you for your business!';

/**
 * Footer field on the invoice editor is stored as terms_and_conditions.
 * Empty values keep the default thank-you line.
 */
export function getInvoiceFooterText(footer?: string | null): string {
  const trimmed = footer?.trim();
  return trimmed || DEFAULT_INVOICE_FOOTER;
}
