import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, UploadCloud, Save, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { PageLayout } from '@/components/layout/PageLayout';
import { ShellBackButton } from '@/components/layout/ShellBackButton';
import { HeaderAction } from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { CardGridSkeleton } from '@/components/ui/loading-skeletons';
import { useToast } from '@/hooks/use-toast';
import { useDirtyState } from '@/hooks/useDirtyState';
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
import { getApiUrl } from '@/lib/api';

export default function SignatureTemplateEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();

  const [template, setTemplate] = useState<SignatureTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [roles, setRoles] = useState<SignatureTemplateRole[]>([]);
  const [fields, setFields] = useState<SignatureTemplateField[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadTemplate = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getSignatureTemplate(Number(id));
      setTemplate(data.template);
      setTitle(data.template.title || '');
      setDescription(data.template.description || '');
      setMessage(data.template.message || '');
      setRoles(data.roles || []);
      setFields(data.fields || []);
    } catch (error) {
      setLoadError('This template could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadTemplate();
  }, [loadTemplate]);

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
    ready: Boolean(template) && !loading,
    resetKey: id ?? 'template',
  });
  const { confirmLeave } = useUnsavedChangesGuard({
    when: isDirty,
    message: 'This signature template has unsaved changes. Leave without saving them?',
  });

  const handleSave = async () => {
    if (!template) return;
    try {
      setLoading(true);
      const updated = await updateSignatureTemplate(template.id, {
        title,
        description,
        message,
        roles,
        fields
      });
      setTemplate(updated);
      markClean();
      toast({ title: 'Template updated' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save template', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!template || !file) return;
    try {
      setLoading(true);
      const updated = await uploadSignatureTemplate(template.id, file);
      setTemplate(updated);
      toast({ title: 'File uploaded' });
    } catch (error) {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setLoading(false);
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

  return (
    <PageLayout
      title="EDIT TEMPLATE"
      icon={<FileSignature className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      leading={
        <ShellBackButton label="Back to templates" onClick={() => {
          if (confirmLeave()) navigate('/templates');
        }} />
      }
      desktopTools={{
        primaryAction: (
          <HeaderAction
            label="Save template"
            icon={<Save className="h-4 w-4" />}
            onClick={() => void handleSave()}
            disabled={loading || !template || !isDirty}
          />
        ),
      }}
      mobileActions={
        <Button className="h-11 flex-1 bg-blue-600 text-white hover:bg-blue-700" onClick={handleSave} disabled={loading || !template || !isDirty}>
          <Save className="h-4 w-4 mr-2" />
          Save template
        </Button>
      }
    >
          {loadError ? (
            <ErrorState
              title="Template unavailable"
              description={loadError}
              onAction={() => void loadTemplate()}
            />
          ) : loading && !template ? (
            <CardGridSkeleton count={2} columns={2} height="h-80" />
          ) : (
          <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Template Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                <Separator />
                <div className="space-y-2">
                  <Label>Upload PDF</Label>
                  <Input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <Button variant="outline" onClick={handleUpload} disabled={!file || loading}>
                    <UploadCloud className="h-4 w-4 mr-2" />
                    Upload
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Roles</CardTitle>
                <Button variant="outline" size="sm" onClick={addRole}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {roles.length === 0 && (
                  <EmptyState icon={FileSignature} title="No roles yet" size="compact" />
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
                    <Button variant="ghost" size="sm" onClick={() => removeRole(index)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Field Placement</CardTitle>
            </CardHeader>
            <CardContent>
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
