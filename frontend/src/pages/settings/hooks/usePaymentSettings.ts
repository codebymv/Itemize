import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import {
  getPaymentSettings,
  updatePaymentSettings,
  type PaymentSettings,
} from '@/services/invoicesApi';

interface UsePaymentSettingsReturn {
  loading: boolean;
  saving: boolean;
  settings: PaymentSettings;
  taxRateInput: string;
  setLoading: (loading: boolean) => void;
  handleSaveSettings: () => Promise<void>;
  updateField: (field: keyof PaymentSettings, value: any) => void;
  setTaxRateInput: (value: string) => void;
}

export const usePaymentSettings = (): UsePaymentSettingsReturn => {
  const { toast } = useToast();
  const { organizationId } = useOrganization();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PaymentSettings>({
    invoice_prefix: 'INV-',
    next_invoice_number: 1,
    default_payment_terms: 30,
    default_tax_rate: 10,
    default_currency: 'USD',
    stripe_connected: false,
  });
  const [taxRateInput, setTaxRateInput] = useState<string>('');

  const fetchData = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const settingsData = await getPaymentSettings(organizationId);
      setSettings(settingsData);
      const rate = settingsData.default_tax_rate;
      setTaxRateInput(rate === 0 || rate === null || rate === undefined ? '' : String(rate));
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load settings', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  const handleSaveSettings = useCallback(async () => {
    if (!organizationId) return;

    setSaving(true);
    try {
      const updated = await updatePaymentSettings(settings, organizationId);
      setSettings(updated);
      const rate = updated.default_tax_rate;
      setTaxRateInput(rate === 0 || rate === null || rate === undefined ? '' : String(rate));
      toast({ title: 'Saved', description: 'Payment settings saved successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [organizationId, settings, toast]);

  const updateField = useCallback((field: keyof PaymentSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    loading,
    saving,
    settings,
    taxRateInput,
    setLoading,
    handleSaveSettings,
    updateField,
    setTaxRateInput,
  };
};