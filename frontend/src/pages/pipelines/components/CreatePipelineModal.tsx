import React from 'react';
import { Kanban, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Pipeline } from '@/types';
import { createPipeline, updatePipeline } from '@/services/pipelinesApi';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createPipelineFormSchema,
  type CreatePipelineFormValues,
} from '@/lib/formSchemas';

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const responseData = (error as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  return responseData?.error || responseData?.message || fallback;
};

interface CreatePipelineModalProps {
  organizationId: number;
  onClose: () => void;
  onCreated: (pipeline: Pipeline) => void;
  pipeline?: Pipeline;
  onUpdated?: (pipeline: Pipeline) => void;
}

export function CreatePipelineModal({
  organizationId,
  onClose,
  onCreated,
  pipeline,
  onUpdated,
}: CreatePipelineModalProps) {
  const { toast } = useToast();
  const isEditing = Boolean(pipeline);
  const form = useForm<CreatePipelineFormValues>({
    resolver: zodResolver(createPipelineFormSchema),
    defaultValues: {
      name: pipeline?.name ?? '',
      description: pipeline?.description ?? '',
      is_default: pipeline?.is_default ?? false,
      stages: pipeline?.stages.map((stage) => ({ ...stage })) ?? [],
    },
  });
  const stages = form.watch('stages');
  const loading = form.formState.isSubmitting;

  const addStage = () => {
    form.setValue('stages', [
      ...form.getValues('stages'),
      {
        id: crypto.randomUUID(),
        name: 'New stage',
        color: '#3B82F6',
        order: form.getValues('stages').length,
      },
    ], { shouldDirty: true, shouldValidate: true });
  };

  const removeStage = (stageId: string) => {
    form.setValue('stages', form.getValues('stages')
      .filter((stage) => stage.id !== stageId)
      .map((stage, order) => ({ ...stage, order })), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleSubmit = async (values: CreatePipelineFormValues) => {
    try {
      const payload = {
        name: values.name.trim(),
        description: values.description.trim() || (isEditing ? null : undefined),
        is_default: values.is_default,
        organization_id: organizationId,
      };
      if (pipeline) {
        const updatedPipeline = await updatePipeline(pipeline.id, {
          ...payload,
          stages: values.stages.map((stage, order) => ({
            ...stage,
            name: stage.name.trim(),
            color: stage.color.toUpperCase(),
            order,
          })),
        });
        onUpdated?.(updatedPipeline);
      } else {
        const createdPipeline = await createPipeline(payload);
        onCreated(createdPipeline);
      }
    } catch (error) {
      console.error(`Error ${isEditing ? 'updating' : 'creating'} pipeline:`, error);
      toast({
        title: 'Error',
        description: getApiErrorMessage(
          error,
          `Failed to ${isEditing ? 'update' : 'create'} pipeline`,
        ),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Kanban className="h-5 w-5 text-blue-600" />
            {isEditing ? 'Edit Pipeline' : 'Create New Pipeline'}
          </DialogTitle>
          <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            {isEditing
              ? "Update this pipeline's details and stages"
              : 'Create a new sales pipeline with default stages'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <div className="grid gap-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pipeline Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Sales Pipeline, Enterprise Deals"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional description for this pipeline"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_default"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <FormLabel>Set as Default</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      New deals will use this pipeline by default
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {isEditing ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Stages</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addStage}>
                    <Plus className="h-4 w-4" />
                    Add stage
                  </Button>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {stages.map((stage, index) => (
                    <div key={stage.id} className="flex items-center gap-2 rounded-md border p-2">
                      <FormField
                        control={form.control}
                        name={`stages.${index}.color`}
                        render={({ field }) => (
                          <FormItem className="shrink-0">
                            <FormControl>
                              <Input
                                type="color"
                                className="h-9 w-11 cursor-pointer p-1"
                                aria-label={`Stage ${index + 1} color`}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`stages.${index}.name`}
                        render={({ field }) => (
                          <FormItem className="min-w-0 flex-1">
                            <FormControl>
                              <Input
                                aria-label={`Stage ${index + 1} name`}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeStage(stage.id)}
                        disabled={stages.length === 1}
                        aria-label={`Remove ${stage.name} stage`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  A stage containing deals cannot be removed.
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm font-medium mb-2">Default Stages</p>
                <div className="flex flex-wrap gap-1">
                  {['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'].map((stage) => (
                    <span
                      key={stage}
                      className="text-xs px-2 py-1 rounded bg-background"
                    >
                      {stage}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  You can customize stages later in Pipeline settings
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} style={{ fontFamily: '"Raleway", sans-serif' }} aria-label="Cancel">
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-blue-600 interaction-button--primary text-white"
              style={{ fontFamily: '"Raleway", sans-serif' }}
              aria-label={loading
                ? `${isEditing ? 'Saving' : 'Creating'} pipeline...`
                : `${isEditing ? 'Save' : 'Create'} pipeline`}
            >
              {loading
                ? (isEditing ? 'Saving...' : 'Creating...')
                : (isEditing ? 'Save Changes' : 'Create Pipeline')}
            </Button>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default CreatePipelineModal;
