import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { createEmailTemplate } from '@/services/automationsApi';

interface CreateEmailTemplateModalProps {
  organizationId: number;
  onClose: () => void;
  onCreated: (template: any) => void;
}

const TEMPLATE_CATEGORIES = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'transactional', label: 'Transactional' },
  { value: 'notification', label: 'Notification' },
  { value: 'welcome', label: 'Welcome' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'other', label: 'Other' },
];

export function CreateEmailTemplateModal({
  organizationId,
  onClose,
  onCreated,
}: CreateEmailTemplateModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    body_html: '',
    body_text: '',
    category: '',
    is_active: true,
  });

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a template name',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.subject.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide an email subject',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.body_html.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide email content',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const template = await createEmailTemplate({
        organization_id: organizationId,
        name: formData.name.trim(),
        subject: formData.subject.trim(),
        body_html: formData.body_html,
        body_text: formData.body_text || undefined,
        category: formData.category || undefined,
        is_active: formData.is_active,
      });
      toast({ title: 'Template created', description: 'Email template has been created successfully' });
      onCreated(template);
    } catch (error: any) {
      console.error('Error creating template:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create template',
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
            <Mail className="h-5 w-5 text-blue-600" />
            Create Email Template
          </DialogTitle>
          <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            Create a reusable email template for your campaigns and automations
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Template Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="e.g., Welcome Email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Category
                </Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => handleChange('category', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject" style={{ fontFamily: '"Raleway", sans-serif' }}>
                Email Subject <span className="text-red-500">*</span>
              </Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => handleChange('subject', e.target.value)}
                placeholder="e.g., Welcome to {{company_name}}!"
              />
              <p className="text-xs text-muted-foreground">
                Use {'{{variable_name}}'} for dynamic content
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="body_html" style={{ fontFamily: '"Raleway", sans-serif' }}>
                Email Content (HTML) <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="body_html"
                value={formData.body_html}
                onChange={(e) => handleChange('body_html', e.target.value)}
                placeholder="<p>Hello {{first_name}},</p><p>Welcome to our platform!</p>"
                className="min-h-[150px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Enter HTML content. Variables: {'{{first_name}}'}, {'{{last_name}}'}, {'{{email}}'}, {'{{company}}'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="body_text" style={{ fontFamily: '"Raleway", sans-serif' }}>
                Plain Text Version (Optional)
              </Label>
              <Textarea
                id="body_text"
                value={formData.body_text}
                onChange={(e) => handleChange('body_text', e.target.value)}
                placeholder="Hello {{first_name}}, Welcome to our platform!"
                className="min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground">
                Fallback for email clients that don't support HTML
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => handleChange('is_active', checked as boolean)}
              />
              <Label
                htmlFor="is_active"
                className="text-sm font-normal cursor-pointer"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                Active (template can be used in campaigns)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              style={{ fontFamily: '"Raleway", sans-serif' }}
              aria-label="Cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              style={{ fontFamily: '"Raleway", sans-serif' }}
              aria-label={loading ? 'Creating template...' : 'Create template'}
            >
              {loading ? 'Creating...' : 'Create Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateEmailTemplateModal;
