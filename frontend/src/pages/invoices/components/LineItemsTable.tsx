/**
 * Line items table for invoice editor
 * Manages product/service line items with quantity, price, and amounts
 */

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface LineItem {
  id: string;
  product_id?: number;
  name: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
}

interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  tax_rate?: number;
}

interface LineItemsTableProps {
  lineItems: LineItem[];
  products: Product[];
  currency: string;
  onAddLineItem: () => void;
  onRemoveLineItem: (itemId: string) => void;
  onUpdateLineItem: (itemId: string, updates: Partial<LineItem>) => void;
  onProductSelect: (lineItemId: string, productIdStr: string) => void;
}

export function LineItemsTable({
  lineItems,
  products,
  currency,
  onAddLineItem,
  onRemoveLineItem,
  onUpdateLineItem,
  onProductSelect,
}: LineItemsTableProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider pb-2 border-b">
          <div className="col-span-5">Items</div>
          <div className="col-span-2 text-center">Quantity</div>
          <div className="col-span-2 text-right">Price</div>
          <div className="col-span-2 text-right">Amount</div>
          <div className="col-span-1"></div>
        </div>

        {/* Line Items */}
        <div className="divide-y">
          {lineItems.map((item) => (
            <div key={item.id} className="grid grid-cols-12 gap-2 py-3 items-start">
              {/* Item Name & Description */}
              <div className="col-span-5 space-y-1">
                {products.length > 0 ? (
                  <Select
                    value={item.product_id?.toString() || 'custom'}
                    onValueChange={(v) => onProductSelect(item.id, v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select or type item" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom item</SelectItem>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id.toString()}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={item.name}
                    onChange={(e) =>
                      onUpdateLineItem(item.id, { name: e.target.value })
                    }
                    placeholder="Item name"
                    className="h-9"
                  />
                )}
                {item.product_id && (
                  <Input
                    value={item.name}
                    onChange={(e) =>
                      onUpdateLineItem(item.id, { name: e.target.value })
                    }
                    placeholder="Item name"
                    className="h-8 text-sm"
                  />
                )}
                <Input
                  value={item.description}
                  onChange={(e) =>
                    onUpdateLineItem(item.id, { description: e.target.value })
                  }
                  placeholder="Description (optional)"
                  className="h-8 text-sm text-muted-foreground"
                />
              </div>

              {/* Quantity */}
              <div className="col-span-2">
                <Input
                  type="number"
                  min="1"
                  value={item.quantity || ''}
                  onChange={(e) =>
                    onUpdateLineItem(item.id, {
                      quantity:
                        e.target.value === '' ? 1 : parseInt(e.target.value),
                    })
                  }
                  className="h-9 text-center"
                />
              </div>

              {/* Price */}
              <div className="col-span-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unit_price || ''}
                  onChange={(e) =>
                    onUpdateLineItem(item.id, {
                      unit_price:
                        e.target.value === '' ? 0 : parseFloat(e.target.value),
                    })
                  }
                  className="h-9 text-right"
                />
              </div>

              {/* Amount */}
              <div className="col-span-2 text-right pt-2 font-medium">
                {formatCurrency(item.quantity * item.unit_price)}
              </div>

              {/* Delete */}
              <div className="col-span-1 flex justify-center pt-1">
                {lineItems.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onRemoveLineItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add Item Button */}
        <Button
          variant="ghost"
          className="mt-4 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          onClick={onAddLineItem}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add an item
        </Button>
      </CardContent>
    </Card>
  );
}
