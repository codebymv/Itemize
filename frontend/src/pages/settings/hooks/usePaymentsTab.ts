import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import {
  getPaymentSettings,
  updatePaymentSettings,
  getBusinesses,
  createBusiness,
  updateBusiness,
  deleteBusiness,
  uploadBusinessLogo,
  type PaymentSettings,
  type Business,
} from '@/services/invoicesApi';

interface BusinessFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  tax_id: string;
  logo_url: string;
}

interface UsePaymentsTabReturn {
  // Loading states
  loading: boolean;
  initialLoad: boolean;
  saving: boolean;
  savingBusiness: boolean;
  uploadingLogo: boolean;
  
  // Data
  settings: PaymentSettings | null;
  businesses: Business[];
  taxRateInput: string;
  
  // Dialog states
  businessDialogOpen: boolean;
  editingBusiness: Business | null;
  businessFormData: BusinessFormData;
  pendingLogoFile: File | null;
  deleteDialogOpen: boolean;
  businessToDelete: Business | null;
  
  // Actions
  refetchData: () => Promise<void>;
  handleSaveSettings: () => Promise<void>;
  updateField: (field: keyof PaymentSettings, value: any) => void;
  setTaxRateInput: (value: string) => void;
  openBusinessDialog: (business?: Business) => void;
  closeBusinessDialog: () => void;
  handleSaveBusiness: () => Promise<void>;
  handleDeleteBusiness: () => Promise<void>;
  handleDeleteClick: (business: Business) => void;
  handleBusinessLogoUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleRemoveLogo: () => void;
  
