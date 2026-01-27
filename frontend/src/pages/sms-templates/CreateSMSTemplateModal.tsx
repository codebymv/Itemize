import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
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
import { createSmsTemplate, getMessageInfo, MessageInfo } from '@/services/smsApi';
import { debounce } from 'lodash';

interface CreateSMSTemplateModalProps {
  organizationId: number;
  onClose: () => void;
  onCreated: (template: any) => void;
}

const TEMPLATE_CATEGORIES = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'transactional', label: 'Transactional' },
  { value: 'notification', label: 'Notification' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'confirmation', label: 'Confirmation' },
  { value: 'other', label: 'Other' },
];

// GSM-7 character limit per segment
const GSM_SINGLE_SEGMENT = 160;
const GSM_MULTI_SEGMENT = 153;
const UNICODE_SINGLE_SEGMENT = 70;
const UNICODE_MULTI_SEGMENT = 67;

export function CreateSMSTemplateModal({
  organizationId,
  onClose,
  onCreated,
}: CreateSMSTemplateModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    message: '',
    category: '',
    is_active: true,
  });
  const [messageInfo, setMessageInfo] = useState<MessageInfo>({
    length: 0,
    segments: 0,
    encoding: 'GSM',
    charsRemaining: GSM_SINGLE_SEGMENT,
  });

  // Debounced function to fetch message info from API
  const fetchMessageInfo = useCallback(
    debounce(async (message: string) => {
      if (!message) {
        setMessageInfo({
          length: 0,
          segments: 0,
          encoding: 'GSM',
          charsRemaining: GSM_SINGLE_SEGMENT,
        });
        return;
      }
      try {
        const info = await getMessageInfo(message);
        setMessageInfo(info);
      } catch (error) {
        // Calculate locally if API fails
        const length = message.length;
        const isUnicode = /[^\x00-\x7F]/.test(message);
        const singleLimit = isUnicode ? UNICODE_SINGLE_SEGMENT : GSM_SINGLE_SEGMENT;
        const multiLimit = isUnicode ? UNICODE_MULTI_SEGMENT : GSM_MULTI_SEGMENT;
        const segments = length <= singleLimit ? 1 : Math.ceil(length / multiLimit);
        const currentLimit = segments === 1 ? singleLimit : segments * multiLimit;
        setMessageInfo({
          length,
          segments,
          encoding: isUnicode ? 'Unicode' : 'GSM',
          charsRemaining: currentLimit - length,
        });
      }
    }, 300),
    []
  );

  useEffect(() => {
    fetchMessageInfo(formData.message);
  }, [formData.message, fetchMessageInfo]);

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

    if (!formData.message.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide message content',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const template = await createSmsTemplate({
        organization_id: organizationId,
        name: formData.name.trim(),
        message: formData.message,
        category: formData.category || undefined,
        is_active: formData.is_active,
      });
      toast({ title: 'Template created', description: 'SMS template has been created successfully' });
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

  const getSegmentColor = () => {
    if (messageInfo.segments === 0) return 'text-muted-foreground';
    if (messageInfo.segments === 1) return 'text-green-600';
    if (messageInfo.segments <= 3) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            Create SMS Template
          </DialogTitle>
          <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            Create a reusable SMS template for your campaigns and automations
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
                  placeholder="e.g., Appointment Reminder"
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
              <Label htmlFor="message" style={{ fontFamily: '"Raleway", sans-serif' }}>
                Message Content <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="message"
                value={formData.message}
                onChange={(e) => handleChange('message', e.target.value)}
                placeholder="Hi {{first_name}}, this is a reminder about your appointment tomorrow at {{time}}."
                className="min-h-[120px]"
              />
              
              {/* Message Info Display */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Variables: {'{{first_name}}'}, {'{{last_name}}'}, {'{{company}}'}, {'{{phone}}'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm border rounded-md p-2 bg-muted/30">
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">
                    {messageInfo.length} characters
                  </span>
                  <span className={getSegmentColor()}>
                    {messageInfo.segments} segment{messageInfo.segments !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {messageInfo.encoding} encoding
                  {messageInfo.charsRemaining > 0 && (
                    <span className="ml-2">({messageInfo.charsRemaining} chars left)</span>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                SMS messages over 160 characters (or 70 for Unicode) will be split into multiple segments.
                Each segment costs extra.
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
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              {loading ? 'Creating...' : 'Create Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateSMSTemplateModal;
