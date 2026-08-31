import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { GraphqlRequestError } from '@/services/graphqlClient';
import {
  getPaymentSettings,
  updatePaymentSettings,
  getBusinessPage,
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

export type PaymentsLoadError = 'organization' | 'settings' | 'subscription' | null;

const isSubscriptionRequired = (error: unknown): boolean =>
  error instanceof GraphqlRequestError && error.reason === 'SUBSCRIPTION_REQUIRED';

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
  loadError: PaymentsLoadError;
  businessesLoadError: boolean;
  hasMoreBusinesses: boolean;
  loadingMoreBusinesses: boolean;
  
  // Dialog states
  businessDialogOpen: boolean;
  editingBusiness: Business | null;
  businessFormData: BusinessFormData;
  pendingLogoFile: File | null;
  deleteDialogOpen: boolean;
  businessToDelete: Business | null;
  
  // Actions
  refetchData: () => Promise<void>;
  loadMoreBusinesses: () => Promise<void>;
  handleSaveSettings: () => Promise<void>;
  updateField: <K extends keyof PaymentSettings>(field: K, value: PaymentSettings[K]) => void;
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

export const usePaymentsTab = ({
  enabled = true,
}: {
  enabled?: boolean;
} = {}): UsePaymentsTabReturn => {
  const { toast } = useToast();
  const {
    organizationId,
    isLoading: organizationLoading,
    error: organizationError,
    refresh: refreshOrganization,
  } = useOrganization();

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
  const [loadError, setLoadError] = useState<PaymentsLoadError>(null);
  const [businessesLoadError, setBusinessesLoadError] = useState(false);
  const [businessPage, setBusinessPage] = useState(1);
  const [businessTotalPages, setBusinessTotalPages] = useState(1);
  const [loadingMoreBusinesses, setLoadingMoreBusinesses] = useState(false);

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
    if (!enabled) return;
    if (organizationLoading) return;

    let targetOrganizationId = organizationId;
    if (!targetOrganizationId) {
      setLoading(true);
      const repairedOrganization = await refreshOrganization();
      targetOrganizationId = repairedOrganization?.id ?? null;
      if (!targetOrganizationId) {
        setSettings(null);
        setBusinesses([]);
        setLoadError('organization');
        setBusinessesLoadError(false);
        setLoading(false);
        setInitialLoad(false);
        return;
      }
    }

    setLoading(true);
    setLoadError(null);
    setBusinessesLoadError(false);
    setBusinesses([]);

    try {
      // Business profiles enhance invoice setup, but should not prevent the core
      // payment settings from loading when their request fails independently.
      const [settingsResult, businessesResult] = await Promise.allSettled([
        getPaymentSettings(targetOrganizationId),
        getBusinessPage(1, 20, targetOrganizationId),
      ]);

      if (settingsResult.status === 'fulfilled') {
        const settingsData = settingsResult.value;
        setSettings(settingsData);
        setLoadError(null);

        // Keep zero visually empty to match the existing form behavior.
        const rate = settingsData.default_tax_rate;
        setTaxRateInput(rate === 0 || rate === null || rate === undefined ? '' : String(rate));
      } else {
        setSettings(null);
        setTaxRateInput('');
        setLoadError(isSubscriptionRequired(settingsResult.reason) ? 'subscription' : 'settings');
      }

      if (businessesResult.status === 'fulfilled') {
        setBusinesses(businessesResult.value.businesses);
        setBusinessPage(businessesResult.value.pagination.page);
        setBusinessTotalPages(businessesResult.value.pagination.totalPages);
      } else {
        setBusinesses([]);
        setBusinessPage(1);
        setBusinessTotalPages(1);
        setBusinessesLoadError(true);
      }
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [enabled, organizationId, organizationLoading, refreshOrganization]);

  const loadMoreBusinesses = useCallback(async () => {
    if (!organizationId || loadingMoreBusinesses || businessPage >= businessTotalPages) return;
    setLoadingMoreBusinesses(true);
    try {
      const next = await getBusinessPage(businessPage + 1, 20, organizationId);
      setBusinesses((current) => {
        const existing = new Set(current.map((business) => business.id));
        return [...current, ...next.businesses.filter((business) => !existing.has(business.id))];
      });
      setBusinessPage(next.pagination.page);
      setBusinessTotalPages(next.pagination.totalPages);
    } catch {
      toast({ title: 'Error', description: 'Failed to load more business profiles', variant: 'destructive' });
    } finally {
      setLoadingMoreBusinesses(false);
    }
  }, [businessPage, businessTotalPages, loadingMoreBusinesses, organizationId, toast]);

  // Surface a failed organization bootstrap as its own recovery state. The
  // context already attempts to create or select a default organization.
  useEffect(() => {
    if (!organizationLoading && organizationError && !organizationId) {
      setLoadError('organization');
      setInitialLoad(false);
    }
  }, [organizationError, organizationId, organizationLoading]);

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

  const updateField = useCallback(<K extends keyof PaymentSettings>(field: K, value: PaymentSettings[K]) => {
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
          } catch (logoError: unknown) {
            if (businessFormData.logo_url?.startsWith('blob:')) {
              URL.revokeObjectURL(businessFormData.logo_url);
            }
            toast({
              title: 'Created',
              description: 'Business saved. Add the failed logo upload later.',
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
    loadError,
    businessesLoadError,
    hasMoreBusinesses: businessPage < businessTotalPages,
    loadingMoreBusinesses,
    
    // Dialog states
    businessDialogOpen,
    editingBusiness,
    businessFormData,
    pendingLogoFile,
    deleteDialogOpen,
    businessToDelete,
    
    // Actions
    refetchData,
    loadMoreBusinesses,
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
