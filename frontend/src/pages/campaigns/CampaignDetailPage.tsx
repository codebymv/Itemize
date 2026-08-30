import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle,
  Copy,
  Eye,
  Link2,
  Mail,
  Megaphone,
  MoreHorizontal,
  MousePointerClick,
  Pause,
  Play,
  Save,
  Send,
  Settings2,
  Trash2,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/EmptyState';
import { PreviewPlaceholder } from '@/components/preview/PreviewPlaceholder';
import { Checkbox } from '@/components/ui/checkbox';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLoading } from '@/components/ui/page-loading';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { EmailPreviewPane } from '@/components/email/EmailPreviewPane';
import { EmailTemplateBrowserDialog } from '@/components/email/EmailTemplateBrowserDialog';
import { HeaderAction, HeaderActionLabel } from '@/components/layout/DesktopHeaderTools';
import { PageLayout } from '@/components/layout/PageLayout';
import { EntityDetailHeader } from '@/components/layout/EntityDetailHeader';
import { PageToolbar } from '@/components/layout/PageToolbar';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { SectionCardTitle } from '@/components/ui/section-card-title';
import { ShellBackButton } from '@/components/layout/ShellBackButton';
import { StatCard } from '@/components/StatCard';
import { useOrganization } from '@/hooks/useOrganization';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { defineStatus } from '@/lib/statusVisuals';
import {
  deleteCampaign,
  duplicateCampaign,
  createCampaign,
  getCampaign,
  getCampaignRecipients,
  pauseCampaign,
  previewCampaign,
  resumeCampaign,
  scheduleCampaign,
  sendCampaign,
  sendTestEmail,
  unscheduleCampaign,
  updateCampaign,
  type CampaignPreview,
  type CampaignRecipient,
  type EmailCampaign,
} from '@/services/campaignsApi';
import { getEmailTemplates, type EmailTemplate } from '@/services/emailApi';
import { getFilterOptions, getSegments, type FilterOptions, type Segment } from '@/services/segmentsApi';
import type { Campaign } from '@/types/campaigns';
import { getCampaignStatusVisual } from './constants/campaignVisuals';
import { campaignScheduleToIso } from './utils/campaignSchedule';
import {
  getCampaignPreviewHtml,
  isCampaignEditable,
  percentOf,
  recipientDisplayName,
  scheduleFieldsFor,
} from './campaignDetailModel';

type CampaignForm = {
  name: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  contentSource: 'template' | 'custom';
  templateId: number | null;
  contentHtml: string;
  contentText: string;
  segmentType: 'all' | 'tag' | 'status' | 'segment';
  segmentId: number | null;
  contactStatus: string;
  tagIds: number[];
  excludedTagIds: number[];
};

const EMPTY_FORM: CampaignForm = {
  name: '', subject: '', fromName: '', fromEmail: '', replyTo: '',
  contentSource: 'template', templateId: null, contentHtml: '', contentText: '',
  segmentType: 'all', segmentId: null, contactStatus: 'active', tagIds: [], excludedTagIds: [],
};

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'UTC',
];

const RECIPIENT_STATUSES: Array<CampaignRecipient['status']> = [
  'pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed', 'complained',
];

const RECIPIENT_VISUALS = {
  pending: defineStatus('Pending', 'orange', CalendarClock),
  sent: defineStatus('Sent', 'orange', Send),
  delivered: defineStatus('Delivered', 'green', CheckCircle),
  opened: defineStatus('Opened', 'green', Eye),
  clicked: defineStatus('Clicked', 'green', MousePointerClick),
  bounced: defineStatus('Bounced', 'red', XCircle),
  failed: defineStatus('Failed', 'red', XCircle),
  unsubscribed: defineStatus('Unsubscribed', 'red', XCircle),
  complained: defineStatus('Complained', 'red', AlertTriangle),
} as const;

const toForm = (campaign: EmailCampaign): CampaignForm => ({
  name: campaign.name,
  subject: campaign.subject,
  fromName: campaign.from_name || '',
  fromEmail: campaign.from_email || '',
  replyTo: campaign.reply_to || '',
  contentSource: campaign.template_id ? 'template' : 'custom',
  templateId: campaign.template_id || null,
  contentHtml: campaign.content_html || '',
  contentText: campaign.content_text || '',
  segmentType: campaign.segment_type === 'custom' ? 'all' : campaign.segment_type,
  segmentId: campaign.segment_id || null,
  contactStatus: typeof campaign.segment_filter?.status === 'string'
    ? String(campaign.segment_filter.status)
    : 'active',
  tagIds: campaign.tag_ids || [],
  excludedTagIds: campaign.excluded_tag_ids || [],
});

const formKey = (form: CampaignForm): string => JSON.stringify(form);

const formatDateTime = (value?: string | null): string => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(date);
};

const formatInteger = (value: number): string => new Intl.NumberFormat().format(value || 0);

