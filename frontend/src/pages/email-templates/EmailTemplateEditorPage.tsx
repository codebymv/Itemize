import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Mail, Save, Send } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { EmailContentEditor, type EmailContentValue } from '@/components/email/EmailContentEditor';
import { EmailPreviewPane } from '@/components/email/EmailPreviewPane';
import { ErrorState } from '@/components/ErrorState';
import { HeaderAction } from '@/components/layout/DesktopHeaderTools';
import { PageLayout } from '@/components/layout/PageLayout';
import { ShellBackButton } from '@/components/layout/ShellBackButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useDirtyState } from '@/hooks/useDirtyState';
import { useOrganization } from '@/hooks/useOrganization';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useToast } from '@/hooks/use-toast';
import {
  createEmailTemplateDraft,
  getEmailTemplate,
  publishEmailTemplate,
  saveEmailTemplateDraft,
  type EmailTemplate,
  type EmailTemplateDraftInput,
} from '@/services/emailApi';

interface EditorState extends EmailContentValue {
  name: string;
  category: string;
  isActive: boolean;
}

const EMPTY_STATE: EditorState = {
  name: '',
  category: 'general',
  isActive: true,
  subject: '',
  preheader: '',
  bodyHtml: '<p></p>',
  bodyText: '',
};

const stateFromTemplate = (template: EmailTemplate): EditorState => ({
  name: template.name,
  category: template.category || 'general',
  isActive: template.draft_is_active ?? (template.published_version ? template.is_active : true),
  subject: template.draft_subject ?? template.subject,
  preheader: template.draft_preheader ?? template.preheader ?? '',
  bodyHtml: template.draft_body_html ?? template.body_html,
  bodyText: template.draft_body_text ?? template.body_text ?? '',
});

const hasMessage = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;

