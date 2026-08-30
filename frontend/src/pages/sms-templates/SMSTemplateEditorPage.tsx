import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { Braces, Loader2, MessageSquare, Save, Settings2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { EntityDetailHeader } from '@/components/layout/EntityDetailHeader';
import { HeaderAction } from '@/components/layout/DesktopHeaderTools';
import { PageLayout } from '@/components/layout/PageLayout';
import { ShellBackButton } from '@/components/layout/ShellBackButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLoading } from '@/components/ui/page-loading';
import { SectionCardTitle } from '@/components/ui/section-card-title';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AvailabilitySettingRow } from '@/components/settings/SettingsPrimitives';
import { useDirtyState } from '@/hooks/useDirtyState';
import { useOrganization } from '@/hooks/useOrganization';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getCatalogStatusVisual } from '@/pages/campaigns/constants/campaignVisuals';
import {
  createSmsTemplate,
  getMessageInfo,
  getSmsTemplate,
  updateSmsTemplate,
  type MessageInfo,
  type SmsTemplate,
} from '@/services/smsApi';

interface EditorState {
  name: string;
  message: string;
  category: string;
  isActive: boolean;
}

const EMPTY_STATE: EditorState = { name: '', message: '', category: '', isActive: true };
const TEMPLATE_CATEGORIES = ['marketing', 'transactional', 'notification', 'reminder', 'confirmation', 'other'] as const;
const TEMPLATE_VARIABLES = ['first_name', 'last_name', 'company', 'phone'] as const;
const EMPTY_INFO: MessageInfo = { length: 0, segments: 0, encoding: 'GSM', charsRemaining: 160 };

const stateFromTemplate = (template: SmsTemplate): EditorState => ({
  name: template.name,
  message: template.message,
  category: template.category || '',
  isActive: template.is_active,
});

function localMessageInfo(message: string): MessageInfo {
  if (!message) return EMPTY_INFO;
  const length = message.length;
  const unicode = Array.from(message).some(character => character.charCodeAt(0) > 127);
  const singleLimit = unicode ? 70 : 160;
  const multiLimit = unicode ? 67 : 153;
  const segments = length <= singleLimit ? 1 : Math.ceil(length / multiLimit);
  const limit = segments === 1 ? singleLimit : segments * multiLimit;
  return { length, segments, encoding: unicode ? 'Unicode' : 'GSM', charsRemaining: limit - length };
}

const categoryLabel = (category: string) => category.charAt(0).toUpperCase() + category.slice(1);

