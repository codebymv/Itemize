import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, UploadCloud, Save, Send, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import {
  SignatureDocument,
  SignatureRecipient,
  SignatureField,
  createSignatureDocument,
  updateSignatureDocument,
  uploadSignatureDocument,
  getSignatureDocument,
  sendSignatureDocument
} from '@/services/signaturesApi';
import FieldPlacementCanvas from './components/FieldPlacementCanvas';

export default function SignatureEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { setHeaderContent } = useHeader();

  const [document, setDocument] = useState<SignatureDocument | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [recipients, setRecipients] = useState<SignatureRecipient[]>([]);
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [routingMode, setRoutingMode] = useState<'parallel' | 'sequential'>('parallel');
  const [loading, setLoading] = useState(false);
  const roleOptions = useMemo(
    () => recipients.map((recipient) => recipient.role_name).filter((role): role is string => Boolean(role)),
    [recipients]
  );

  const isEditing = Boolean(id);

  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2 ml-2 min-w-0">
          <FileSignature className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <span className="text-xl font-semibold italic uppercase tracking-wide truncate">
            {isEditing ? 'Edit Signature Document' : 'New Signature Document'}
          </span>
        </div>
      </div>
    );
    return () => setHeaderContent(null);
  }, [setHeaderContent, isEditing]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getSignatureDocument(Number(id))
      .then((data) => {
        setDocument(data.document);
        setTitle(data.document.title || '');
        setDescription(data.document.description || '');
        setMessage(data.document.message || '');
        setRoutingMode((data.document.routing_mode as 'parallel' | 'sequential') || 'parallel');
        setRecipients(data.recipients || []);
        setFields(data.fields || []);
      })
      .catch(() => {
        toast({ title: 'Failed to load document', variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [id, toast]);

  const canUpload = useMemo(() => Boolean(document?.id), [document]);

  const handleCreateOrSave = async () => {
    try {
      setLoading(true);
      if (!document) {
        const created = await createSignatureDocument({ title, description, message, routing_mode: routingMode });
        setDocument(created);
        toast({ title: 'Draft created' });
      } else {
        const updated = await updateSignatureDocument(document.id, {
          title,
          description,
          message,
          routing_mode: routingMode,
          recipients,
          fields
        });
        setDocument(updated);
        toast({ title: 'Document updated' });
      }
    } catch (error) {
      toast({ title: 'Failed to save document', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!document || !file) return;
    try {
      setLoading(true);
      const updated = await uploadSignatureDocument(document.id, file);
      setDocument(updated);
      toast({ title: 'File uploaded' });
    } catch (error) {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!document) return;
    try {
      setLoading(true);
      await updateSignatureDocument(document.id, { recipients, fields, routing_mode: routingMode });
      await sendSignatureDocument(document.id);
      toast({ title: 'Signature request sent' });
      navigate('/signatures');
    } catch (error) {
      toast({ title: 'Failed to send signature request', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const addRecipient = () => {
    setRecipients((prev) => [
      ...prev,
      {
        id: Date.now(),
        document_id: document?.id || 0,
        organization_id: document?.organization_id || 0,
        name: '',
        email: '',
        status: 'pending',
        signing_order: prev.length + 1
      }
    ]);
  };

  const updateRecipient = (index: number, updates: Partial<SignatureRecipient>) => {
    setRecipients((prev) => prev.map((recipient, idx) => (idx === index ? { ...recipient, ...updates } : recipient)));
  };

  const removeRecipient = (index: number) => {
    setRecipients((prev) => prev.filter((_, idx) => idx !== index));
  };

  return (
    <PageContainer>
        <PageSurface>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold">{isEditing ? 'Edit Document' : 'New Document'}</h1>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCreateOrSave} disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSend} disabled={loading || !document}>
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Document Details</CardTitle>
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
                <div>
                  <Label>Routing Mode</Label>
                  <Select value={routingMode} onValueChange={(value) => setRoutingMode(value as 'parallel' | 'sequential')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Routing mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="parallel">Parallel</SelectItem>
                      <SelectItem value="sequential">Sequential</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Upload PDF</Label>
                  <Input
                    type="file"
                    accept="application/pdf"
                    disabled={!canUpload}
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <Button variant="outline" onClick={handleUpload} disabled={!file || !canUpload || loading}>
                    <UploadCloud className="h-4 w-4 mr-2" />
                    Upload
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Recipients</CardTitle>
                <Button variant="outline" size="sm" onClick={addRecipient}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {recipients.length === 0 && <p className="text-sm text-muted-foreground">No recipients yet.</p>}
                {recipients.map((recipient, index) => (
                  <div key={recipient.id} className="grid grid-cols-1 gap-2 border rounded-md p-3">
                    <Input
                      placeholder="Name"
                      value={recipient.name || ''}
                      onChange={(e) => updateRecipient(index, { name: e.target.value })}
                    />
                    <Input
                      placeholder="Email"
                      value={recipient.email || ''}
                      onChange={(e) => updateRecipient(index, { email: e.target.value })}
                    />
                  <Input
                    placeholder="Role (e.g. Signer)"
                    value={recipient.role_name || ''}
                    onChange={(e) => updateRecipient(index, { role_name: e.target.value })}
                  />
                    <Button variant="ghost" size="sm" onClick={() => removeRecipient(index)}>
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
                fileUrl={document?.file_url || ''}
              roles={roleOptions}
              />
            </CardContent>
          </Card>
        </PageSurface>
    </PageContainer>
  );
}
