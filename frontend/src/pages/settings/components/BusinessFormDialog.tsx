import React, { useRef } from 'react';
import { Building, Upload, Trash2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getAssetUrl } from '@/lib/api';
import { type Business } from '@/services/invoicesApi';

interface BusinessFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  tax_id: string;
  logo_url: string;
}

interface BusinessFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingBusiness: Business | null;
  formData: BusinessFormData;
  saving: boolean;
  uploadingLogo: boolean;
  pendingLogoFile: File | null;
  onSave: () => void;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveLogo: () => void;
  onCancel: () => void;
  onFormChange: (field: keyof BusinessFormData, value: string) => void;
}

export const BusinessFormDialog: React.FC<BusinessFormDialogProps> = ({
  open,
  onOpenChange,
  editingBusiness,
  formData,
  saving,
  uploadingLogo,
  pendingLogoFile,
  onSave,
  onLogoUpload,
  onRemoveLogo,
  onCancel,
  onFormChange,
}) => {
  const businessFileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      if (formData.logo_url?.startsWith('blob:')) {
        URL.revokeObjectURL(formData.logo_url);
      }
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building className="h-5 w-5 text-blue-600" />
            {editingBusiness ? 'Edit Business' : 'Add Business'}
          </DialogTitle>
          <DialogDescription>
            {editingBusiness ? 'Update your business profile information' : 'Add a new business profile for invoicing'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Business Name *</Label>
            <Input
              value={formData.name}
              onChange={(e) => onFormChange('name' as keyof BusinessFormData, e.target.value)}
              placeholder="Your Business Name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => onFormChange('email' as keyof BusinessFormData, e.target.value)}
                placeholder="billing@business.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={formData.phone}
                onChange={(e) => onFormChange('phone' as keyof BusinessFormData, e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tax ID / VAT Number</Label>
            <Input
              value={formData.tax_id}
              onChange={(e) => onFormChange('tax_id' as keyof BusinessFormData, e.target.value)}
              placeholder="XX-XXXXXXX"
            />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Textarea
              value={formData.address}
              onChange={(e) => onFormChange('address' as keyof BusinessFormData, e.target.value)}
              placeholder="123 Business St, Suite 100\nCity, State 12345"
              rows={3}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="mt-1">
              {formData.logo_url ? (
                <div className="flex items-center gap-4 p-3 border rounded-lg">
                  <img
                    src={formData.logo_url.startsWith('blob:') || formData.logo_url.startsWith('http') 
                      ? formData.logo_url 
                      : getAssetUrl(formData.logo_url)}
                    alt="Business Logo"
                    className="h-12 w-auto object-contain rounded border bg-white"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => businessFileInputRef.current?.click()}
                      disabled={uploadingLogo || saving}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      {editingBusiness ? 'Replace' : 'Change'}
                    </Button>
                    {editingBusiness && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onRemoveLogo}
                        disabled={uploadingLogo}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Remove
                      </Button>
                    )}
                    {!editingBusiness && pendingLogoFile && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onRemoveLogo}
                        disabled={uploadingLogo || saving}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => businessFileInputRef.current?.click()}
                  disabled={uploadingLogo || saving}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadingLogo ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    'Upload Logo'
                  )}
                </Button>
              )}
              <input
                ref={businessFileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                onChange={onLogoUpload}
                className="hidden"
              />
              <p className="text-xs text-muted-foreground mt-2">
                PNG, JPG, GIF or WebP (max 2MB)
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || uploadingLogo}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : editingBusiness ? 'Save Changes' : 'Add Business'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};