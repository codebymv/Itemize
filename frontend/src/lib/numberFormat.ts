export type NumericInput = number | string;

export interface NumericFormatOptions {
  locale?: Intl.LocalesArgument;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

export interface MoneyFormatOptions extends NumericFormatOptions {
  currency: string;
}

function numericValue(value: NumericInput): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedCurrency(currency: string): string {
  return currency.trim().toUpperCase() || 'USD';
}

function numberFormatter(
  notation: 'standard' | 'compact',
  options: NumericFormatOptions,
  tight = false,
) {
  return new Intl.NumberFormat(options.locale, {
    notation,
    compactDisplay: notation === 'compact' ? 'short' : undefined,
    minimumFractionDigits: tight ? 0 : options.minimumFractionDigits,
    maximumFractionDigits: tight ? 0 : options.maximumFractionDigits,
  });
}

function moneyFormatter(
  notation: 'standard' | 'compact',
  options: MoneyFormatOptions,
  tight = false,
) {
  return new Intl.NumberFormat(options.locale, {
    style: 'currency',
    currency: normalizedCurrency(options.currency),
    notation,
    compactDisplay: notation === 'compact' ? 'short' : undefined,
    minimumFractionDigits: tight ? 0 : options.minimumFractionDigits,
    maximumFractionDigits: tight ? 0 : options.maximumFractionDigits,
  });
}

function compactMagnitude(value: number): { scaledValue: number; suffix: string } {
  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 1_000_000_000_000) return { scaledValue: value / 1_000_000_000_000, suffix: 'T' };
  if (absoluteValue >= 1_000_000_000) return { scaledValue: value / 1_000_000_000, suffix: 'B' };
  if (absoluteValue >= 1_000_000) return { scaledValue: value / 1_000_000, suffix: 'M' };
  if (absoluteValue >= 1_000) return { scaledValue: value / 1_000, suffix: 'K' };
  return { scaledValue: value, suffix: '' };
}

function formatScaledMoney(
  value: NumericInput,
  options: MoneyFormatOptions,
  maximumFractionDigits: number,
): string {
  const { scaledValue, suffix } = compactMagnitude(numericValue(value));
  try {
    const parts = new Intl.NumberFormat(options.locale, {
      style: 'currency',
      currency: normalizedCurrency(options.currency),
      minimumFractionDigits: 0,
      maximumFractionDigits,
    }).formatToParts(scaledValue);
    const lastNumberPart = parts.reduce((lastIndex, part, index) => (
      ['integer', 'group', 'decimal', 'fraction'].includes(part.type) ? index : lastIndex
    ), -1);
    return parts.map((part, index) => `${part.value}${index === lastNumberPart ? suffix : ''}`).join('');
  } catch {
    return `${normalizedCurrency(options.currency)} ${formatScaledNumber(value, options, maximumFractionDigits)}`;
  }
}

function formatScaledNumber(
  value: NumericInput,
  options: NumericFormatOptions,
  maximumFractionDigits: number,
): string {
  const { scaledValue, suffix } = compactMagnitude(numericValue(value));
  return `${new Intl.NumberFormat(options.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(scaledValue)}${suffix}`;
}

export function formatNumber(value: NumericInput, options: NumericFormatOptions = {}): string {
  return numberFormatter('standard', options).format(numericValue(value));
}

export function formatCompactNumber(value: NumericInput, options: NumericFormatOptions = {}): string {
  return formatScaledNumber(value, options, options.maximumFractionDigits ?? 1);
}

export function formatTightNumber(value: NumericInput, options: NumericFormatOptions = {}): string {
  return formatScaledNumber(value, options, 0);
}

export function formatMoney(value: NumericInput, options: MoneyFormatOptions): string {
  try {
    return moneyFormatter('standard', options).format(numericValue(value));
  } catch {
    return `${normalizedCurrency(options.currency)} ${formatNumber(value, options)}`;
  }
}

export function formatCompactMoney(value: NumericInput, options: MoneyFormatOptions): string {
  return formatScaledMoney(value, options, options.maximumFractionDigits ?? 1);
}

export function formatTightMoney(value: NumericInput, options: MoneyFormatOptions): string {
  return formatScaledMoney(value, options, 0);
}
