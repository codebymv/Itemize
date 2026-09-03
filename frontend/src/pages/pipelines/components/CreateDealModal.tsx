import React, { useState } from 'react';
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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { createDealFormSchema, type CreateDealFormValues } from '@/lib/formSchemas';
import logger from '@/lib/logger';
import { ContactCatalogPicker } from '@/components/ContactCatalogPicker';
import { useSingleFlightAction } from '@/hooks/useSingleFlightAction';
import { useStableMutationKey } from '@/hooks/useStableMutationKey';

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const responseData = (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  return responseData?.error || responseData?.message || fallback;
};

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
  const { pending: loading, run, dismissIfIdle } = useSingleFlightAction();
  const createAttempt = useStableMutationKey('deal-create');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

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

  const handleSubmit = async (values: CreateDealFormValues) => {
    await run(async () => {
      const dealData = {
        pipeline_id: pipelineId,
        title: values.title.trim(),
        value: values.value ? parseFloat(values.value) : 0,
        stage_id: values.stage_id,
        contact_id: values.contact_id ? parseInt(values.contact_id) : undefined,
        probability: values.probability ? parseInt(values.probability) : 0,
        expected_close_date: values.expected_close_date || undefined,
        organization_id: organizationId,
      };
      const idempotencyKey = createAttempt.begin(JSON.stringify(dealData));
      if (!idempotencyKey) return;
      let deal: Deal;
      try {
        deal = await createDeal(dealData, idempotencyKey);
      } catch (error) {
        createAttempt.release();
        logger.error('Error creating deal:', error);
        toast({
          title: 'Error',
          description: getApiErrorMessage(error, 'Failed to create deal'),
          variant: 'destructive',
        });
        return;
      }
      createAttempt.reset();
      onCreated(deal);
      form.reset();
      setSelectedContact(null);
    });
  };

  const close = () => {
    createAttempt.reset();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && dismissIfIdle(close)}>
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
                        step="0.01"
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
                  <ContactCatalogPicker
                    organizationId={organizationId}
                    selectedContact={selectedContact}
                    onSelect={(contact) => {
                      setSelectedContact(contact);
                      field.onChange(contact ? String(contact.id) : '');
                    }}
                    placeholder="Select a contact (optional)"
                  />
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
              <Button type="button" variant="outline" onClick={() => dismissIfIdle(close)} disabled={loading} style={{ fontFamily: '"Raleway", sans-serif' }} aria-label="Cancel">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 interaction-button--primary text-white"
                style={{ fontFamily: '"Raleway", sans-serif' }}
                aria-label={loading ? 'Creating deal...' : 'Create deal'}
                aria-busy={loading || undefined}
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