export function EmailTemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { toast } = useToast();
  const { organizationId, isLoading: orgLoading, error: orgError } = useOrganization();
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [state, setState] = useState<EditorState>(EMPTY_STATE);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadTemplate = useCallback(async () => {
    if (isNew || !organizationId || !id) {
      if (isNew && !orgLoading) setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const loaded = await getEmailTemplate(Number(id), organizationId);
      setTemplate(loaded);
      setState(stateFromTemplate(loaded));
    } catch {
      setLoadError('We could not load this email template. No changes were made.');
    } finally {
      setLoading(false);
    }
  }, [id, isNew, orgLoading, organizationId]);

  useEffect(() => { void loadTemplate(); }, [loadTemplate]);

  const { isDirty, markClean } = useDirtyState({
    value: state,
    ready: !loading && !orgLoading,
    resetKey: id || 'new',
  });
  const { confirmLeave } = useUnsavedChangesGuard({
    when: isDirty || saving || publishing,
    message: 'This email template has unsaved changes. Leave this page anyway?',
  });

  const validationError = useMemo(() => {
    if (!state.name.trim()) return 'Add a template name.';
    if (!state.subject.trim()) return 'Add an email subject.';
    if (!hasMessage(state.bodyHtml)) return 'Write an email message.';
    return null;
  }, [state.bodyHtml, state.name, state.subject]);

  const input = useMemo<EmailTemplateDraftInput>(() => ({
    name: state.name.trim(),
    subject: state.subject.trim(),
    preheader: state.preheader.trim() || null,
    body_html: state.bodyHtml,
    body_text: state.bodyText.trim() || null,
    category: state.category,
    is_active: state.isActive,
  }), [state]);

  const persistDraft = useCallback(async (
    options: { navigateAfterCreate?: boolean; notify?: boolean } = {},
  ): Promise<EmailTemplate | null> => {
    if (!organizationId) return null;
    if (validationError) {
      toast({ title: 'Draft needs attention', description: validationError, variant: 'destructive' });
      return null;
    }
    setSaving(true);
    try {
      const saved = template
        ? await saveEmailTemplateDraft(template.id, input, organizationId)
        : await createEmailTemplateDraft(input, organizationId);
      setTemplate(saved);
      const cleanState = { ...stateFromTemplate(saved), isActive: state.isActive };
      setState(cleanState);
      markClean(cleanState);
      if (!template && options.navigateAfterCreate !== false) {
        navigate(`/email-templates/${saved.id}`, { replace: true });
      }
      if (options.notify !== false) {
        toast({ title: 'Draft saved', description: 'Published emails continue using the current live version.' });
      }
      return saved;
    } catch {
      toast({ title: 'Unable to save draft', description: 'Your draft was not saved. Please try again.', variant: 'destructive' });
      return null;
    } finally {
      setSaving(false);
    }
  }, [input, markClean, navigate, organizationId, state, template, toast, validationError]);

  const handlePublish = useCallback(async () => {
    if (!organizationId) return;
    setPublishing(true);
    try {
      let target = template;
      if (!target || isDirty) {
        target = await persistDraft({ navigateAfterCreate: false, notify: false });
      }
      if (!target) return;
      const published = await publishEmailTemplate(target.id, state.isActive, organizationId);
      setTemplate(published);
      const cleanState = stateFromTemplate(published);
      setState(cleanState);
      markClean(cleanState);
      if (isNew) navigate(`/email-templates/${published.id}`, { replace: true });
      toast({ title: 'Template published', description: 'New uses of this template will receive the published version.' });
    } catch {
      toast({ title: 'Unable to publish', description: 'The live version has not changed.', variant: 'destructive' });
    } finally {
      setPublishing(false);
    }
  }, [isDirty, isNew, markClean, navigate, organizationId, persistDraft, state.isActive, template, toast]);

  const busy = saving || publishing;
  const status = template?.has_unpublished_changes || (!template && isDirty)
    ? { label: 'Draft', className: 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300' }
    : template?.published_version
      ? template.is_active
        ? { label: 'Active', className: 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300' }
        : { label: 'Inactive', className: 'border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300' }
      : { label: 'New', className: 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300' };

  const leading = <ShellBackButton label="Back to email templates" onClick={() => {
    if (confirmLeave()) navigate('/email-templates');
  }} />;

  if (orgError || loadError) return (
    <PageLayout title="EMAIL TEMPLATE" icon={<Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />} leading={leading}>
      <ErrorState title="Email template unavailable" description={orgError || loadError || 'Unable to load template.'} icon={FileText} onAction={() => void loadTemplate()} />
    </PageLayout>
  );

  if (loading || orgLoading || !organizationId) return (
    <PageLayout title="EMAIL TEMPLATE" icon={<Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />} leading={leading}>
      <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" /></div>
    </PageLayout>
  );

  return (
    <PageLayout
      title={isNew ? 'NEW EMAIL TEMPLATE' : 'EMAIL TEMPLATE'}
      icon={<Mail className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />}
      leading={leading}
      desktopTools={{
        status: <Badge variant="outline" className={status.className}>{status.label}</Badge>,
        secondaryAction: <HeaderAction label="Save draft" icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} prominence="secondary" disabled={busy || !isDirty} onClick={() => void persistDraft()} />,
        primaryAction: <HeaderAction label="Publish" icon={publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} disabled={busy || Boolean(validationError)} onClick={() => void handlePublish()} />,
      }}
      mobileActions={<div className="flex w-full items-center gap-2"><Badge variant="outline" className={status.className}>{status.label}</Badge><div className="ml-auto flex gap-2"><Button variant="outline" disabled={busy || !isDirty} onClick={() => void persistDraft()}><Save className="mr-2 h-4 w-4" />Save</Button><Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={busy || Boolean(validationError)} onClick={() => void handlePublish()}><Send className="mr-2 h-4 w-4" />Publish</Button></div></div>}
    >
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Template settings</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="template-name">Name</Label><Input id="template-name" value={state.name} placeholder="Monthly product update" disabled={busy} onChange={event => setState(current => ({ ...current, name: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="template-category">Category</Label><Select value={state.category} disabled={busy} onValueChange={category => setState(current => ({ ...current, category }))}><SelectTrigger id="template-category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General</SelectItem><SelectItem value="marketing">Marketing</SelectItem><SelectItem value="sales">Sales</SelectItem><SelectItem value="onboarding">Onboarding</SelectItem><SelectItem value="transactional">Transactional</SelectItem></SelectContent></Select></div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3 md:col-span-2"><div><Label htmlFor="template-active">Available for new campaigns and automations</Label><p className="mt-1 text-xs text-muted-foreground">Inactive templates remain available to review but cannot be selected for new sends.</p></div><Switch id="template-active" checked={state.isActive} disabled={busy} onCheckedChange={isActive => setState(current => ({ ...current, isActive }))} /></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Email content</CardTitle></CardHeader>
            <CardContent><EmailContentEditor value={state} onChange={content => setState(current => ({ ...current, ...content }))} disabled={busy} /></CardContent>
          </Card>
        </div>
        <Card className="xl:sticky xl:top-6">
          <CardHeader><CardTitle className="text-base">Recipient preview</CardTitle></CardHeader>
          <CardContent><EmailPreviewPane organizationId={organizationId} content={state} /></CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

export default EmailTemplateEditorPage;
