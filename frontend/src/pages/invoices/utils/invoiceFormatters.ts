/**
 * Utility functions for formatting invoice-related data
 */

import { Contact } from '@/services/contactsApi';
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
