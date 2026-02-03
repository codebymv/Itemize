/**
 * Hook for invoice calculations (subtotal, tax, discount, total)
 */

import { useMemo } from 'react';

export interface LineItem {
  id: string;
  product_id?: number;
  name: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
}

interface UseInvoiceCalculationsParams {
  lineItems: LineItem[];
  taxRate: number;
  discountType: 'fixed' | 'percent';
  discountValue: number;
}

interface InvoiceCalculations {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
}

export function useInvoiceCalculations({
  lineItems,
  taxRate,
  discountType,
  discountValue,
}: UseInvoiceCalculationsParams): InvoiceCalculations {
  return useMemo(() => {
    // Calculate subtotal from all line items
    const subtotal = lineItems.reduce((sum, item) => {
      return sum + item.quantity * item.unit_price;
    }, 0);

    // Calculate tax from global tax rate
    const taxAmount = subtotal * (taxRate / 100);

    // Calculate discount (either fixed amount or percentage of subtotal)
    const discountAmount =
      discountType === 'percent'
        ? subtotal * (discountValue / 100)
        : discountValue;

    // Calculate final total
    const total = subtotal + taxAmount - discountAmount;

    return {
      subtotal,
      taxAmount,
      discountAmount,
      total,
    };
  }, [lineItems, taxRate, discountType, discountValue]);
}
