import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { CreditCard, FileText, Percent } from 'lucide-react';
import { IntegrationProviderMark } from '@/components/brand/IntegrationProviderMark';
import { SettingsSectionTitle } from '@/components/settings/SettingsPrimitives';
import { IntegrationStatusRow } from '@/components/integrations/IntegrationStatusRow';
import type { PaymentSettings } from '@/services/invoicesApi';

interface PaymentSettingsFormProps {
  settings: PaymentSettings;
  taxRateInput: string;
  updateField: <K extends keyof PaymentSettings>(field: K, value: PaymentSettings[K]) => void;
  setTaxRateInput: (value: string) => void;
  onConnectStripe?: () => void;
  onDisconnectStripe?: () => void;
  connectingStripe?: boolean;
}

export const PaymentSettingsForm: React.FC<PaymentSettingsFormProps> = ({
  settings,
  taxRateInput,
  updateField,
  setTaxRateInput,
  onConnectStripe,
  onDisconnectStripe,
  connectingStripe = false,
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
          <SettingsSectionTitle icon={FileText}>Invoice Settings</SettingsSectionTitle>
        </CardHeader>
        <CardContent surface="inset" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="invoice-prefix">Invoice Prefix</Label>
              <Input
                id="invoice-prefix"
                value={settings.invoice_prefix || ''}
                onChange={(e) => updateField('invoice_prefix' as keyof PaymentSettings, e.target.value)}
                placeholder="INV-"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="next-invoice-number">Next Invoice Number</Label>
              <Input
                id="next-invoice-number"
                type="number"
                min="1"
                value={settings.next_invoice_number || ''}
                onChange={(e) => updateField('next_invoice_number' as keyof PaymentSettings, e.target.value === '' ? 1 : parseInt(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="default-payment-due">Default Payment Due</Label>
              <Select
                value={String(settings.default_payment_terms || 30)}
                onValueChange={(v) => updateField('default_payment_terms' as keyof PaymentSettings, parseInt(v))}
              >
                <SelectTrigger id="default-payment-due">
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
          <div className="grid gap-2">
            <Label htmlFor="default-invoice-notes">Default Notes</Label>
            <Textarea
              id="default-invoice-notes"
              value={settings.default_notes || ''}
              onChange={(e) => updateField('default_notes' as keyof PaymentSettings, e.target.value)}
              placeholder="Thank you for your business!"
              rows={2}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="default-invoice-terms">Default Terms &amp; Conditions</Label>
            <Textarea
              id="default-invoice-terms"
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
          <SettingsSectionTitle icon={Percent}>Tax Settings</SettingsSectionTitle>
        </CardHeader>
        <CardContent surface="inset">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="default-tax-rate">Default Tax Rate (%)</Label>
              <Input
                id="default-tax-rate"
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
            <div className="grid gap-2">
              <Label htmlFor="default-currency">Default Currency</Label>
              <Select
                value={settings.default_currency || 'USD'}
                onValueChange={(v) => updateField('default_currency' as keyof PaymentSettings, v)}
              >
                <SelectTrigger id="default-currency" className="w-full">
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
          <SettingsSectionTitle icon={CreditCard}>Online Payments</SettingsSectionTitle>
        </CardHeader>
        <CardContent surface="inset">
          <div className="rounded-lg border">
            <IntegrationStatusRow
              name="Stripe"
              description="Accept card payments on invoices to your Stripe account."
              detail={settings.stripe_connected_at
                ? `Connected ${new Date(settings.stripe_connected_at).toLocaleDateString()}`
                : settings.stripe_account_id
                  ? 'Setup in progress'
                  : undefined}
              status={settings.stripe_connected ? 'connected' : 'disconnected'}
              icon={<IntegrationProviderMark provider="stripe" />}
              primaryLabel={settings.stripe_connected
                ? 'Reconnect'
                : settings.stripe_account_id
                  ? 'Continue setup'
                  : 'Connect'}
              onPrimary={onConnectStripe}
              onDisconnect={settings.stripe_connected ? onDisconnectStripe : undefined}
              busy={connectingStripe}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
};