export function CampaignDetailPage() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const isNew = !params.id || params.id === 'new';
  const campaignId = Number(params.id);
  const { toast } = useToast();
  const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({
    onError: () => 'Failed to initialize.',
  });
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [campaign, setCampaign] = useState<EmailCampaign | null>(null);
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM);
  const [savedFormKey, setSavedFormKey] = useState(formKey(EMPTY_FORM));
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [audiencePreview, setAudiencePreview] = useState<CampaignPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [templateBrowserOpen, setTemplateBrowserOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduleTimezone, setScheduleTimezone] = useState('America/Phoenix');
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [recipientStatus, setRecipientStatus] = useState('all');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientPage, setRecipientPage] = useState(1);
  const [recipientPages, setRecipientPages] = useState(1);
  const [recipientTotal, setRecipientTotal] = useState(0);
  const [recipientsLoading, setRecipientsLoading] = useState(false);

  const resetForm = useCallback((next: EmailCampaign) => {
    const nextForm = toForm(next);
    setForm(nextForm);
    setSavedFormKey(formKey(nextForm));
    const timezone = next.timezone || 'America/Phoenix';
    const schedule = scheduleFieldsFor(next.scheduled_at, timezone);
    setScheduleTimezone(timezone);
    setScheduleDate(schedule.date);
    setScheduleTime(schedule.time);
  }, []);

  const loadCampaign = useCallback(async () => {
    if (orgLoading) return;
    if (!organizationId) {
      setLoading(false);
      return;
    }
    if (isNew) {
      setLoading(true);
      setLoadError(null);
      try {
        const [templateResponse, nextSegments, options] = await Promise.all([
          getEmailTemplates(organizationId),
          getSegments({}, organizationId),
          getFilterOptions(organizationId),
        ]);
        setCampaign(null);
        setForm(EMPTY_FORM);
        setSavedFormKey(formKey(EMPTY_FORM));
        setTemplates(templateResponse.templates || []);
        setSegments(nextSegments);
        setFilterOptions(options);
        setAudiencePreview(null);
      } catch (error) {
        console.error('Unable to initialize campaign editor:', error);
        setLoadError('We could not prepare a new campaign. No campaign was created.');
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!Number.isSafeInteger(campaignId) || campaignId < 1) {
      setLoadError('This campaign link is invalid.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [nextCampaign, templateResponse, nextSegments, options] = await Promise.all([
        getCampaign(campaignId, organizationId),
        getEmailTemplates(organizationId),
        getSegments({}, organizationId),
        getFilterOptions(organizationId),
      ]);
      setCampaign(nextCampaign);
      resetForm(nextCampaign);
      setTemplates(templateResponse.templates || []);
      setSegments(nextSegments);
      setFilterOptions(options);
      if (isCampaignEditable(nextCampaign.status)) {
        setAudiencePreview(await previewCampaign(campaignId, organizationId));
      } else {
        setAudiencePreview(null);
      }
    } catch (error) {
      console.error('Unable to load campaign detail:', error);
      setLoadError('We could not load this campaign. The campaign has not been changed.');
    } finally {
      setLoading(false);
    }
  }, [campaignId, isNew, orgLoading, organizationId, resetForm]);

  useEffect(() => { void loadCampaign(); }, [loadCampaign]);

  const editable = isNew || (campaign ? isCampaignEditable(campaign.status) : false);
  const dirty = editable && formKey(form) !== savedFormKey;

  const loadRecipients = useCallback(async () => {
    if (!organizationId || !campaign || editable) return;
    setRecipientsLoading(true);
    try {
      const response = await getCampaignRecipients(campaign.id, {
        status: recipientStatus as CampaignRecipient['status'] | 'all',
        page: recipientPage,
        limit: 20,
      }, organizationId);
      setRecipients(response.recipients);
      setRecipientTotal(response.pagination.total);
      setRecipientPages(response.pagination.totalPages || 1);
    } catch (error) {
      toast({
        title: 'Recipients unavailable',
        description: 'Campaign performance remains available, but recipient delivery records could not be loaded.',
        variant: 'destructive',
      });
    } finally {
      setRecipientsLoading(false);
    }
  }, [campaign, editable, organizationId, recipientPage, recipientStatus, toast]);

  useEffect(() => { void loadRecipients(); }, [loadRecipients]);

  const confirmLeave = (): boolean => !dirty || window.confirm('Discard unsaved campaign changes?');
  const goBack = () => { if (confirmLeave()) navigate('/campaigns'); };

  const selectedTemplate = templates.find(template => template.id === form.templateId);
  const previewHtml = editable
    ? form.contentSource === 'template'
      ? getCampaignPreviewHtml(campaign || { content_html: null, template_html: null }, selectedTemplate?.body_html)
      : form.contentHtml
    : campaign ? getCampaignPreviewHtml(campaign) : '';

  const updateForm = <K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const toggleTag = (field: 'tagIds' | 'excludedTagIds', id: number) => {
    setForm(current => ({
      ...current,
      [field]: current[field].includes(id)
        ? current[field].filter(item => item !== id)
        : [...current[field], id],
    }));
  };

  const handleSave = async () => {
    if (!organizationId || !editable) return;
    if (!form.name.trim() || !form.subject.trim()) {
      toast({ title: 'Campaign details required', description: 'Add a campaign name and email subject before saving.', variant: 'destructive' });
      return;
    }
    if (form.contentSource === 'template' && !form.templateId) {
      toast({ title: 'Template required', description: 'Select an email template or switch to custom content.', variant: 'destructive' });
      return;
    }
    if (form.contentSource === 'custom' && !form.contentHtml.trim()) {
      toast({ title: 'Email content required', description: 'Add HTML content or select an email template.', variant: 'destructive' });
      return;
    }
    if (form.segmentType === 'segment' && !form.segmentId) {
      toast({ title: 'Segment required', description: 'Select a saved segment for this audience.', variant: 'destructive' });
      return;
    }
    if (form.segmentType === 'tag' && form.tagIds.length === 0) {
      toast({ title: 'Tag required', description: 'Select at least one included tag.', variant: 'destructive' });
      return;
    }
    setWorking(true);
    try {
      const payload = {
        name: form.name.trim(),
        subject: form.subject.trim(),
        from_name: form.fromName.trim() || null,
        from_email: form.fromEmail.trim() || null,
        reply_to: form.replyTo.trim() || null,
        template_id: form.contentSource === 'template' ? form.templateId : null,
        content_html: form.contentSource === 'custom' ? form.contentHtml : null,
        content_text: form.contentSource === 'custom' ? form.contentText || null : null,
        segment_type: form.segmentType,
        segment_id: form.segmentType === 'segment' ? form.segmentId : null,
        segment_filter: form.segmentType === 'status' ? { status: form.contactStatus } : {},
        tag_ids: form.segmentType === 'tag' ? form.tagIds : [],
        excluded_tag_ids: form.excludedTagIds,
      };
      const updated = campaign
        ? await updateCampaign(campaign.id, payload, organizationId)
        : await createCampaign({ ...payload, status: 'draft', timezone: scheduleTimezone }, organizationId);
      setCampaign(updated);
      resetForm(updated);
      if (!campaign) navigate(`/campaigns/${updated.id}`, { replace: true });
      toast({ title: campaign ? 'Campaign saved' : 'Campaign created', description: 'The campaign setup is up to date.' });
      try {
        setAudiencePreview(await previewCampaign(updated.id, organizationId));
      } catch {
        setAudiencePreview(null);
        toast({ title: 'Audience preview unavailable', description: 'The campaign was saved, but its eligible recipient count could not be refreshed.', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Unable to save campaign', description: 'Your changes remain in the editor.', variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const requireSaved = (): boolean => {
    if (!dirty) return true;
    toast({ title: 'Save changes first', description: 'Save the current setup before changing delivery state.', variant: 'destructive' });
    return false;
  };

  const openSendConfirmation = async () => {
    if (!campaign || !organizationId || !requireSaved()) return;
    setWorking(true);
    try {
      const nextPreview = await previewCampaign(campaign.id, organizationId);
      setAudiencePreview(nextPreview);
      setSendOpen(true);
    } catch {
      toast({ title: 'Audience unavailable', description: 'Recipient eligibility could not be verified.', variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleSend = async () => {
    if (!campaign || !organizationId || !audiencePreview || audiencePreview.recipientCount < 1) return;
    setWorking(true);
    try {
      const result = await sendCampaign(campaign.id, organizationId);
      setCampaign(result.campaign);
      resetForm(result.campaign);
      setSendOpen(false);
      toast({ title: 'Campaign started', description: result.message });
    } catch {
      toast({ title: 'Unable to send campaign', description: 'The campaign remains unchanged.', variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleSchedule = async () => {
    if (!campaign || !organizationId || !requireSaved()) return;
    if (!scheduleDate || !scheduleTime) {
      toast({ title: 'Schedule required', description: 'Choose a send date and time.', variant: 'destructive' });
      return;
    }
    setWorking(true);
    try {
      const scheduledAt = campaignScheduleToIso(scheduleDate, scheduleTime, scheduleTimezone);
      const updated = await scheduleCampaign(campaign.id, scheduledAt, scheduleTimezone, organizationId);
      setCampaign(updated);
      resetForm(updated);
      toast({ title: 'Campaign scheduled', description: `Delivery is scheduled for ${formatDateTime(updated.scheduled_at)}.` });
    } catch (error) {
      toast({ title: 'Unable to schedule campaign', description: 'Choose a future date and try again.', variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleUnschedule = async () => {
    if (!campaign || !organizationId || !requireSaved()) return;
    setWorking(true);
    try {
      const updated = await unscheduleCampaign(campaign.id, organizationId);
      setCampaign(updated);
      resetForm(updated);
      toast({ title: 'Schedule removed', description: 'The campaign is a draft again.' });
    } catch {
      toast({ title: 'Unable to remove schedule', description: 'The campaign schedule is unchanged.', variant: 'destructive' });
    } finally { setWorking(false); }
  };

  const handlePause = async () => {
    if (!campaign || !organizationId) return;
    setWorking(true);
    try {
      const updated = await pauseCampaign(campaign.id, organizationId);
      setCampaign(updated);
      resetForm(updated);
      toast({ title: 'Campaign paused', description: 'Pending delivery has been parked.' });
    } catch {
      toast({ title: 'Unable to pause campaign', description: 'Campaign delivery is unchanged.', variant: 'destructive' });
    } finally { setWorking(false); }
  };

  const handleResume = async () => {
    if (!campaign || !organizationId) return;
    setWorking(true);
    try {
      const result = await resumeCampaign(campaign.id, organizationId);
      await loadCampaign();
      toast({ title: 'Campaign resumed', description: result.message });
    } catch {
      toast({ title: 'Unable to resume campaign', description: 'Campaign delivery remains paused.', variant: 'destructive' });
    } finally { setWorking(false); }
  };

  const handleDuplicate = async () => {
    if (!campaign || !organizationId) return;
    setWorking(true);
    try {
      const copy = await duplicateCampaign(campaign.id, organizationId);
      toast({ title: 'Campaign duplicated', description: 'A new draft is ready to edit.' });
      navigate(`/campaigns/${copy.id}`);
    } catch {
      toast({ title: 'Unable to duplicate campaign', description: 'No copy was created.', variant: 'destructive' });
    } finally { setWorking(false); }
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!campaign || !organizationId) return false;
    try {
      await deleteCampaign(campaign.id, organizationId);
      navigate('/campaigns');
      return true;
    } catch {
      return false;
    }
  };

  const handleSendTest = async () => {
    if (!campaign || !organizationId || !testEmail.trim()) return;
    setWorking(true);
    try {
      const result = await sendTestEmail(campaign.id, testEmail.trim(), organizationId);
      setTestOpen(false);
      toast({ title: 'Test email queued', description: result.message });
    } catch {
      toast({ title: 'Unable to send test email', description: 'Check the destination and campaign content.', variant: 'destructive' });
    } finally { setWorking(false); }
  };

  const scrollToPreview = () => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (initError) {
    return <PageLayout title="CAMPAIGN" icon={<Megaphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />} leading={<ShellBackButton label="Back to campaigns" onClick={() => navigate('/campaigns')} />}><OrganizationErrorState title="Unable to load campaign" icon={Megaphone} /></PageLayout>;
  }

  if (loading) {
    return <PageLayout title="CAMPAIGN" icon={<Megaphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />} leading={<ShellBackButton label="Back to campaigns" onClick={() => navigate('/campaigns')} />}><PageLoading message="Loading campaign..." /></PageLayout>;
  }

  if (loadError || (!isNew && !campaign)) {
    return <PageLayout title="CAMPAIGN" icon={<Megaphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />} leading={<ShellBackButton label="Back to campaigns" onClick={() => navigate('/campaigns')} />}><ErrorState title="Campaign unavailable" description={loadError || 'This campaign could not be found.'} icon={Megaphone} onAction={() => void loadCampaign()} /></PageLayout>;
  }

  const statusVisual = getCampaignStatusVisual((campaign?.status || 'draft') as Campaign['status']);
  const StatusIcon = statusVisual.icon;

  const campaignActions = (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-11 min-w-11 gap-2 px-3 font-light" aria-label="Campaign actions" disabled={working}>
              <MoreHorizontal className="h-4 w-4" />
              <HeaderActionLabel>More</HeaderActionLabel>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Campaign actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={scrollToPreview} className="group/menu">
          <Eye className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Preview email
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTestOpen(true)} disabled={!campaign || dirty} className="group/menu">
          <Mail className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Send test
        </DropdownMenuItem>
        {campaign && editable && <DropdownMenuItem onClick={() => void openSendConfirmation()} disabled={dirty} className="group/menu"><Send className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Send now</DropdownMenuItem>}
        {campaign?.status === 'scheduled' && <DropdownMenuItem onClick={() => void handleUnschedule()} disabled={dirty}><CalendarClock className="mr-2 h-4 w-4" />Remove schedule</DropdownMenuItem>}
        {campaign?.status === 'sending' && <DropdownMenuItem onClick={() => void handlePause()}><Pause className="mr-2 h-4 w-4" />Pause delivery</DropdownMenuItem>}
        {campaign && <DropdownMenuItem onClick={() => void handleDuplicate()} className="group/menu"><Copy className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />Duplicate</DropdownMenuItem>}
        {campaign && campaign.status !== 'sending' && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete campaign</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const primaryAction = editable ? (
    <HeaderAction label={working ? 'Saving...' : isNew ? 'Create campaign' : 'Save changes'} icon={<Save className="h-4 w-4" />} onClick={() => void handleSave()} disabled={!dirty || working} />
  ) : campaign?.status === 'paused' ? (
    <HeaderAction label={working ? 'Resuming...' : 'Resume'} icon={<Play className="h-4 w-4" />} onClick={() => void handleResume()} disabled={working} />
  ) : undefined;

  const audienceLabel = campaign?.segment_type === 'segment'
    ? segments.find(segment => segment.id === campaign.segment_id)?.name || 'Saved segment'
    : campaign?.segment_type === 'tag'
      ? `${campaign.tag_ids.length} included tag${campaign.tag_ids.length === 1 ? '' : 's'}`
      : campaign?.segment_type === 'status'
        ? `${String(campaign.segment_filter.status || 'active')} contacts`
        : 'All eligible contacts';

  const filteredRecipients = recipients.filter(recipient => {
    const query = recipientSearch.trim().toLowerCase();
    return !query || recipient.email.toLowerCase().includes(query) || recipientDisplayName(recipient).toLowerCase().includes(query);
  });

  return (
    <PageLayout
      title={isNew ? 'NEW CAMPAIGN' : 'CAMPAIGN'}
      icon={<Megaphone className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
      leading={<ShellBackButton label="Back to campaigns" onClick={goBack} />}
      headerTools={{
        status: <Badge className={cn('pointer-events-none whitespace-nowrap', statusVisual.badgeClass)}>{statusVisual.label}</Badge>,
        secondaryAction: campaignActions,
        primaryAction,
      }}
    >
      <EntityDetailHeader
        icon={<StatusIcon className={cn('h-6 w-6', statusVisual.iconClass)} />}
        iconClassName={statusVisual.iconBackgroundClass}
        title={campaign?.name || form.name || 'New campaign'}
        mobileStatus={<Badge className={statusVisual.badgeClass}>{statusVisual.label}</Badge>}
        descriptor={campaign?.subject || form.subject || 'Build the message, audience, and delivery setup'}
        metadata={(
          <>
            {campaign ? <span>Created {formatDateTime(campaign.created_at)}</span> : <span>Not saved yet</span>}
            {campaign?.created_by_name && <span>by {campaign.created_by_name}</span>}
            {campaign?.scheduled_at && <span>Scheduled {formatDateTime(campaign.scheduled_at)}</span>}
            {campaign?.completed_at && campaign.status === 'sent' && <span>Delivered {formatDateTime(campaign.completed_at)}</span>}
          </>
        )}
      />

      {editable ? (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader><SectionCardTitle icon={Settings2}>Campaign setup</SectionCardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2"><Label htmlFor="campaign-name">Campaign name</Label><Input id="campaign-name" value={form.name} onChange={event => updateForm('name', event.target.value)} /></div>
                    <div className="space-y-2 sm:col-span-2"><Label htmlFor="campaign-subject">Email subject</Label><Input id="campaign-subject" value={form.subject} onChange={event => updateForm('subject', event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="campaign-from-name">From name</Label><Input id="campaign-from-name" value={form.fromName} onChange={event => updateForm('fromName', event.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="campaign-from-email">From email</Label><Input id="campaign-from-email" type="email" value={form.fromEmail} onChange={event => updateForm('fromEmail', event.target.value)} /></div>
                    <div className="space-y-2 sm:col-span-2"><Label htmlFor="campaign-reply-to">Reply-to email</Label><Input id="campaign-reply-to" type="email" value={form.replyTo} onChange={event => updateForm('replyTo', event.target.value)} /></div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><SectionCardTitle icon={Mail}>Email content</SectionCardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><Label>Content source</Label><Select value={form.contentSource} onValueChange={value => updateForm('contentSource', value as CampaignForm['contentSource'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="template">Email template</SelectItem><SelectItem value="custom">Custom HTML</SelectItem></SelectContent></Select></div>
                  {form.contentSource === 'template' ? (
                    <div className="space-y-2">
                      <Label>Email template</Label>
                      <div className="flex min-w-0 items-center gap-3 rounded-lg border p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{selectedTemplate?.name || 'No template selected'}</p>
                          <p className="truncate text-xs text-muted-foreground">{selectedTemplate?.subject || 'Choose from your reusable email templates.'}</p>
                        </div>
                        <Button type="button" variant="outline" className="shrink-0" onClick={() => setTemplateBrowserOpen(true)}>{selectedTemplate ? 'Change' : 'Browse templates'}</Button>
                      </div>
                    </div>
                  ) : (
                    <><div className="space-y-2"><Label htmlFor="campaign-html">HTML content</Label><Textarea id="campaign-html" value={form.contentHtml} onChange={event => updateForm('contentHtml', event.target.value)} className="min-h-44 font-mono text-sm" /></div><div className="space-y-2"><Label htmlFor="campaign-text">Plain-text fallback</Label><Textarea id="campaign-text" value={form.contentText} onChange={event => updateForm('contentText', event.target.value)} className="min-h-24" /></div></>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader><SectionCardTitle icon={Users}>Audience</SectionCardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><Label>Audience type</Label><Select value={form.segmentType} onValueChange={value => updateForm('segmentType', value as CampaignForm['segmentType'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All eligible contacts</SelectItem><SelectItem value="segment">Saved segment</SelectItem><SelectItem value="status">Contact status</SelectItem><SelectItem value="tag">Contact tags</SelectItem></SelectContent></Select></div>
                  {form.segmentType === 'segment' && <div className="space-y-2"><Label>Saved segment</Label><Select value={form.segmentId?.toString() || ''} onValueChange={value => updateForm('segmentId', Number(value))}><SelectTrigger><SelectValue placeholder="Select a segment" /></SelectTrigger><SelectContent>{segments.filter(segment => segment.is_active || segment.id === form.segmentId).map(segment => <SelectItem key={segment.id} value={segment.id.toString()}>{segment.name} · {segment.contact_count}</SelectItem>)}</SelectContent></Select></div>}
                  {form.segmentType === 'status' && <div className="space-y-2"><Label>Contact status</Label><Select value={form.contactStatus} onValueChange={value => updateForm('contactStatus', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent></Select></div>}
                  {form.segmentType === 'tag' && <div className="space-y-2"><Label>Included tags</Label><div className="space-y-2 rounded-md border p-3">{filterOptions?.tags.length ? filterOptions.tags.map(tag => <label key={tag.id} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={form.tagIds.includes(tag.id)} onCheckedChange={() => toggleTag('tagIds', tag.id)} /><span>{tag.name}</span></label>) : <p className="text-sm text-muted-foreground">No contact tags available.</p>}</div></div>}
                  {filterOptions?.tags.length ? <div className="space-y-2"><Label>Excluded tags</Label><div className="space-y-2 rounded-md border p-3">{filterOptions.tags.map(tag => <label key={tag.id} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={form.excludedTagIds.includes(tag.id)} onCheckedChange={() => toggleTag('excludedTagIds', tag.id)} /><span>{tag.name}</span></label>)}</div></div> : null}
                  <Separator />
                  <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Eligible audience</p><p className="text-xs text-muted-foreground">Based on the saved setup</p></div><span className="text-2xl font-semibold text-blue-600 dark:text-blue-400">{audiencePreview?.recipientCount ?? '—'}</span></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><SectionCardTitle icon={CalendarClock}>Delivery</SectionCardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {campaign ? <>
                    <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="campaign-date">Date</Label><Input id="campaign-date" type="date" value={scheduleDate} onChange={event => setScheduleDate(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="campaign-time">Time</Label><Input id="campaign-time" type="time" value={scheduleTime} onChange={event => setScheduleTime(event.target.value)} /></div></div>
                    <div className="space-y-2"><Label>Timezone</Label><Select value={scheduleTimezone} onValueChange={setScheduleTimezone}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIMEZONES.map(timezone => <SelectItem key={timezone} value={timezone}>{timezone.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
                    <Button variant="outline" className="w-full" onClick={() => void handleSchedule()} disabled={working || dirty}>{campaign.status === 'scheduled' ? 'Update schedule' : 'Schedule campaign'}</Button>
                    <Button className="w-full bg-blue-600 text-white hover:bg-blue-700" onClick={() => void openSendConfirmation()} disabled={working || dirty}><Send className="mr-2 h-4 w-4" />Send now</Button>
                    {dirty && <p className="text-xs text-muted-foreground">Save campaign changes before scheduling or sending.</p>}
                  </> : <div className="rounded-lg border border-dashed p-4"><p className="text-sm font-medium">Create the draft first</p><p className="mt-1 text-xs text-muted-foreground">Scheduling and sending become available after this campaign has a saved audience and message.</p></div>}
                </CardContent>
              </Card>
            </div>
          </div>

          <Card ref={previewRef}>
            <CardHeader><SectionCardTitle icon={Eye}>Email preview</SectionCardTitle></CardHeader>
            <CardContent>
              {previewHtml ? <div className="overflow-hidden rounded-lg border bg-white"><iframe srcDoc={previewHtml} sandbox="allow-same-origin" title="Campaign email preview" className="h-[32rem] w-full border-0" /></div> : <div className="flex h-64 items-center justify-center rounded-lg border text-sm text-muted-foreground">Add campaign content to see its preview.</div>}
            </CardContent>
          </Card>
        </div>
      ) : campaign ? (
        <div className="space-y-6">
          <ResponsiveCardRail label="Campaign performance summary" desktopColumns="md:grid-cols-2 lg:grid-cols-5" className="responsive-stat-summary">
            <StatCard title="Bounced campaign messages" badgeText="Bounced" value={formatInteger(campaign.total_bounced)} icon={XCircle} description={`${campaign.bounce_rate}% of sent`} colorTheme="red" />
            <StatCard title="Campaign recipients" badgeText="Recipients" value={formatInteger(campaign.total_recipients)} icon={Users} description={`${formatInteger(campaign.total_sent)} sent`} colorTheme="blue" />
            <StatCard title="Delivered campaign messages" badgeText="Delivered" value={formatInteger(campaign.total_delivered)} icon={CheckCircle} description={`${percentOf(campaign.total_delivered, campaign.total_recipients).toFixed(1)}% of recipients`} colorTheme="green" />
            <StatCard title="Opened campaign messages" badgeText="Opened" value={formatInteger(campaign.total_opened)} icon={Eye} description={`${campaign.open_rate}% opened`} colorTheme="green" />
            <StatCard title="Clicked campaign messages" badgeText="Clicked" value={formatInteger(campaign.total_clicked)} icon={MousePointerClick} description={`${campaign.click_rate}% clicked`} colorTheme="green" />
          </ResponsiveCardRail>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="flex min-h-0 flex-col lg:col-span-2">
              <CardHeader><SectionCardTitle icon={BarChart3}>Delivery and engagement</SectionCardTitle></CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-5">
                {[
                  { label: 'Sent', value: campaign.total_sent, color: 'bg-blue-600' },
                  { label: 'Delivered', value: campaign.total_delivered, color: 'bg-green-600' },
                  { label: 'Opened', value: campaign.total_opened, color: 'bg-green-500' },
                  { label: 'Clicked', value: campaign.total_clicked, color: 'bg-green-400' },
                  { label: 'Bounced', value: campaign.total_bounced, color: 'bg-red-600' },
                ].map(item => <div key={item.label} className="space-y-2"><div className="flex items-center justify-between gap-3 text-sm"><span>{item.label}</span><span className="font-medium">{formatInteger(item.value)} · {percentOf(item.value, campaign.total_recipients).toFixed(1)}%</span></div><Progress value={percentOf(item.value, campaign.total_recipients)} className="h-2.5" indicatorClassName={item.color} /></div>)}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><SectionCardTitle icon={Settings2}>Campaign details</SectionCardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div><p className="text-xs text-muted-foreground">Audience</p><p className="mt-1 font-medium capitalize">{audienceLabel}</p></div>
                <div><p className="text-xs text-muted-foreground">Email template</p><p className="mt-1 font-medium">{campaign.template_name || 'Custom content'}</p></div>
                <div><p className="text-xs text-muted-foreground">From</p><p className="mt-1 font-medium">{campaign.from_name || 'Not set'}{campaign.from_email ? ` · ${campaign.from_email}` : ''}</p></div>
                <div><p className="text-xs text-muted-foreground">Reply to</p><p className="mt-1 font-medium">{campaign.reply_to || campaign.from_email || 'Not set'}</p></div>
                <div><p className="text-xs text-muted-foreground">Started</p><p className="mt-1 font-medium">{formatDateTime(campaign.started_at)}</p></div>
                {campaign.status === 'sent' && <div><p className="text-xs text-muted-foreground">Completed</p><p className="mt-1 font-medium text-green-600 dark:text-green-400">{formatDateTime(campaign.completed_at)}</p></div>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
              <SectionCardTitle icon={Users}>Recipient delivery</SectionCardTitle>
              <PageToolbar
                label="Recipient delivery controls"
                singleLine
                className="ml-auto w-[34rem] max-w-full shrink-0 border-0 bg-transparent p-0"
                search={(
                  <Input
                    aria-label="Search campaign recipients"
                    placeholder="Search recipients..."
                    value={recipientSearch}
                    onChange={event => setRecipientSearch(event.target.value)}
                    className="h-11 w-full"
                  />
                )}
                filters={(
                  <Select value={recipientStatus} onValueChange={value => { setRecipientStatus(value); setRecipientPage(1); }}>
                    <SelectTrigger className="h-11 w-[8.5rem]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {RECIPIENT_STATUSES.map(status => <SelectItem key={status} value={status}>{RECIPIENT_VISUALS[status].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                meta={<span className="whitespace-nowrap text-sm text-muted-foreground">{recipientTotal} recipient{recipientTotal === 1 ? '' : 's'}</span>}
              />
            </CardHeader>
            <CardContent className="p-0">
              {recipientsLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading recipients...</div> : filteredRecipients.length === 0 ? <EmptyState icon={UserRound} kind="inline" title="No recipient records" description="Delivery records will appear as the campaign processes recipients." className="py-10" /> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Recipient</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Opens</TableHead><TableHead className="text-right">Clicks</TableHead><TableHead>Latest activity</TableHead></TableRow></TableHeader><TableBody>{filteredRecipients.map(recipient => { const visual = RECIPIENT_VISUALS[recipient.status]; return <TableRow key={recipient.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/contacts/${recipient.contact_id}`)}><TableCell><p className="font-medium">{recipientDisplayName(recipient)}</p><p className="text-xs text-muted-foreground">{recipient.email}</p></TableCell><TableCell><Badge className={visual.badgeClass}>{visual.label}</Badge>{recipient.error_message && <p className="mt-1 max-w-xs text-xs text-red-600 dark:text-red-400">{recipient.error_message}</p>}</TableCell><TableCell className="text-right">{recipient.open_count}</TableCell><TableCell className="text-right">{recipient.click_count}</TableCell><TableCell className="text-sm text-muted-foreground">{formatDateTime(recipient.clicked_at || recipient.opened_at || recipient.delivered_at || recipient.sent_at || recipient.created_at)}</TableCell></TableRow>; })}</TableBody></Table></div>}
              {recipientPages > 1 && <div className="flex items-center justify-between border-t p-4"><Button variant="outline" size="sm" onClick={() => setRecipientPage(page => Math.max(1, page - 1))} disabled={recipientPage <= 1 || recipientsLoading}>Previous</Button><span className="text-sm text-muted-foreground">Page {recipientPage} of {recipientPages}</span><Button variant="outline" size="sm" onClick={() => setRecipientPage(page => Math.min(recipientPages, page + 1))} disabled={recipientPage >= recipientPages || recipientsLoading}>Next</Button></div>}
            </CardContent>
          </Card>

          {campaign.links?.length ? <Card><CardHeader><SectionCardTitle icon={Link2}>Link performance</SectionCardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Link</TableHead><TableHead className="text-right">Unique clicks</TableHead><TableHead className="text-right">Total clicks</TableHead></TableRow></TableHeader><TableBody>{campaign.links.map(link => <TableRow key={link.id}><TableCell><p className="font-medium">{link.link_text || link.original_url}</p><p className="max-w-xl truncate text-xs text-muted-foreground">{link.original_url}</p></TableCell><TableCell className="text-right">{link.unique_clicks}</TableCell><TableCell className="text-right">{link.total_clicks}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card> : null}

          <Card ref={previewRef}>
            <CardHeader><SectionCardTitle icon={Eye}>Email snapshot</SectionCardTitle></CardHeader>
            <CardContent>{previewHtml ? <div className="overflow-hidden rounded-lg border bg-white"><iframe srcDoc={previewHtml} sandbox="allow-same-origin" title="Campaign email snapshot" className="h-[32rem] w-full border-0" /></div> : <PreviewPlaceholder icon={Mail} title="No email content yet" description="Add email content to generate this snapshot." className="h-64" />}</CardContent>
          </Card>
        </div>
      ) : null}

      {campaign && <AlertDialog open={sendOpen} onOpenChange={setSendOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Send {campaign.name} now?</AlertDialogTitle><AlertDialogDescription>{audiencePreview ? `This will start delivery to ${audiencePreview.recipientCount} eligible recipient${audiencePreview.recipientCount === 1 ? '' : 's'}. Delivery cannot be undone after it begins.` : 'Recipient eligibility must be verified before sending.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={working}>Keep campaign</AlertDialogCancel><AlertDialogAction disabled={working || !audiencePreview || audiencePreview.recipientCount < 1} onClick={event => { event.preventDefault(); void handleSend(); }} className="bg-blue-600 text-white hover:bg-blue-700">Send campaign</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>}

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent><DialogHeader><DialogTitle>Send a test email</DialogTitle><DialogDescription>Send the current saved campaign content to one address. This does not enroll a recipient or change campaign statistics.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="campaign-test-email">Destination email</Label><Input id="campaign-test-email" type="email" value={testEmail} onChange={event => setTestEmail(event.target.value)} placeholder="you@example.com" /></div><DialogFooter><Button variant="outline" onClick={() => setTestOpen(false)} disabled={working}>Cancel</Button><Button onClick={() => void handleSendTest()} disabled={working || !testEmail.trim()} className="bg-blue-600 text-white hover:bg-blue-700"><Send className="mr-2 h-4 w-4" />Send test</Button></DialogFooter></DialogContent>
      </Dialog>

      {organizationId && <EmailTemplateBrowserDialog
        open={templateBrowserOpen}
        onOpenChange={setTemplateBrowserOpen}
        title="Choose a campaign template"
        description="Active templates available to this organization."
        items={templates.filter(template => template.is_active || template.id === form.templateId).map(template => ({
          ...template,
          meta: `${template.variables.length} variable${template.variables.length === 1 ? '' : 's'}`,
        }))}
        selectedId={form.templateId}
        onSelect={template => updateForm('templateId', template.id)}
        renderPreview={template => <EmailPreviewPane organizationId={organizationId} content={{ subject: template.subject, preheader: template.preheader || '', bodyHtml: template.body_html, bodyText: template.body_text || '' }} className="h-full" />}
        emptyTitle="No active campaign templates"
        emptyDescription="Create and publish an email template before selecting it here."
      />}

      {campaign && <DeleteDialog open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={handleDelete} itemType="campaign" itemTitle={campaign.name} />}
    </PageLayout>
  );
}

export default CampaignDetailPage;
