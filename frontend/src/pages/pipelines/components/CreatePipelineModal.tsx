import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { createPipeline } from '@/services/pipelinesApi';

interface CreatePipelineModalProps {
  organizationId: number;
  onClose: () => void;
  onCreated: (pipeline: Pipeline) => void;
}

export function CreatePipelineModal({
  organizationId,
  onClose,
  onCreated,
}: CreatePipelineModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_default: false,
  });

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Pipeline name is required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const pipeline = await createPipeline({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        is_default: formData.is_default,
        organization_id: organizationId,
      });
      onCreated(pipeline);
    } catch (error: any) {
      console.error('Error creating pipeline:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create pipeline',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Create New Pipeline</DialogTitle>
          <DialogDescription>
            Create a new sales pipeline with default stages
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Pipeline Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g., Sales Pipeline, Enterprise Deals"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Optional description for this pipeline"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Set as Default</Label>
                <p className="text-sm text-muted-foreground">
                  New deals will use this pipeline by default
                </p>
              </div>
              <Switch
                checked={formData.is_default}
                onCheckedChange={(checked) => handleChange('is_default', checked)}
              />
            </div>

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
                You can customize stages after creating the pipeline
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Pipeline'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreatePipelineModal;
