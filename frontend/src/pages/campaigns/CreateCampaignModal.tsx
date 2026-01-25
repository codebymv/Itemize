import React, { useState, useEffect, useCallback } from 'react';
import { Send, Mail, FileText, Users, Clock, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { createCampaign, previewCampaign } from '@/services/campaignsApi';
import { getEmailTemplates, EmailTemplate } from '@/services/emailApi';
import { getSegments, Segment, getFilterOptions, FilterOptions } from '@/services/segmentsApi';

interface CreateCampaignModalProps {
  organizationId: number;
  onClose: () => void;
  onCreated: (campaign: any) => void;
}

const STEPS = [
  { id: 'basic', label: 'Basic Info', icon: Mail },
  { id: 'content', label: 'Content', icon: FileText },
  { id: 'audience', label: 'Audience', icon: Users },
  { id: 'schedule', label: 'Schedule', icon: Clock },
];

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European Time' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time' },
  { value: 'Australia/Sydney', label: 'Australia Eastern Time' },
  { value: 'UTC', label: 'UTC' },
];

export function CreateCampaignModal({
  organizationId,
  onClose,
  onCreated,
}: CreateCampaignModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  
  // Data loading
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    // Basic Info
    name: '',
    subject: '',
    from_name: '',
    from_email: '',
    reply_to: '',
    
    // Content
    content_source: 'template' as 'template' | 'custom',
    template_id: null as number | null,
    content_html: '',
    content_text: '',
    
    // Audience
    segment_type: 'all' as 'all' | 'tag' | 'status' | 'segment',
    tag_ids: [] as number[],
    excluded_tag_ids: [] as number[],
    status_filter: 'active',
    segment_id: null as number | null,
    
    // Schedule
    send_immediately: true,
    scheduled_at: '',
    scheduled_time: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
  });

  // Load templates, segments, and filter options
  useEffect(() => {
    const loadData = async () => {
      try {
        const [templatesRes, segmentsRes, optionsRes] = await Promise.all([
          getEmailTemplates(organizationId, { is_active: true }),
          getSegments({ is_active: true }, organizationId),
          getFilterOptions(organizationId),
        ]);
        setTemplates(templatesRes.templates || []);
        setSegments(segmentsRes || []);
        setFilterOptions(optionsRes);
      } catch (error) {
        console.error('Error loading data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load campaign data',
          variant: 'destructive',
        });
      } finally {
        setLoadingData(false);
      }
    };
    loadData();
  }, [organizationId]);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTagToggle = (tagId: number, field: 'tag_ids' | 'excluded_tag_ids') => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].includes(tagId)
        ? prev[field].filter(id => id !== tagId)
        : [...prev[field], tagId],
    }));
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 0: // Basic Info
        if (!formData.name.trim()) {
          toast({ title: 'Error', description: 'Campaign name is required', variant: 'destructive' });
          return false;
        }
        if (!formData.subject.trim()) {
          toast({ title: 'Error', description: 'Email subject is required', variant: 'destructive' });
          return false;
        }
        return true;
      case 1: // Content
        if (formData.content_source === 'template' && !formData.template_id) {
          toast({ title: 'Error', description: 'Please select an email template', variant: 'destructive' });
          return false;
        }
        if (formData.content_source === 'custom' && !formData.content_html.trim()) {
          toast({ title: 'Error', description: 'Email content is required', variant: 'destructive' });
          return false;
        }
        return true;
      case 2: // Audience
        if (formData.segment_type === 'tag' && formData.tag_ids.length === 0) {
          toast({ title: 'Error', description: 'Please select at least one tag', variant: 'destructive' });
          return false;
        }
        if (formData.segment_type === 'segment' && !formData.segment_id) {
          toast({ title: 'Error', description: 'Please select a segment', variant: 'destructive' });
          return false;
        }
        return true;
      case 3: // Schedule
        if (!formData.send_immediately && !formData.scheduled_at) {
          toast({ title: 'Error', description: 'Please select a send date', variant: 'destructive' });
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    // Validate all steps
    for (let i = 0; i <= 3; i++) {
      if (!validateStep(i)) {
        setCurrentStep(i);
        return;
      }
    }

    setLoading(true);
    try {
      // Build scheduled_at datetime
      let scheduledAt: string | undefined;
      if (!formData.send_immediately && formData.scheduled_at) {
        const dateTime = formData.scheduled_time 
          ? `${formData.scheduled_at}T${formData.scheduled_time}:00`
          : `${formData.scheduled_at}T09:00:00`;
        scheduledAt = new Date(dateTime).toISOString();
      }

      const campaignData: any = {
        name: formData.name.trim(),
        subject: formData.subject.trim(),
        from_name: formData.from_name.trim() || undefined,
        from_email: formData.from_email.trim() || undefined,
        reply_to: formData.reply_to.trim() || undefined,
        segment_type: formData.segment_type,
        send_immediately: formData.send_immediately,
        timezone: formData.timezone,
      };

      // Add content
      if (formData.content_source === 'template') {
        campaignData.template_id = formData.template_id;
      } else {
        campaignData.content_html = formData.content_html;
        campaignData.content_text = formData.content_text || undefined;
      }

      // Add audience targeting
      if (formData.segment_type === 'tag') {
        campaignData.tag_ids = formData.tag_ids;
      } else if (formData.segment_type === 'status') {
        campaignData.segment_filter = { status: formData.status_filter };
      } else if (formData.segment_type === 'segment') {
        campaignData.segment_id = formData.segment_id;
      }

      if (formData.excluded_tag_ids.length > 0) {
        campaignData.excluded_tag_ids = formData.excluded_tag_ids;
      }

      // Add scheduling
      if (scheduledAt) {
        campaignData.scheduled_at = scheduledAt;
      }

      const campaign = await createCampaign(campaignData, organizationId);
      toast({ title: 'Campaign created', description: 'Your campaign has been created successfully' });
      onCreated(campaign);
    } catch (error: any) {
      console.error('Error creating campaign:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create campaign',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === formData.template_id);
  const selectedSegment = segments.find(s => s.id === formData.segment_id);

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Basic Info
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" style={{ fontFamily: '"Raleway", sans-serif' }}>
                Campaign Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g., Summer Sale 2026"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject" style={{ fontFamily: '"Raleway", sans-serif' }}>
                Email Subject <span className="text-red-500">*</span>
              </Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => handleChange('subject', e.target.value)}
                placeholder="e.g., Don't miss our Summer Sale!"
              />
              <p className="text-xs text-muted-foreground">
                Use {'{{first_name}}'} for personalization
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="from_name" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  From Name
                </Label>
                <Input
                  id="from_name"
                  value={formData.from_name}
                  onChange={(e) => handleChange('from_name', e.target.value)}
                  placeholder="Your Company"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="from_email" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  From Email
                </Label>
                <Input
                  id="from_email"
                  type="email"
                  value={formData.from_email}
                  onChange={(e) => handleChange('from_email', e.target.value)}
                  placeholder="hello@yourcompany.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reply_to" style={{ fontFamily: '"Raleway", sans-serif' }}>
                Reply-To Email
              </Label>
              <Input
                id="reply_to"
                type="email"
                value={formData.reply_to}
                onChange={(e) => handleChange('reply_to', e.target.value)}
                placeholder="support@yourcompany.com"
              />
            </div>
          </div>
        );

      case 1: // Content
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Content Source</Label>
              <RadioGroup
                value={formData.content_source}
                onValueChange={(v) => handleChange('content_source', v)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="template" id="source-template" />
                  <Label htmlFor="source-template" className="cursor-pointer">Use Template</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="source-custom" />
                  <Label htmlFor="source-custom" className="cursor-pointer">Custom Content</Label>
                </div>
              </RadioGroup>
            </div>

            {formData.content_source === 'template' ? (
              <div className="space-y-2">
                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Select Template <span className="text-red-500">*</span>
                </Label>
                {loadingData ? (
                  <p className="text-muted-foreground text-sm">Loading templates...</p>
                ) : templates.length === 0 ? (
                  <Card>
                    <CardContent className="py-6 text-center text-muted-foreground">
                      No templates available. Create a template first or use custom content.
                    </CardContent>
                  </Card>
                ) : (
                  <ScrollArea className="h-[200px] border rounded-md">
                    <div className="p-2 space-y-2">
                      {templates.map((template) => (
                        <div
                          key={template.id}
                          onClick={() => handleChange('template_id', template.id)}
                          className={`p-3 rounded cursor-pointer border ${
                            formData.template_id === template.id
                              ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
                              : 'hover:bg-muted border-transparent'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{template.name}</p>
                              <p className="text-sm text-muted-foreground">{template.subject}</p>
                            </div>
                            {formData.template_id === template.id && (
                              <Check className="h-5 w-5 text-blue-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="content_html" style={{ fontFamily: '"Raleway", sans-serif' }}>
                    Email Content (HTML) <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="content_html"
                    value={formData.content_html}
                    onChange={(e) => handleChange('content_html', e.target.value)}
                    placeholder="<p>Hello {{first_name}},</p><p>We have exciting news...</p>"
                    className="min-h-[150px] font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content_text" style={{ fontFamily: '"Raleway", sans-serif' }}>
                    Plain Text Version
                  </Label>
                  <Textarea
                    id="content_text"
                    value={formData.content_text}
                    onChange={(e) => handleChange('content_text', e.target.value)}
                    placeholder="Hello {{first_name}}, We have exciting news..."
                    className="min-h-[80px]"
                  />
                </div>
              </div>
            )}
          </div>
        );

      case 2: // Audience
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Target Audience</Label>
              <RadioGroup
                value={formData.segment_type}
                onValueChange={(v) => handleChange('segment_type', v)}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2 p-2 rounded border hover:bg-muted">
                  <RadioGroupItem value="all" id="audience-all" />
                  <Label htmlFor="audience-all" className="flex-1 cursor-pointer">
                    <span className="font-medium">All Contacts</span>
                    <p className="text-sm text-muted-foreground">Send to all active contacts</p>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-2 rounded border hover:bg-muted">
                  <RadioGroupItem value="tag" id="audience-tag" />
                  <Label htmlFor="audience-tag" className="flex-1 cursor-pointer">
                    <span className="font-medium">By Tags</span>
                    <p className="text-sm text-muted-foreground">Target contacts with specific tags</p>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-2 rounded border hover:bg-muted">
                  <RadioGroupItem value="status" id="audience-status" />
                  <Label htmlFor="audience-status" className="flex-1 cursor-pointer">
                    <span className="font-medium">By Status</span>
                    <p className="text-sm text-muted-foreground">Target contacts with a specific status</p>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-2 rounded border hover:bg-muted">
                  <RadioGroupItem value="segment" id="audience-segment" />
                  <Label htmlFor="audience-segment" className="flex-1 cursor-pointer">
                    <span className="font-medium">By Segment</span>
                    <p className="text-sm text-muted-foreground">Use a pre-defined segment</p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {formData.segment_type === 'tag' && filterOptions && (
              <div className="space-y-2">
                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Select Tags <span className="text-red-500">*</span>
                </Label>
                <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[60px]">
                  {filterOptions.tags.length === 0 ? (
                    <span className="text-muted-foreground text-sm">No tags available</span>
                  ) : (
                    filterOptions.tags.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant={formData.tag_ids.includes(tag.id) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => handleTagToggle(tag.id, 'tag_ids')}
                      >
                        <span 
                          className="w-2 h-2 rounded-full mr-1" 
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            )}

            {formData.segment_type === 'status' && (
              <div className="space-y-2">
                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Contact Status</Label>
                <Select
                  value={formData.status_filter}
                  onValueChange={(v) => handleChange('status_filter', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.segment_type === 'segment' && (
              <div className="space-y-2">
                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Select Segment <span className="text-red-500">*</span>
                </Label>
                {segments.length === 0 ? (
                  <Card>
                    <CardContent className="py-4 text-center text-muted-foreground text-sm">
                      No segments available. Create a segment first.
                    </CardContent>
                  </Card>
                ) : (
                  <Select
                    value={formData.segment_id?.toString() || ''}
                    onValueChange={(v) => handleChange('segment_id', parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select segment..." />
                    </SelectTrigger>
                    <SelectContent>
                      {segments.map((segment) => (
                        <SelectItem key={segment.id} value={segment.id.toString()}>
                          {segment.name} ({segment.contact_count} contacts)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {filterOptions && filterOptions.tags.length > 0 && (
              <div className="space-y-2">
                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Exclude Tags (Optional)</Label>
                <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[40px]">
                  {filterOptions.tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={formData.excluded_tag_ids.includes(tag.id) ? 'destructive' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => handleTagToggle(tag.id, 'excluded_tag_ids')}
                    >
                      <span 
                        className="w-2 h-2 rounded-full mr-1" 
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Contacts with these tags will be excluded from the campaign
                </p>
              </div>
            )}
          </div>
        );

      case 3: // Schedule
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label style={{ fontFamily: '"Raleway", sans-serif' }}>When to Send</Label>
              <RadioGroup
                value={formData.send_immediately ? 'now' : 'scheduled'}
                onValueChange={(v) => handleChange('send_immediately', v === 'now')}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2 p-3 rounded border hover:bg-muted">
                  <RadioGroupItem value="now" id="send-now" />
                  <Label htmlFor="send-now" className="flex-1 cursor-pointer">
                    <span className="font-medium">Send Immediately</span>
                    <p className="text-sm text-muted-foreground">
                      Campaign will start sending right after creation
                    </p>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-3 rounded border hover:bg-muted">
                  <RadioGroupItem value="scheduled" id="send-scheduled" />
                  <Label htmlFor="send-scheduled" className="flex-1 cursor-pointer">
                    <span className="font-medium">Schedule for Later</span>
                    <p className="text-sm text-muted-foreground">
                      Choose a specific date and time to send
                    </p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {!formData.send_immediately && (
              <div className="space-y-4 p-4 border rounded-md bg-muted/30">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="scheduled_at" style={{ fontFamily: '"Raleway", sans-serif' }}>
                      Send Date <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="scheduled_at"
                      type="date"
                      value={formData.scheduled_at}
                      onChange={(e) => handleChange('scheduled_at', e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scheduled_time" style={{ fontFamily: '"Raleway", sans-serif' }}>
                      Send Time
                    </Label>
                    <Input
                      id="scheduled_time"
                      type="time"
                      value={formData.scheduled_time}
                      onChange={(e) => handleChange('scheduled_time', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone" style={{ fontFamily: '"Raleway", sans-serif' }}>
                    Timezone
                  </Label>
                  <Select
                    value={formData.timezone}
                    onValueChange={(v) => handleChange('timezone', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Summary Card */}
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Campaign Summary</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><strong>Name:</strong> {formData.name || '(not set)'}</p>
                <p><strong>Subject:</strong> {formData.subject || '(not set)'}</p>
                <p><strong>Content:</strong> {formData.content_source === 'template' ? (selectedTemplate?.name || 'Template not selected') : 'Custom content'}</p>
                <p><strong>Audience:</strong> {
                  formData.segment_type === 'all' ? 'All contacts' :
                  formData.segment_type === 'tag' ? `Tags: ${formData.tag_ids.length} selected` :
                  formData.segment_type === 'status' ? `Status: ${formData.status_filter}` :
                  formData.segment_type === 'segment' ? (selectedSegment?.name || 'Segment not selected') : ''
                }</p>
                <p><strong>Send:</strong> {formData.send_immediately ? 'Immediately' : formData.scheduled_at ? `${formData.scheduled_at} ${formData.scheduled_time || '09:00'}` : 'Not scheduled'}</p>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-blue-500" />
            Create Campaign
          </DialogTitle>
          <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            Create an email campaign to send to your contacts
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center justify-between px-2 py-3 border-b">
          {STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = index === currentStep;
            const isComplete = index < currentStep;
            return (
              <div 
                key={step.id} 
                className={`flex items-center gap-2 ${index < STEPS.length - 1 ? 'flex-1' : ''}`}
              >
                <div 
                  className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    isActive ? 'bg-blue-600 text-white' : 
                    isComplete ? 'bg-green-500 text-white' : 
                    'bg-muted text-muted-foreground'
                  }`}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                </div>
                <span className={`text-sm hidden sm:inline ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>
                  {step.label}
                </span>
                {index < STEPS.length - 1 && (
                  <div className="flex-1 h-0.5 bg-muted mx-2" />
                )}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 px-1">
          <div className="py-4">
            {renderStepContent()}
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t">
          <div className="flex items-center justify-between w-full">
            <Button
              type="button"
              variant="outline"
              onClick={currentStep === 0 ? onClose : handlePrev}
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              {currentStep === 0 ? 'Cancel' : (
                <>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </>
              )}
            </Button>
            
            {currentStep < STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={handleNext}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                {loading ? 'Creating...' : 'Create Campaign'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateCampaignModal;