  // Dialog setters
  setBusinessDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setBusinessFormData: React.Dispatch<React.SetStateAction<BusinessFormData>>;
  setPendingLogoFile: React.Dispatch<React.SetStateAction<File | null>>;
  setDeleteDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const usePaymentsTab = (): UsePaymentsTabReturn => {
  const { toast } = useToast();
  const { organizationId } = useOrganization();

  // Loading states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Data
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [taxRateInput, setTaxRateInput] = useState<string>('');
  const [initialLoad, setInitialLoad] = useState(true);

  // Dialog states
  const [businessDialogOpen, setBusinessDialogOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [businessFormData, setBusinessFormData] = useState<BusinessFormData>({
    name: '',
    email: '',
    phone: '',
    address: '',
    tax_id: '',
    logo_url: '',
  });
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [businessToDelete, setBusinessToDelete] = useState<Business | null>(null);

  // Unified data fetching
  const refetchData = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      // Fetch both data sources in parallel
      const [settingsData, businessesData] = await Promise.all([
        getPaymentSettings(organizationId),
        getBusinesses(organizationId),
      ]);

      setSettings(settingsData);
      setBusinesses(businessesData);
      
      // Set tax rate input
      const rate = settingsData.default_tax_rate;
      setTaxRateInput(rate === 0 || rate === null || rate === undefined ? '' : String(rate));
    } catch (error) {
      toast({ 
        title: 'Error', 
        description: 'Failed to load payment data. Please try again.', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [organizationId, toast]);

  // Auto-fetch data when organizationId changes
  useEffect(() => {
    refetchData();
  }, [refetchData]);

  // Settings actions
  const handleSaveSettings = useCallback(async () => {
    if (!organizationId || !settings) return;

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
    setSettings(prev => prev ? { ...prev, [field]: value } : null);
  }, []);

  // Business management actions
  const openBusinessDialog = useCallback((business?: Business) => {
    if (businessFormData.logo_url?.startsWith('blob:')) {
      URL.revokeObjectURL(businessFormData.logo_url);
    }

    if (business) {
      setEditingBusiness(business);
      setBusinessFormData({
        name: business.name || '',
        email: business.email || '',
        phone: business.phone || '',
        address: business.address || '',
        tax_id: business.tax_id || '',
        logo_url: business.logo_url || '',
      });
    } else {
      setEditingBusiness(null);
      setBusinessFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        tax_id: '',
        logo_url: '',
      });
      setPendingLogoFile(null);
    }
    setBusinessDialogOpen(true);
  }, [businessFormData.logo_url]);

  const closeBusinessDialog = useCallback(() => {
    if (businessFormData.logo_url?.startsWith('blob:')) {
      URL.revokeObjectURL(businessFormData.logo_url);
    }
    setBusinessDialogOpen(false);
    setEditingBusiness(null);
  }, [businessFormData.logo_url]);

  const handleSaveBusiness = useCallback(async () => {
    if (!organizationId) return;
    if (!businessFormData.name.trim()) {
      toast({ title: 'Error', description: 'Business name is required', variant: 'destructive' });
      return;
    }

    setSavingBusiness(true);
    try {
      if (editingBusiness) {
        const updated = await updateBusiness(editingBusiness.id, businessFormData, organizationId);
        setBusinesses(prev => prev.map(b => b.id === updated.id ? updated : b));
        toast({ title: 'Updated', description: 'Business updated successfully' });
      } else {
        const created = await createBusiness(businessFormData, organizationId);
        setBusinesses(prev => [created, ...prev]);

        if (pendingLogoFile) {
          try {
            setUploadingLogo(true);
            const result = await uploadBusinessLogo(created.id, pendingLogoFile, organizationId);
            const updated = await updateBusiness(created.id, { ...businessFormData, logo_url: result.logo_url }, organizationId);
            setBusinesses(prev => prev.map(b => b.id === updated.id ? updated : b));
            if (businessFormData.logo_url?.startsWith('blob:')) {
              URL.revokeObjectURL(businessFormData.logo_url);
            }
            toast({ title: 'Created', description: 'Business created with logo successfully' });
          } catch (logoError: any) {
            if (businessFormData.logo_url?.startsWith('blob:')) {
              URL.revokeObjectURL(businessFormData.logo_url);
            }
            toast({
              title: 'Created',
              description: 'Business created but logo upload failed. You can add a logo later.',
              variant: 'default'
            });
          } finally {
            setUploadingLogo(false);
            setPendingLogoFile(null);
          }
        } else {
          toast({ title: 'Created', description: 'Business created successfully' });
        }
      }
      setBusinessDialogOpen(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save business', variant: 'destructive' });
    } finally {
      setSavingBusiness(false);
    }
  }, [organizationId, editingBusiness, businessFormData, pendingLogoFile, toast]);

  const handleDeleteClick = useCallback((business: Business) => {
    setBusinessToDelete(business);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteBusiness = useCallback(async () => {
    if (!editingBusiness) return;
    try {
      await deleteBusiness(editingBusiness.id, organizationId);
      setBusinesses(prev => prev.filter(b => b.id !== editingBusiness.id));
      toast({ title: 'Deleted', description: 'Business deleted successfully' });
      setDeleteDialogOpen(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete business', variant: 'destructive' });
    }
  }, [editingBusiness, organizationId, toast]);

  const handleBusinessLogoUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !organizationId) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Please upload a JPEG, PNG, GIF, or WebP image.', variant: 'destructive' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 2MB.', variant: 'destructive' });
      return;
    }

    if (editingBusiness) {
      setUploadingLogo(true);
      try {
        const result = await uploadBusinessLogo(editingBusiness.id, file, organizationId);
        const updated = await updateBusiness(editingBusiness.id, { ...businessFormData, logo_url: result.logo_url }, organizationId);
        setBusinesses(prev => prev.map(b => b.id === updated.id ? updated : b));
        toast({ title: 'Success', description: 'Logo uploaded successfully' });
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to upload logo', variant: 'destructive' });
      } finally {
        setUploadingLogo(false);
      }
    } else {
      setPendingLogoFile(file);
      const objectUrl = URL.createObjectURL(file);
      setBusinessFormData(prev => ({ ...prev, logo_url: objectUrl }));
    }
  }, [organizationId, editingBusiness, businessFormData, toast]);

  const handleRemoveLogo = useCallback(() => {
    if (businessFormData?.logo_url?.startsWith('blob:')) {
      URL.revokeObjectURL(businessFormData.logo_url);
    }
    setPendingLogoFile(null);
    setBusinessFormData((prev: BusinessFormData) => ({ ...prev, logo_url: '' }));
    const inputRef = (document.querySelector('input[type="file"]') as HTMLInputElement);
    if (inputRef) {
      inputRef.value = '';
    }
  }, [businessFormData.logo_url]);

  return {
    // Loading states
    loading,
    initialLoad,
    saving,
    savingBusiness,
    uploadingLogo,
    
    // Data
    settings,
    businesses,
    taxRateInput,
    
    // Dialog states
    businessDialogOpen,
    editingBusiness,
    businessFormData,
    pendingLogoFile,
    deleteDialogOpen,
    businessToDelete,
    
    // Actions
    refetchData,
    handleSaveSettings,
    updateField,
    setTaxRateInput,
    openBusinessDialog,
    closeBusinessDialog,
    handleSaveBusiness,
    handleDeleteBusiness,
    handleDeleteClick,
    handleBusinessLogoUpload,
    handleRemoveLogo,
    
    // Dialog setters
    setBusinessDialogOpen,
    setBusinessFormData,
    setPendingLogoFile,
    setDeleteDialogOpen,
  };
};