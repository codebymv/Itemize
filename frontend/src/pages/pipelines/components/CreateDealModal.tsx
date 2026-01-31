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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { createDealFormSchema, type CreateDealFormValues } from '@/lib/formSchemas';
import logger from '@/lib/logger';

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

  const form = useForm<CreateDealFormValues>({
    resolver: zodResolver(createDealFormSchema),
    defaultValues: {
      title: '',
      value: '',
      stage_id: initialStageId || (stages[0]?.id || ''),
      contact_id: '',
      probability: '0',
      expected_close_date: '',
    },
  });

  // Fetch contacts for dropdown
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const response = await getContacts({ organization_id: organizationId, limit: 100 });
        setContacts(response.contacts);
      } catch (error) {
        logger.error('Error fetching contacts:', error);
      }
    };
    fetchContacts();
  }, [organizationId]);

  const handleSubmit = async (values: CreateDealFormValues) => {
    setLoading(true);
    try {
      const deal = await createDeal({
        pipeline_id: pipelineId,
        title: values.title.trim(),
        value: values.value ? parseFloat(values.value) : 0,
        stage_id: values.stage_id,
        contact_id: values.contact_id ? parseInt(values.contact_id) : undefined,
        probability: values.probability ? parseInt(values.probability) : 0,
        expected_close_date: values.expected_close_date || undefined,
        organization_id: organizationId,
      });
      onCreated(deal);
      form.reset();
    } catch (error: any) {
      logger.error('Error creating deal:', error);
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
            <DollarSign className="h-5 w-5 text-blue-600" />
            Create New Deal
          </DialogTitle>
          <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            Add a new opportunity to your pipeline
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4 py-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel htmlFor="title" style={{ fontFamily: '"Raleway", sans-serif' }}>Deal Title *</FormLabel>
                  <FormControl>
                    <Input
                      id="title"
                      placeholder="e.g., Enterprise Contract - Acme Corp"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel htmlFor="value" style={{ fontFamily: '"Raleway", sans-serif' }}>Value ($)</FormLabel>
                    <FormControl>
                      <Input
                        id="value"
                        type="number"
                        placeholder="0"
                        min="0"
                        step="100"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stage_id"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel htmlFor="stage" style={{ fontFamily: '"Raleway", sans-serif' }}>Stage</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="contact_id"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel htmlFor="contact" style={{ fontFamily: '"Raleway", sans-serif' }}>Contact</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="probability"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel htmlFor="probability" style={{ fontFamily: '"Raleway", sans-serif' }}>Probability (%)</FormLabel>
                    <FormControl>
                      <Input
                        id="probability"
                        type="number"
                        placeholder="0"
                        min="0"
                        max="100"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expected_close_date"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel htmlFor="expected_close_date" style={{ fontFamily: '"Raleway", sans-serif' }}>Expected Close</FormLabel>
                    <FormControl>
                      <Input
                        id="expected_close_date"
                        type="date"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                aria-label={loading ? 'Creating deal...' : 'Create deal'}
              >
                {loading ? 'Creating...' : 'Create Deal'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateDealModal;
