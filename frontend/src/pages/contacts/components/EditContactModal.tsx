import React, { useState } from 'react';
import { UserPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Contact } from '@/types';
import { updateContact } from '@/services/contactsApi';

interface EditContactModalProps {
  contact: Contact;
  organizationId: number;
  onClose: () => void;
  onUpdated: (contact: Contact) => void;
}

export function EditContactModal({
  contact,
  organizationId,
  onClose,
  onUpdated,
}: EditContactModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    first_name: contact.first_name || '',
    last_name: contact.last_name || '',
    email: contact.email || '',
    phone: contact.phone || '',
    company: contact.company || '',
    job_title: contact.job_title || '',
    status: contact.status,
    address: {
      street: contact.address?.street || '',
      city: contact.address?.city || '',
      state: contact.address?.state || '',
      zip: contact.address?.zip || '',
      country: contact.address?.country || '',
    },
  });

  const handleChange = (field: string, value: string) => {
    if (field.startsWith('address.')) {
      const addressField = field.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value,
        },
      }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate at least one identifier
    if (!formData.first_name && !formData.last_name && !formData.email && !formData.company) {
      toast({
        title: 'Error',
        description: 'Please provide at least a name, email, or company',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const updatedContact = await updateContact(contact.id, {
        ...formData,
        organization_id: organizationId,
      });
      onUpdated(updatedContact);
    } catch (error: any) {
      console.error('Error updating contact:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update contact',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPen className="h-5 w-5 text-blue-600" />
            Edit Contact
          </DialogTitle>
          <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            Update contact information
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name" style={{ fontFamily: '"Raleway", sans-serif' }}>First Name</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name" style={{ fontFamily: '"Raleway", sans-serif' }}>Last Name</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" style={{ fontFamily: '"Raleway", sans-serif' }}>Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="john@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company" style={{ fontFamily: '"Raleway", sans-serif' }}>Company</Label>
                <Input
                  id="company"
                  value={formData.company}
                  onChange={(e) => handleChange('company', e.target.value)}
                  placeholder="Acme Inc."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="job_title">Job Title</Label>
                <Input
                  id="job_title"
                  value={formData.job_title}
                  onChange={(e) => handleChange('job_title', e.target.value)}
                  placeholder="CEO"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status" style={{ fontFamily: '"Raleway", sans-serif' }}>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => handleChange('status', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                placeholder="Street address"
                value={formData.address.street}
                onChange={(e) => handleChange('address.street', e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City"
                  value={formData.address.city}
                  onChange={(e) => handleChange('address.city', e.target.value)}
                />
                <Input
                  placeholder="State/Province"
                  value={formData.address.state}
                  onChange={(e) => handleChange('address.state', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="ZIP/Postal code"
                  value={formData.address.zip}
                  onChange={(e) => handleChange('address.zip', e.target.value)}
                />
                <Input
                  placeholder="Country"
                  value={formData.address.country}
                  onChange={(e) => handleChange('address.country', e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} style={{ fontFamily: '"Raleway", sans-serif' }} aria-label="Cancel">
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default EditContactModal;
