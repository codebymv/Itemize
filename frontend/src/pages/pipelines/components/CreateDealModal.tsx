import React, { useState, useEffect } from 'react';
import { DollarSign } from 'lucide-react';
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
import { Deal, PipelineStage, Contact } from '@/types';
import { createDeal } from '@/services/pipelinesApi';
import { getContacts } from '@/services/contactsApi';

interface CreateDealModalProps {
  pipelineId: number;
  stages: PipelineStage[];
  initialStageId?: string;
  organizationId: number;
  onClose: () => void;
  onCreated: (deal: Deal) => void;
}

export function CreateDealModal({
  pipelineId,
  stages,
  initialStageId,
  organizationId,
  onClose,
  onCreated,
}: CreateDealModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    value: '',
    stage_id: initialStageId || (stages[0]?.id || ''),
    contact_id: '',
    probability: '0',
    expected_close_date: '',
  });

  // Fetch contacts for dropdown
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const response = await getContacts({ organization_id: organizationId, limit: 100 });
        setContacts(response.contacts);
      } catch (error) {
        console.error('Error fetching contacts:', error);
      }
    };
    fetchContacts();
  }, [organizationId]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast({
        title: 'Error',
        description: 'Deal title is required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const deal = await createDeal({
        pipeline_id: pipelineId,
        title: formData.title.trim(),
        value: formData.value ? parseFloat(formData.value) : 0,
        stage_id: formData.stage_id,
        contact_id: formData.contact_id ? parseInt(formData.contact_id) : undefined,
        probability: formData.probability ? parseInt(formData.probability) : 0,
        expected_close_date: formData.expected_close_date || undefined,
        organization_id: organizationId,
      });
      onCreated(deal);
    } catch (error: any) {
      console.error('Error creating deal:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create deal',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getContactDisplayName = (contact: Contact) => {
    const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
    if (name && contact.company) return `${name} (${contact.company})`;
    return name || contact.email || contact.company || 'Unnamed';
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-blue-500" />
            Create New Deal
          </DialogTitle>
          <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            Add a new opportunity to your pipeline
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title" style={{ fontFamily: '"Raleway", sans-serif' }}>Deal Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder="e.g., Enterprise Contract - Acme Corp"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="value" style={{ fontFamily: '"Raleway", sans-serif' }}>Value ($)</Label>
                <Input
                  id="value"
                  type="number"
                  value={formData.value}
                  onChange={(e) => handleChange('value', e.target.value)}
                  placeholder="0"
                  min="0"
                  step="100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stage" style={{ fontFamily: '"Raleway", sans-serif' }}>Stage</Label>
                <Select
                  value={formData.stage_id}
                  onValueChange={(value) => handleChange('stage_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: stage.color }}
                          />
                          {stage.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact" style={{ fontFamily: '"Raleway", sans-serif' }}>Contact</Label>
              <Select
                value={formData.contact_id}
                onValueChange={(value) => handleChange('contact_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a contact (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No contact</SelectItem>
                  {contacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id.toString()}>
                      {getContactDisplayName(contact)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="probability" style={{ fontFamily: '"Raleway", sans-serif' }}>Probability (%)</Label>
                <Input
                  id="probability"
                  type="number"
                  value={formData.probability}
                  onChange={(e) => handleChange('probability', e.target.value)}
                  placeholder="0"
                  min="0"
                  max="100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected_close_date" style={{ fontFamily: '"Raleway", sans-serif' }}>Expected Close</Label>
                <Input
                  id="expected_close_date"
                  type="date"
                  value={formData.expected_close_date}
                  onChange={(e) => handleChange('expected_close_date', e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} style={{ fontFamily: '"Raleway", sans-serif' }}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              {loading ? 'Creating...' : 'Create Deal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateDealModal;
