/**
 * Hook for managing line items state and operations
 */

import { useState, useCallback } from 'react';

export interface LineItem {
  id: string;
  product_id?: number;
  name: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
}

interface UseLineItemsReturn {
  lineItems: LineItem[];
  setLineItems: React.Dispatch<React.SetStateAction<LineItem[]>>;
  addLineItem: () => void;
  removeLineItem: (itemId: string) => void;
  updateLineItem: (itemId: string, updates: Partial<LineItem>) => void;
}

const createEmptyLineItem = (): LineItem => ({
  id: crypto.randomUUID(),
  name: '',
  description: '',
  quantity: 1,
  unit_price: 0,
  tax_rate: 0,
});

export function useLineItems(initialItems?: LineItem[]): UseLineItemsReturn {
  const [lineItems, setLineItems] = useState<LineItem[]>(
    initialItems || [createEmptyLineItem()]
  );

  const addLineItem = useCallback(() => {
    setLineItems((prev) => [...prev, createEmptyLineItem()]);
  }, []);

  const removeLineItem = useCallback((itemId: string) => {
    setLineItems((prev) => {
      // Keep at least one line item
      if (prev.length <= 1) return prev;
      return prev.filter((i) => i.id !== itemId);
    });
  }, []);

  const updateLineItem = useCallback(
    (itemId: string, updates: Partial<LineItem>) => {
      setLineItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, ...updates } : item
        )
      );
    },
    []
  );

  return {
    lineItems,
    setLineItems,
    addLineItem,
    removeLineItem,
    updateLineItem,
  };
}
