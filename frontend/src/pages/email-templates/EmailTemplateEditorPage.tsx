import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Mail, Pencil, Settings2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  EmailContentEditor,
  type EmailContentValue,
} from "@/components/email/EmailContentEditor";
import { EmailPreviewPane } from "@/components/email/EmailPreviewPane";
import { EmailStudioDialog } from "@/components/email/EmailStudioDialog";
import { EmailTemplateBrowserDialog } from "@/components/email/EmailTemplateBrowserDialog";
import { ErrorState } from "@/components/ErrorState";
import { OrganizationErrorState } from "@/components/OrganizationErrorState";
import { HeaderAction } from "@/components/layout/DesktopHeaderTools";
import { PageLayout } from "@/components/layout/PageLayout";
import { EntityDetailHeader } from "@/components/layout/EntityDetailHeader";
import { ShellBackButton } from "@/components/layout/ShellBackButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCardTitle } from "@/components/ui/section-card-title";
import { AvailabilitySettingRow } from "@/components/settings/SettingsPrimitives";
import { useAuthState } from "@/contexts/AuthContext";
import { useDirtyState } from "@/hooks/useDirtyState";
import { useOrganization } from "@/hooks/useOrganization";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getEmailTemplateCatalogVisual,
  getEmailTemplatePublicationVisual,
} from "./constants/emailTemplateVisuals";
import { toBadgeStatus } from "@/lib/statusVisuals";
import {
  createEmailTemplateDraft,
  getEmailTemplate,
  getEmailTemplates,
  publishEmailTemplate,
  saveEmailTemplateDraft,
  sendTestEmail,
  type EmailTemplate,
  type EmailTemplateDraftInput,
} from "@/services/emailApi";

interface EditorState extends EmailContentValue {
  name: string;
  category: string;
  isActive: boolean;
}

const EMPTY_STATE: EditorState = {
  name: "",
  category: "general",
  isActive: true,
  subject: "",
  preheader: "",
  bodyHtml: "<p></p>",
  bodyText: "",
};

const TEMPLATE_CATEGORIES = [
  "general",
  "marketing",
  "sales",
  "onboarding",
  "transactional",
] as const;
const normalizeCategory = (category?: string | null): string =>
  category?.trim().toLowerCase() || "general";
const categoryLabel = (category: string): string =>
  category.charAt(0).toUpperCase() + category.slice(1);

const stateFromTemplate = (template: EmailTemplate): EditorState => ({
  name: template.name,
  category: normalizeCategory(template.category),
  isActive:
    template.draft_is_active ??
    (template.published_version ? template.is_active : true),
  subject: template.draft_subject ?? template.subject,
  preheader: template.draft_preheader ?? template.preheader ?? "",
  bodyHtml: template.draft_body_html ?? template.body_html,
  bodyText: template.draft_body_text ?? template.body_text ?? "",
});

