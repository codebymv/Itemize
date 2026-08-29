/**
 * Line items table for invoice editor
 * Manages product/service line items with quantity, price, and amounts
 */

import React from 'react';
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  showTaxRate?: boolean;
  onAddLineItem: () => void;
  onRemoveLineItem: (itemId: string) => void;
  onUpdateLineItem: (itemId: string, updates: Partial<LineItem>) => void;
  onProductSelect: (lineItemId: string, productIdStr: string) => void;
}

export function LineItemsTable({
  lineItems,
  products,
  currency,
  showTaxRate = false,
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
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            Line Items
          </CardTitle>
          <Badge variant="secondary">{lineItems.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Table Header */}
        <div className="hidden grid-cols-12 gap-3 border-b pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground lg:grid">
          <div className={showTaxRate ? 'col-span-4' : 'col-span-5'}>Items</div>
          <div className="col-span-2 text-center">Quantity</div>
          <div className="col-span-2 text-right">Price</div>
          {showTaxRate && <div className="col-span-1 text-right">Tax</div>}
          <div className="col-span-2 text-right">Amount</div>
          <div className="col-span-1"></div>
        </div>

        {/* Line Items */}
        <div className="divide-y">
          {lineItems.map((item) => (
            <div key={item.id} className="grid grid-cols-1 items-start gap-3 py-4 lg:grid-cols-12">
              {/* Item Name & Description */}
              <div className={showTaxRate ? 'space-y-2 lg:col-span-4' : 'space-y-2 lg:col-span-5'}>
                <Label className="text-xs text-muted-foreground lg:hidden">Item</Label>
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
              <div className="space-y-2 lg:col-span-2">
                <Label className="text-xs text-muted-foreground lg:hidden">Quantity</Label>
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
              <div className="space-y-2 lg:col-span-2">
                <Label className="text-xs text-muted-foreground lg:hidden">Price</Label>
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

              {showTaxRate && (
                <div className="space-y-2 lg:col-span-1">
                  <Label className="text-xs text-muted-foreground lg:hidden">Tax %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={item.tax_rate || ''}
                    onChange={(e) =>
                      onUpdateLineItem(item.id, {
                        tax_rate: e.target.value === '' ? 0 : parseFloat(e.target.value),
                      })
                    }
                    className="h-9 text-right"
                    aria-label={`Tax rate for ${item.name || 'line item'}`}
                  />
                </div>
              )}

              {/* Amount */}
              <div className="flex items-center justify-between pt-1 font-medium lg:col-span-2 lg:block lg:pt-2 lg:text-right">
                <span className="text-xs font-normal text-muted-foreground lg:hidden">Amount</span>
                <span>
                  {formatCurrency(
                    item.quantity
                      * item.unit_price
                      * (showTaxRate ? 1 + item.tax_rate / 100 : 1),
                  )}
                </span>
              </div>

              {/* Delete */}
              <div className="flex justify-end pt-1 lg:col-span-1 lg:justify-center">
                {lineItems.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onRemoveLineItem(item.id)}
                    aria-label="Remove line item"
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
          variant="outline"
          className="mt-4 border-blue-200/60 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-800/60 dark:text-blue-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
          onClick={onAddLineItem}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add an item
        </Button>
      </CardContent>
    </Card>
  );
}
