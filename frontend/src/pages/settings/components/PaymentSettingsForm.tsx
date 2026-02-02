import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Link as LinkIcon, CheckCircle, XCircle } from 'lucide-react';
import type { PaymentSettings } from '@/services/invoicesApi';

interface PaymentSettingsFormProps {
  settings: PaymentSettings;
  taxRateInput: string;
  updateField: (field: keyof PaymentSettings, value: any) => void;
  setTaxRateInput: (value: string) => void;
  onConnectStripe?: () => void;
}

export const PaymentSettingsForm: React.FC<PaymentSettingsFormProps> = ({
  settings,
  taxRateInput,
  updateField,
  setTaxRateInput,
  onConnectStripe,
}) => {
  const handleTaxRateChange = (value: string) => {
    setTaxRateInput(value);
    const numValue = value === '' ? 0 : parseFloat(value);
    if (!isNaN(numValue)) {
      updateField('default_tax_rate' as keyof PaymentSettings, numValue);
    }
  };

  const handleTaxRateBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    if (value === '' || value === '-') {
      setTaxRateInput('');
      updateField('default_tax_rate' as keyof PaymentSettings, 0);
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        const clampedValue = Math.max(0, Math.min(100, numValue));
        setTaxRateInput(String(clampedValue));
        updateField('default_tax_rate' as keyof PaymentSettings, clampedValue);
      }
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice Settings</CardTitle>
          <CardDescription>Configure how your invoices are numbered and their default terms</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Invoice Prefix</Label>
              <Input
                value={settings.invoice_prefix || ''}
                onChange={(e) => updateField('invoice_prefix' as keyof PaymentSettings, e.target.value)}
                placeholder="INV-"
              />
            </div>
            <div>
              <Label>Next Invoice Number</Label>
              <Input
                type="number"
                min="1"
                value={settings.next_invoice_number || ''}
                onChange={(e) => updateField('next_invoice_number' as keyof PaymentSettings, e.target.value === '' ? 1 : parseInt(e.target.value))}
              />
            </div>
            <div>
              <Label>Default Payment Due</Label>
              <Select
                value={String(settings.default_payment_terms || 30)}
                onValueChange={(v) => updateField('default_payment_terms' as keyof PaymentSettings, parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Due on receipt</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="15">15 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="45">45 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Default Notes</Label>
            <Textarea
              value={settings.default_notes || ''}
              onChange={(e) => updateField('default_notes' as keyof PaymentSettings, e.target.value)}
              placeholder="Thank you for your business!"
              rows={2}
            />
          </div>
          <div>
            <Label>Default Terms & Conditions</Label>
            <Textarea
              value={settings.default_terms || ''}
              onChange={(e) => updateField('default_terms' as keyof PaymentSettings, e.target.value)}
              placeholder="Payment is due within the specified terms."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tax Settings</CardTitle>
          <CardDescription>Configure default tax rates for new products and invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Default Tax Rate (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={taxRateInput}
                onChange={(e) => handleTaxRateChange(e.target.value)}
                onBlur={handleTaxRateBlur}
                className="w-full"
              />
            </div>
            <div>
              <Label>Default Currency</Label>
              <Select
                value={settings.default_currency || 'USD'}
                onValueChange={(v) => updateField('default_currency' as keyof PaymentSettings, v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                  <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Online Payments</CardTitle>
          <CardDescription>Connect Stripe to accept online payments from your customers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 border rounded-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${settings.stripe_connected ? 'bg-green-100 dark:bg-green-900' : 'bg-muted'}`}>
                  {settings.stripe_connected ? (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  ) : (
                    <XCircle className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {settings.stripe_connected ? 'Stripe Connected' : 'Stripe Not Connected'}
                  </p>
                  <p className="text-sm text-muted-foreground break-words">
                    {settings.stripe_connected
                      ? `Connected ${settings.stripe_connected_at ? new Date(settings.stripe_connected_at).toLocaleDateString() : ''}`
                      : 'Connect your Stripe account to accept credit card payments'}
                  </p>
                </div>
              </div>
              <Button
                variant={settings.stripe_connected ? 'outline' : 'default'}
                className={`w-full sm:w-auto flex-shrink-0 ${!settings.stripe_connected ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                onClick={onConnectStripe}
              >
                <LinkIcon className="h-4 w-4 mr-2" />
                {settings.stripe_connected ? 'Manage Connection' : 'Connect Stripe'}
              </Button>
            </div>
          </div>
          {settings.stripe_connected && settings.stripe_account_id && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Stripe Account ID: <code className="text-xs">{settings.stripe_account_id}</code>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};