const hasMessage = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim().length > 0;
const messageSummary = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function EmailTemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAuthState();
  const {
    organizationId,
    isLoading: orgLoading,
    error: orgError,
  } = useOrganization();
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [state, setState] = useState<EditorState>(EMPTY_STATE);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(true);
  const [studioMode, setStudioMode] = useState<"edit" | "preview">("edit");
  const [templateBrowserOpen, setTemplateBrowserOpen] = useState(false);
  const [templateDetailsOpen, setTemplateDetailsOpen] = useState(false);
  const [templateLibrary, setTemplateLibrary] = useState<EmailTemplate[]>([]);
  const [templateLibraryLoading, setTemplateLibraryLoading] = useState(false);

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
      setLoadError(
        "We could not load this email template. No changes were made.",
      );
    } finally {
      setLoading(false);
    }
  }, [id, isNew, orgLoading, organizationId]);

  useEffect(() => {
    void loadTemplate();
  }, [loadTemplate]);
  useEffect(() => {
    setStudioOpen(true);
    setStudioMode("edit");
  }, [id]);
  useEffect(() => {
    if (!templateBrowserOpen || !organizationId) return;
    let active = true;
    setTemplateLibraryLoading(true);
    getEmailTemplates(organizationId)
      .then((response) => {
        if (active) setTemplateLibrary(response.templates || []);
      })
      .catch(() => {
        if (active)
          toast({
            title: "Unable to load templates",
            description: "Your template library is temporarily unavailable.",
            variant: "destructive",
          });
      })
      .finally(() => {
        if (active) setTemplateLibraryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId, templateBrowserOpen, toast]);

  const { isDirty, markClean } = useDirtyState({
    value: state,
    ready: !loading && !orgLoading,
    resetKey: id || "new",
  });
  const { confirmLeave } = useUnsavedChangesGuard({
    when: isDirty || saving || testing || publishing,
    message: "This email template has unsaved changes. Leave anyway?",
  });

  const validationError = useMemo(() => {
    if (!state.name.trim()) return "Add a template name.";
    if (!state.subject.trim()) return "Add an email subject.";
    if (!hasMessage(state.bodyHtml)) return "Write an email message.";
    return null;
  }, [state.bodyHtml, state.name, state.subject]);

  const input = useMemo<EmailTemplateDraftInput>(
    () => ({
      name: state.name.trim(),
      subject: state.subject.trim(),
      preheader: state.preheader.trim() || null,
      body_html: state.bodyHtml,
      body_text: state.bodyText.trim() || null,
      category: state.category,
      is_active: state.isActive,
    }),
    [state],
  );

  const persistDraft = useCallback(
    async (
      options: { navigateAfterCreate?: boolean; notify?: boolean } = {},
    ): Promise<EmailTemplate | null> => {
      if (!organizationId) return null;
      if (validationError) {
        toast({
          title: "Draft needs attention",
          description: validationError,
          variant: "destructive",
        });
        return null;
      }
      setSaving(true);
      try {
        const saved = template
          ? await saveEmailTemplateDraft(template.id, input, organizationId)
          : await createEmailTemplateDraft(input, organizationId);
        setTemplate(saved);
        const cleanState = {
          ...stateFromTemplate(saved),
          isActive: state.isActive,
        };
        setState(cleanState);
        markClean(cleanState);
        if (!template && options.navigateAfterCreate !== false) {
          navigate(`/email-templates/${saved.id}`, { replace: true });
        }
        if (options.notify !== false) {
          toast({
            title: "Draft saved",
            description:
              "The published version remains live until you publish.",
          });
        }
        return saved;
      } catch {
        toast({
          title: "Unable to save draft",
          description: "Your draft was not saved. Please try again.",
          variant: "destructive",
        });
        return null;
      } finally {
        setSaving(false);
      }
    },
    [
      input,
      markClean,
      navigate,
      organizationId,
      state,
      template,
      toast,
      validationError,
    ],
  );

  const handlePublish = useCallback(async () => {
    if (!organizationId) return;
    setPublishing(true);
    try {
      let target = template;
      if (!target || isDirty)
        target = await persistDraft({
          navigateAfterCreate: false,
          notify: false,
        });
      if (!target) return;
      const published = await publishEmailTemplate(
        target.id,
        state.isActive,
        organizationId,
      );
      setTemplate(published);
      const cleanState = stateFromTemplate(published);
      setState(cleanState);
      markClean(cleanState);
      if (isNew)
        navigate(`/email-templates/${published.id}`, { replace: true });
      toast({
        title: "Template published",
        description: "New sends will use this version.",
      });
    } catch {
      toast({
        title: "Unable to publish",
        description: "The live version has not changed.",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  }, [
    isDirty,
    isNew,
    markClean,
    navigate,
    organizationId,
    persistDraft,
    state.isActive,
    template,
    toast,
  ]);

  const handleTest = useCallback(async () => {
    if (!organizationId || !currentUser?.email) {
      toast({
        title: "Test email unavailable",
        description: "Your account needs a delivery email address.",
        variant: "destructive",
      });
      return;
    }
    let target = template;
    if (!target || isDirty)
      target = await persistDraft({
        navigateAfterCreate: false,
        notify: false,
      });
    if (!target) return;
    if (isNew) navigate(`/email-templates/${target.id}`, { replace: true });
    setTesting(true);
    try {
      const useDraft = Boolean(
        target.has_unpublished_changes || !target.published_version,
      );
      await sendTestEmail(
        target.id,
        organizationId,
        currentUser.email,
        undefined,
        useDraft,
      );
      toast({
        title: "Test email queued",
        description: `Sending this ${useDraft ? "draft" : "published version"} to ${currentUser.email}.`,
      });
    } catch {
      toast({
        title: "Unable to send test",
        description: "Your template has not been changed.",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  }, [
    currentUser?.email,
    isDirty,
    isNew,
    navigate,
    organizationId,
    persistDraft,
    template,
    toast,
  ]);

  const busy = saving || testing || publishing;
  const status = getEmailTemplatePublicationVisual({
    exists: Boolean(template),
    hasUnpublishedChanges: Boolean(template?.has_unpublished_changes),
    hasPublishedVersion: Boolean(template?.published_version),
    isActive: Boolean(template?.is_active),
    isDirty,
  });

  const closeStudio = (open: boolean) => {
    if (open) {
      setStudioOpen(true);
      return;
    }
    if (!confirmLeave()) return;
    setStudioOpen(false);
    if (isNew && !template) navigate("/email-templates");
  };
  const goBack = () => {
    if (confirmLeave()) navigate("/email-templates");
  };
  const leading = (
    <ShellBackButton label="Back to email templates" onClick={goBack} />
  );

  if (orgError || loadError)
    return (
      <PageLayout
        title="EMAIL TEMPLATE"
        icon={<Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
        leading={leading}
      >
        {orgError ? (
          <OrganizationErrorState
            title="Unable to load email template"
            icon={Mail}
          />
        ) : (
          <ErrorState
            kind="page"
            title="Email template unavailable"
            description={loadError || undefined}
            icon={FileText}
            onAction={() => void loadTemplate()}
          />
        )}
      </PageLayout>
    );

  if (loading || orgLoading || !organizationId)
    return (
      <PageLayout
        title="EMAIL TEMPLATE"
        icon={<Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
        leading={leading}
      >
        <div className="flex min-h-[420px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />
        </div>
      </PageLayout>
    );

  const studioEditor = (
    <Card>
      <CardContent surface="inset">
        <EmailContentEditor
          header={
            <SectionCardTitle icon={Mail}>Email content</SectionCardTitle>
          }
          value={state}
          onChange={(content) =>
            setState((current) => ({ ...current, ...content }))
          }
          disabled={busy}
        />
      </CardContent>
    </Card>
  );

  return (
    <PageLayout
      title={isNew ? "NEW EMAIL TEMPLATE" : "EMAIL TEMPLATE"}
      icon={
        <Mail className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
      }
      leading={leading}
      headerTools={{
        status: (
          <Badge
            className={cn(
              "pointer-events-none whitespace-nowrap",
              status.badgeClass,
            )}
          >
            {status.label}
          </Badge>
        ),
        primaryAction: (
          <HeaderAction
            label="Edit email"
            icon={<Pencil className="h-4 w-4" />}
            onClick={() => setStudioOpen(true)}
          />
        ),
      }}
    >
      <EntityDetailHeader
        icon={<Mail className={cn("h-6 w-6", status.iconClass)} />}
        iconClassName={status.iconBackgroundClass}
        title={state.name || "New email template"}
        mobileStatus={
          <Badge className={status.badgeClass}>{status.label}</Badge>
        }
        descriptor={state.subject || "Add an email subject"}
        metadata={
          <>
            <span>{categoryLabel(state.category)}</span>
            {template?.published_version ? (
              <span>Version {template.published_version}</span>
            ) : (
              <span>Not published yet</span>
            )}
            {template?.has_unpublished_changes && (
              <span>Unpublished changes</span>
            )}
          </>
        }
      />

      <div className="grid items-stretch gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionCardTitle icon={Settings2}>
              Template settings
            </SectionCardTitle>
          </CardHeader>
          <CardContent surface="inset" className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Category</span>
              <span>{categoryLabel(state.category)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Availability</span>
              <span>{state.isActive ? "Available" : "Inactive"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Live version</span>
              <span>
                {template?.published_version
                  ? `Version ${template.published_version}`
                  : "Not published"}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionCardTitle icon={Mail}>Email content</SectionCardTitle>
          </CardHeader>
          <CardContent surface="inset" className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Subject</p>
              <p className="mt-1 text-sm">{state.subject || "Not set"}</p>
            </div>
            {state.preheader && (
              <div>
                <p className="text-xs text-muted-foreground">Preview text</p>
                <p className="mt-1 text-sm">{state.preheader}</p>
              </div>
            )}
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {messageSummary(state.bodyHtml) || "No message yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      <EmailStudioDialog
        open={studioOpen}
        onOpenChange={closeStudio}
        title={state.name || "New email template"}
        status={status}
        organizationId={organizationId}
        content={state}
        editor={studioEditor}
        headerActions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2 text-blue-600 hover:bg-blue-500/10 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-400/10 dark:hover:text-blue-300 sm:px-3"
            onClick={() => setTemplateBrowserOpen(true)}
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Templates</span>
            <span className="sr-only sm:hidden">Browse templates</span>
          </Button>
        }
        mode={studioMode}
        onModeChange={setStudioMode}
        saving={saving}
        testing={testing}
        publishing={publishing}
        saveDisabled={!isDirty || Boolean(validationError)}
        testDisabled={Boolean(validationError) || !currentUser?.email}
        publishDisabled={Boolean(validationError)}
        onSave={() => void persistDraft()}
        onTest={() => void handleTest()}
        onPublish={() => void handlePublish()}
      />

      <EmailTemplateBrowserDialog
        open={templateBrowserOpen}
        onOpenChange={setTemplateBrowserOpen}
        title="Browse email templates"
        description="Choose a template to edit."
        items={templateLibrary.map((item) => ({
          ...item,
          status: toBadgeStatus(getEmailTemplateCatalogVisual(item.is_active)),
          meta: item.published_version
            ? `Version ${item.published_version}`
            : "Not published",
        }))}
        loading={templateLibraryLoading}
        selectedId={template?.id || null}
        headerAction={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2 text-blue-600 hover:bg-blue-500/10 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-400/10 dark:hover:text-blue-300 sm:px-3"
            onClick={() => setTemplateDetailsOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Template details</span>
            <span className="sr-only sm:hidden">Template details</span>
          </Button>
        }
        onSelect={(item) => {
          if (item.id === template?.id) return;
          if (!confirmLeave()) return false;
          navigate(`/email-templates/${item.id}`);
        }}
        renderPreview={(item) => (
          <EmailPreviewPane
            organizationId={organizationId}
            content={{
              subject: item.draft_subject ?? item.subject,
              preheader: item.draft_preheader ?? item.preheader ?? "",
              bodyHtml: item.draft_body_html ?? item.body_html,
              bodyText: item.draft_body_text ?? item.body_text ?? "",
            }}
            className="h-full"
          />
        )}
        emptyTitle="No email templates yet"
        emptyDescription="Create your first reusable campaign or automation email."
      />

      <Dialog open={templateDetailsOpen} onOpenChange={setTemplateDetailsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Template details</DialogTitle>
            <DialogDescription className="sr-only">
              Manage this template's name, category, and availability.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                value={state.name}
                placeholder="Monthly product update"
                disabled={busy}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-category">Category</Label>
              <Select
                value={state.category || undefined}
                disabled={busy}
                onValueChange={(category) =>
                  setState((current) => ({ ...current, category }))
                }
              >
                <SelectTrigger id="template-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {state.category &&
                    !TEMPLATE_CATEGORIES.includes(
                      state.category as (typeof TEMPLATE_CATEGORIES)[number],
                    ) && (
                      <SelectItem value={state.category}>
                        {categoryLabel(state.category)}
                      </SelectItem>
                    )}
                  {TEMPLATE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {categoryLabel(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <AvailabilitySettingRow
              id="template-active"
              label="Available to use"
              checked={state.isActive}
              disabled={busy}
              onCheckedChange={(isActive) =>
                setState((current) => ({ ...current, isActive }))
              }
              help="Unavailable templates remain editable but cannot be selected for new sends."
              helpLabel="About template availability"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              className="bg-blue-600 text-white interaction-button--primary"
              onClick={() => setTemplateDetailsOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

export default EmailTemplateEditorPage;