export function SMSTemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { toast } = useToast();
  const { organizationId, isLoading: orgLoading, error: orgError } = useOrganization();
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  const [template, setTemplate] = useState<SmsTemplate | null>(null);
  const [state, setState] = useState<EditorState>(EMPTY_STATE);
  const [messageInfo, setMessageInfo] = useState<MessageInfo>(EMPTY_INFO);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadTemplate = useCallback(async () => {
    if (isNew || !organizationId || !id) {
      if (isNew && !orgLoading) setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const loaded = await getSmsTemplate(Number(id), organizationId);
      setTemplate(loaded);
      setState(stateFromTemplate(loaded));
    } catch {
      setLoadError('We could not load this SMS template. No changes were made.');
    } finally {
      setLoading(false);
    }
  }, [id, isNew, orgLoading, organizationId]);

  useEffect(() => { void loadTemplate(); }, [loadTemplate]);

  const updateMessageInfo = useMemo(() => debounce(async (message: string) => {
    if (!message) return setMessageInfo(EMPTY_INFO);
    try { setMessageInfo(await getMessageInfo(message)); }
    catch { setMessageInfo(localMessageInfo(message)); }
  }, 300), []);

  useEffect(() => {
    void updateMessageInfo(state.message);
    return () => updateMessageInfo.cancel();
  }, [state.message, updateMessageInfo]);

  const { isDirty, markClean } = useDirtyState({
    value: state,
    ready: !loading && !orgLoading,
    resetKey: id || 'new',
  });
  const { confirmLeave } = useUnsavedChangesGuard({
    when: isDirty || saving,
    message: 'This SMS template has unsaved changes. Leave this page anyway?',
  });

  const visual = getCatalogStatusVisual(template?.is_active ?? true);
  const VisualIcon = visual.icon;
  const validationError = !state.name.trim()
    ? 'Add a template name.'
    : !state.message.trim()
      ? 'Write an SMS message.'
      : null;

  const handleSave = async () => {
    if (!organizationId || validationError) {
      if (validationError) toast({ title: 'Template needs attention', description: validationError, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const input = {
        organization_id: organizationId,
        name: state.name.trim(),
        message: state.message,
        category: state.category || undefined,
        is_active: state.isActive,
      };
      const saved = template
        ? await updateSmsTemplate(template.id, input)
        : await createSmsTemplate(input);
      const cleanState = stateFromTemplate(saved);
      setTemplate(saved);
      setState(cleanState);
      markClean(cleanState);
      if (!template) navigate(`/sms-templates/${saved.id}`, { replace: true });
      toast({ title: template ? 'Template updated' : 'Template created' });
    } catch {
      toast({ title: 'Unable to save template', description: 'Your changes were not saved. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const insertVariable = (variable: string) => {
    const token = `{{${variable}}}`;
    const textarea = messageRef.current;
    const start = textarea?.selectionStart ?? state.message.length;
    const end = textarea?.selectionEnd ?? start;
    const message = `${state.message.slice(0, start)}${token}${state.message.slice(end)}`;
    setState(current => ({ ...current, message }));
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const leading = <ShellBackButton label="Back to SMS templates" onClick={() => {
    if (confirmLeave()) navigate('/sms-templates');
  }} />;

  if (orgError || loadError) return (
    <PageLayout title="SMS TEMPLATE" icon={<MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />} leading={leading}>
      {orgError ? (
        <OrganizationErrorState title="Unable to load SMS template" icon={MessageSquare} />
      ) : (
        <ErrorState kind="page" title="SMS template unavailable" description={loadError || undefined} icon={MessageSquare} onAction={() => void loadTemplate()} />
      )}
    </PageLayout>
  );

  if (loading || orgLoading || !organizationId) return (
    <PageLayout title="SMS TEMPLATE" icon={<MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />} leading={leading}>
      <PageLoading message="Loading SMS template..." />
    </PageLayout>
  );

  return (
    <PageLayout
      title={isNew ? 'NEW SMS TEMPLATE' : 'SMS TEMPLATE'}
      icon={<MessageSquare className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
      leading={leading}
      headerTools={{
        status: template ? <Badge className={cn('pointer-events-none whitespace-nowrap', visual.badgeClass)}>{visual.label}</Badge> : undefined,
        primaryAction: <HeaderAction label={saving ? 'Saving...' : isNew ? 'Create template' : 'Save changes'} icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} disabled={saving || !isDirty || Boolean(validationError)} onClick={() => void handleSave()} />,
      }}
    >
      <EntityDetailHeader
        icon={<VisualIcon className={cn('h-6 w-6', visual.iconClass)} />}
        iconClassName={visual.iconBackgroundClass}
        title={state.name || 'New SMS template'}
        mobileStatus={template ? <Badge className={visual.badgeClass}>{visual.label}</Badge> : undefined}
        descriptor={state.message ? <p className="max-w-xl truncate">{state.message}</p> : undefined}
        metadata={<><span>{state.category ? categoryLabel(state.category) : 'Uncategorized'}</span><span>{messageInfo.length} characters</span><span>{messageInfo.segments} segment{messageInfo.segments === 1 ? '' : 's'}</span></>}
      />

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader><SectionCardTitle icon={Settings2}>Template settings</SectionCardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="sms-template-name">Name</Label><Input id="sms-template-name" value={state.name} placeholder="Appointment reminder" disabled={saving} onChange={event => setState(current => ({ ...current, name: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="sms-template-category">Category</Label><Select value={state.category || undefined} disabled={saving} onValueChange={category => setState(current => ({ ...current, category }))}><SelectTrigger id="sms-template-category"><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{state.category && !TEMPLATE_CATEGORIES.includes(state.category as typeof TEMPLATE_CATEGORIES[number]) && <SelectItem value={state.category}>{categoryLabel(state.category)}</SelectItem>}{TEMPLATE_CATEGORIES.map(category => <SelectItem key={category} value={category}>{categoryLabel(category)}</SelectItem>)}</SelectContent></Select></div>
              <AvailabilitySettingRow id="sms-template-active" label="Available for campaigns and automations" checked={state.isActive} disabled={saving} onCheckedChange={isActive => setState(current => ({ ...current, isActive }))} help="Unavailable templates remain editable but cannot be selected for new sends." helpLabel="About template availability" className="sm:col-span-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3"><SectionCardTitle icon={MessageSquare}>Message content</SectionCardTitle><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm"><Braces className="mr-2 h-4 w-4" />Variables</Button></DropdownMenuTrigger><DropdownMenuContent align="end">{TEMPLATE_VARIABLES.map(variable => <DropdownMenuItem key={variable} onClick={() => insertVariable(variable)}>{`{{${variable}}}`}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></CardHeader>
            <CardContent className="space-y-3"><Label htmlFor="sms-template-message" className="sr-only">Message</Label><Textarea ref={messageRef} id="sms-template-message" value={state.message} placeholder="Write your message" className="min-h-40" disabled={saving} onChange={event => setState(current => ({ ...current, message: event.target.value }))} /><div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs"><span>{messageInfo.length} characters</span><span className={cn(messageInfo.segments <= 1 ? 'text-green-600 dark:text-green-400' : messageInfo.segments <= 3 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400')}>{messageInfo.segments} segment{messageInfo.segments === 1 ? '' : 's'}</span><span className="text-muted-foreground">{messageInfo.encoding}</span></div></CardContent>
          </Card>
        </div>

        <Card className="xl:sticky xl:top-6">
          <CardHeader><SectionCardTitle icon={MessageSquare}>Recipient preview</SectionCardTitle></CardHeader>
          <CardContent><div className="rounded-[2rem] border bg-muted/20 p-4"><div className="mb-6 text-center text-xs text-muted-foreground">Itemize message</div><div className="ml-auto max-w-[90%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-3 text-sm text-white">{state.message || 'Your message preview will appear here.'}</div></div></CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

export default SMSTemplateEditorPage;
