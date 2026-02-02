import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import {
  getBusinesses,
  createBusiness,
  updateBusiness,
  deleteBusiness,
  uploadBusinessLogo,
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

interface UseBusinessManagementReturn {
  businesses: Business[];
  loading: boolean;
  savingBusiness: boolean;
  uploadingLogo: boolean;
  businessDialogOpen: boolean;
  editingBusiness: Business | null;
  businessFormData: BusinessFormData;
  pendingLogoFile: File | null;
  fetchData: () => Promise<void>;
  openBusinessDialog: (business?: Business) => void;
  closeBusinessDialog: () => void;
  handleSaveBusiness: () => Promise<void>;
  handleDeleteBusiness: () => Promise<void>;
  handleBusinessLogoUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  setBusinessDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setBusinessFormData: React.Dispatch<React.SetStateAction<BusinessFormData>>;
  setPendingLogoFile: React.Dispatch<React.SetStateAction<File | null>>;
}

export const useBusinessManagement = (): UseBusinessManagementReturn => {
  const { toast } = useToast();
  const { organizationId } = useOrganization();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [businessDialogOpen, setBusinessDialogOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [businessFormData, setBusinessFormData] = useState<BusinessFormData>({
    name: '',
    email: '',
    phone: '',
    address: '',
    tax_id: '',
    logo_url: '',
  });

  const fetchData = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const businessesData = await getBusinesses(organizationId);
      setBusinesses(businessesData);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load businesses', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

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

  const handleDeleteBusiness = useCallback(async () => {
    if (!editingBusiness) return;
    try {
      await deleteBusiness(editingBusiness.id, organizationId);
      setBusinesses(prev => prev.filter(b => b.id !== editingBusiness.id));
      toast({ title: 'Deleted', description: 'Business deleted successfully' });
      setBusinessDialogOpen(false);
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

  return {
    businesses,
    loading,
    savingBusiness,
    uploadingLogo,
    businessDialogOpen,
    editingBusiness,
    businessFormData,
    pendingLogoFile,
    fetchData,
    openBusinessDialog,
    closeBusinessDialog,
    handleSaveBusiness,
    handleDeleteBusiness,
    handleBusinessLogoUpload,
    setBusinessDialogOpen,
    setBusinessFormData,
    setPendingLogoFile,
  };
};