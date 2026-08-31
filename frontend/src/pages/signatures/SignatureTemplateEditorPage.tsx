import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { FileSignature, MousePointer2, Plus, Save, Trash2, UploadCloud, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PageLayout } from '@/components/layout/PageLayout';
import { ShellBackButton } from '@/components/layout/ShellBackButton';
import { HeaderAction } from '@/components/layout/DesktopHeaderTools';
import { EntityDetailHeader } from '@/components/layout/EntityDetailHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { CardGridSkeleton } from '@/components/ui/loading-skeletons';
import { SectionCardTitle } from '@/components/ui/section-card-title';
import { useToast } from '@/hooks/use-toast';
import { useDirtyState } from '@/hooks/useDirtyState';
import { useOrganization } from '@/hooks/useOrganization';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import {
  SignatureTemplate,
  SignatureTemplateRole,
  SignatureTemplateField,
  getSignatureTemplate,
  updateSignatureTemplate,
  uploadSignatureTemplate
} from '@/services/signaturesApi';
import FieldPlacementCanvas from './components/FieldPlacementCanvas';
import { getTemplateReadinessVisual } from './constants/signatureConstants';
import { getApiUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';

export default function SignatureTemplateEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const {
    organizationId,
    isLoading: organizationLoading,
    error: organizationError,
  } = useOrganization();
  const queryClient = useQueryClient();

  const [template, setTemplate] = useState<SignatureTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [roles, setRoles] = useState<SignatureTemplateRole[]>([]);
  const [fields, setFields] = useState<SignatureTemplateField[]>([]);
  const [working, setWorking] = useState(false);
  const initializedTemplateKeyRef = useRef<string | null>(null);
  const parsedTemplateId = id ? Number(id) : null;
  const templateId = parsedTemplateId !== null
    && Number.isSafeInteger(parsedTemplateId)
    && parsedTemplateId > 0
    ? parsedTemplateId
    : null;
  const invalidTemplateId = templateId === null;
  const templateQueryKey = [
    'signature-template-editor',
    organizationId,
    templateId,
  ] as const;
  const templateQuery = useQuery({
    queryKey: templateQueryKey,
    queryFn: ({ signal }) => getSignatureTemplate(
      templateId as number,
      organizationId as number,
      signal,
    ),
    enabled: !invalidTemplateId && organizationId !== null,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });

  useEffect(() => {
    const data = templateQuery.data;
    if (!data || !organizationId || !templateId) return;

    setTemplate(data.template);
    const initializationKey = `${organizationId}:${templateId}`;
    if (initializedTemplateKeyRef.current === initializationKey) return;
    initializedTemplateKeyRef.current = initializationKey;
    setTitle(data.template.title || '');
    setDescription(data.template.description || '');
    setMessage(data.template.message || '');
    setRoles(data.roles || []);
    setFields(data.fields || []);
  }, [organizationId, templateId, templateQuery.data]);

  const roleNames = useMemo(
    () => roles.map((role) => role.role_name).filter(Boolean),
    [roles]
  );
  const templateDraft = useMemo(() => ({
    title,
    description,
    message,
    roles,
    fields,
  }), [description, fields, message, roles, title]);
  const { isDirty, markClean } = useDirtyState({
    value: templateDraft,
    ready: Boolean(template) && !working,
    resetKey: id ?? 'template',
  });
  const { confirmLeave } = useUnsavedChangesGuard({
    when: isDirty,
    message: 'This signature template has unsaved changes. Leave without saving them?',
  });

  const handleSave = async () => {
    if (!template || !organizationId) return;
    try {
      setWorking(true);
      const updated = await updateSignatureTemplate(template.id, {
        title,
        description,
        message,
        roles,
        fields,
      }, organizationId);
      setTemplate(updated);
      queryClient.setQueryData(
        ['signature-template-editor', organizationId, template.id],
        { template: updated, roles, fields },
      );
      void queryClient.invalidateQueries({ queryKey: ['signature-templates', organizationId] });
      markClean();
      toast({ title: 'Template updated' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save template', variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleUpload = async () => {
    if (!template || !file || !organizationId) return;
    try {
      setWorking(true);
      const updated = await uploadSignatureTemplate(template.id, file, organizationId);
      setTemplate(updated);
      setFile(null);
      queryClient.setQueryData(
        ['signature-template-editor', organizationId, template.id],
        { template: updated, roles, fields },
      );
      toast({ title: 'File uploaded' });
    } catch (error) {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const addRole = () => {
    setRoles((prev) => [
      ...prev,
      { role_name: `Role ${prev.length + 1}`, signing_order: prev.length + 1 }
    ]);
  };

  const updateRole = (index: number, updates: Partial<SignatureTemplateRole>) => {
    setRoles((prev) => prev.map((role, idx) => (idx === index ? { ...role, ...updates } : role)));
  };

  const removeRole = (index: number) => {
    setRoles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const readinessVisual = getTemplateReadinessVisual(Boolean(template?.is_ready));
  const ReadinessIcon = readinessVisual.icon;
  const routeLoading = organizationLoading
    || (!invalidTemplateId && templateQuery.isPending);
  const loadError = invalidTemplateId
    ? 'This template link is invalid.'
    : organizationError
      || (templateQuery.error && !templateQuery.data
        ? 'This template could not be loaded. Please try again.'
        : null);

  return (
    <PageLayout
      title="TEMPLATE"
      icon={<FileSignature className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      leading={
        <ShellBackButton label="Back to templates" onClick={() => {
          if (confirmLeave()) navigate('/templates');
        }} />
      }
      headerTools={{
        status: template ? (
          <Badge className={cn('pointer-events-none whitespace-nowrap', readinessVisual.badgeClass)}>
            {readinessVisual.label}
          </Badge>
        ) : undefined,
        primaryAction: (
          <HeaderAction
            label="Save template"
            icon={<Save className="h-4 w-4" />}
            onClick={() => void handleSave()}
            disabled={working || !template || !isDirty}
            busy={working}
          />
        ),
      }}
    >
          {loadError ? (
            <ErrorState
              title="Template unavailable"
              description={loadError}
              onAction={invalidTemplateId
                ? undefined
                : () => void templateQuery.refetch()}
            />
          ) : routeLoading && !template ? (
            <CardGridSkeleton count={2} columns={2} height="h-80" />
          ) : (
          <>
          {template ? (
            <EntityDetailHeader
              icon={<ReadinessIcon className={cn('h-6 w-6', readinessVisual.iconClass)} />}
              iconClassName={readinessVisual.iconBackgroundClass}
              title={title || 'Untitled template'}
              mobileStatus={(
                <Badge className={readinessVisual.badgeClass}>{readinessVisual.label}</Badge>
              )}
              metadata={(
                <>
                  <span>{template.file_name || (template.file_url ? 'PDF attached' : 'PDF needed')}</span>
                  <span>{roles.length} role{roles.length === 1 ? '' : 's'}</span>
                  <span>{fields.length} field{fields.length === 1 ? '' : 's'}</span>
                </>
              )}
            />
          ) : null}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <SectionCardTitle icon={FileSignature}>Template settings</SectionCardTitle>
              </CardHeader>
              <CardContent surface="inset" className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} />
                </div>
                <div className="space-y-2 rounded-lg border p-3">
                  <Label htmlFor="template-pdf">PDF</Label>
                  <Input
                    id="template-pdf"
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <Button variant="outline" onClick={handleUpload} disabled={!file || working}>
                    <UploadCloud className="h-4 w-4 mr-2" />
                    Upload
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <SectionCardTitle icon={Users}>Roles</SectionCardTitle>
                <Button variant="outline" size="sm" onClick={addRole}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </CardHeader>
              <CardContent surface="inset" className="space-y-4">
                {roles.length === 0 && (
                  <EmptyState icon={FileSignature} kind="inline" title="No roles yet" />
                )}
                {roles.map((role, index) => (
                  <div key={`${role.role_name}-${index}`} className="grid grid-cols-1 gap-2 border rounded-md p-3">
                    <Input
                      placeholder="Role name"
                      value={role.role_name}
                      onChange={(e) => updateRole(index, { role_name: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={1}
                      placeholder="Signing order"
                      value={role.signing_order || 1}
                      onChange={(e) => updateRole(index, { signing_order: Number(e.target.value) })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="interaction-button--destructive-ghost ml-auto h-9 w-9 text-red-600 dark:text-red-400"
                      aria-label={`Remove ${role.role_name || `role ${index + 1}`}`}
                      onClick={() => removeRole(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <SectionCardTitle icon={MousePointer2}>Field placement</SectionCardTitle>
            </CardHeader>
            <CardContent surface="inset" className="p-0">
              <FieldPlacementCanvas
                fields={fields}
                onChange={setFields}
                fileUrl={template?.file_url ? `${getApiUrl()}/api/signatures/templates/${template.id}/file` : ''}
                roles={roleNames}
              />
            </CardContent>
          </Card>
          </>
          )}
    </PageLayout>
  );
}
