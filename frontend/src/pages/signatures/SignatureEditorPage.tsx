import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, UploadCloud, Save, Send, FileSignature, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from '@/contexts/AuthContext';
import { useHeader } from '@/contexts/HeaderContext';
import {
  SignatureDocument,
  SignatureRecipient,
  SignatureField,
  createSignatureDocument,
  updateSignatureDocument,
  uploadSignatureDocument,
  deleteSignatureDocumentFile,
  getSignatureDocument,
  sendSignatureDocument
} from '@/services/signaturesApi';
import FieldPlacementCanvas from './components/FieldPlacementCanvas';
import SendSignatureModal from './components/SendSignatureModal';

export default function SignatureEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { setHeaderContent } = useHeader();
  const { currentUser } = useAuthState();

  const [document, setDocument] = useState<SignatureDocument | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [recipients, setRecipients] = useState<SignatureRecipient[]>([]);
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [routingMode, setRoutingMode] = useState<'parallel' | 'sequential'>('parallel');
  const [loading, setLoading] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const roleChoices = useMemo(() => ['Signer', 'Witness', 'Approver', 'Observer'], []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const roleOptions = useMemo(
    () => recipients.map((recipient) => recipient.role_name).filter((role): role is string => Boolean(role)),
    [recipients]
  );

  const isEditing = Boolean(id);

  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2 ml-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate('/documents')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
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
          sender_name: currentUser?.name || document.sender_name || undefined,
          sender_email: currentUser?.email || document.sender_email || undefined,
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

  const handleUpload = async (nextFile?: File | null) => {
    const activeFile = nextFile ?? file;
    if (!activeFile) return;
    try {
      setLoading(true);
      let targetDocument = document;
      if (!targetDocument) {
        const fallbackTitle = title || activeFile.name.replace(/\.[^/.]+$/, '');
        if (!title && fallbackTitle) {
          setTitle(fallbackTitle);
        }
        targetDocument = await createSignatureDocument({
          title: title || fallbackTitle || 'Untitled document',
          description,
          message,
          routing_mode: routingMode
        });
        setDocument(targetDocument);
      }
      const updated = await uploadSignatureDocument(targetDocument.id, activeFile);
      setDocument(updated);
      toast({ title: 'File uploaded' });
    } catch (error) {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleClearFile = async () => {
    if (document?.id && document.file_url) {
      try {
        setLoading(true);
        const updated = await deleteSignatureDocumentFile(document.id);
        setDocument(updated);
        setFile(null);
        toast({ title: 'File removed' });
      } catch (error) {
        toast({ title: 'Failed to remove file', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
      return;
    }
    setFile(null);
  };

  const handleSend = async (options: { message: string }) => {
    if (!document) return;
    try {
      setLoading(true);
      setMessage(options.message);
      await updateSignatureDocument(document.id, {
        recipients,
        fields,
        routing_mode: routingMode,
        message: options.message,
        sender_name: currentUser?.name || document.sender_name || undefined,
        sender_email: currentUser?.email || document.sender_email || undefined
      });
      await sendSignatureDocument(document.id);
      toast({ title: 'Signature request sent' });
      setShowSendModal(false);
      navigate('/documents');
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
        role_name: 'Signer',
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
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowSendModal(true)} disabled={loading || !document}>
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
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Upload PDF</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const selected = e.target.files?.[0] || null;
                    setFile(selected);
                    if (selected) {
                      handleUpload(selected);
                    }
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose File
                  </Button>
                  <span className="text-sm text-muted-foreground truncate">
                    {file?.name || document?.file_name || 'No file chosen'}
                  </span>
                </div>
                {(file || document?.file_name) && (
                  <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span className="truncate">
                      {file?.name || document?.file_name}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleClearFile}
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
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
                  <div className="space-y-2">
                    <Select
                      value={roleChoices.includes(recipient.role_name || '') ? recipient.role_name || '' : 'custom'}
                      onValueChange={(value) => {
                        if (value === 'custom') {
                          updateRecipient(index, { role_name: '' });
                        } else {
                          updateRecipient(index, { role_name: value });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roleChoices.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">Custom…</SelectItem>
                      </SelectContent>
                    </Select>
                    {!roleChoices.includes(recipient.role_name || '') && (
                      <Input
                        placeholder="Custom role"
                        value={recipient.role_name || ''}
                        onChange={(e) => updateRecipient(index, { role_name: e.target.value })}
                      />
                    )}
                  </div>
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
              localFile={file}
              documentId={document?.id}
            />
          </CardContent>
        </Card>
        <SendSignatureModal
          open={showSendModal}
          onOpenChange={setShowSendModal}
          onSend={handleSend}
          sending={loading}
          documentTitle={title}
          senderName={document?.sender_name || currentUser?.name || 'Itemize'}
          senderEmail={document?.sender_email || currentUser?.email}
          recipients={recipients}
          message={message}
          onMessageChange={setMessage}
          hasFile={Boolean(file || document?.file_url)}
          expiresAt={document?.expires_at || null}
          routingMode={routingMode}
          onRoutingModeChange={setRoutingMode}
        />
      </PageSurface>
    </PageContainer>
  );
}
