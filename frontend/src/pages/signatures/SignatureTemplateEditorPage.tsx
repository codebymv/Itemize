import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, UploadCloud, Save, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import {
  SignatureTemplate,
  SignatureTemplateRole,
  SignatureTemplateField,
  getSignatureTemplate,
  updateSignatureTemplate,
  uploadSignatureTemplate
} from '@/services/signaturesApi';
import FieldPlacementCanvas from './components/FieldPlacementCanvas';

export default function SignatureTemplateEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { setHeaderContent } = useHeader();

  const [template, setTemplate] = useState<SignatureTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [roles, setRoles] = useState<SignatureTemplateRole[]>([]);
  const [fields, setFields] = useState<SignatureTemplateField[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2 ml-2 min-w-0">
          <FileSignature className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <span className="text-xl font-semibold italic uppercase tracking-wide truncate">Edit Signature Template</span>
        </div>
      </div>
    );
    return () => setHeaderContent(null);
  }, [setHeaderContent]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getSignatureTemplate(Number(id))
      .then((data) => {
        setTemplate(data.template);
        setTitle(data.template.title || '');
        setDescription(data.template.description || '');
        setMessage(data.template.message || '');
        setRoles(data.roles || []);
        setFields(data.fields || []);
      })
      .catch(() => {
        toast({ title: 'Failed to load template', variant: 'destructive' });
        navigate('/templates');
      })
      .finally(() => setLoading(false));
  }, [id, toast, navigate]);

  const roleNames = useMemo(
    () => roles.map((role) => role.role_name).filter(Boolean),
    [roles]
  );

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
      toast({ title: 'Template updated' });
    } catch (error) {
      toast({ title: 'Failed to save template', variant: 'destructive' });
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
    <PageContainer>
        <PageSurface>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold">Edit Template</h1>
            <div className="flex gap-2">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave} disabled={loading || !template}>
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </div>
          </div>

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
                {roles.length === 0 && <p className="text-sm text-muted-foreground">No roles yet.</p>}
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
                fields={fields as any}
                onChange={(next) => setFields(next as SignatureTemplateField[])}
                fileUrl={template?.file_url || ''}
                roles={roleNames}
              />
            </CardContent>
          </Card>
        </PageSurface>
    </PageContainer>
  );
}
