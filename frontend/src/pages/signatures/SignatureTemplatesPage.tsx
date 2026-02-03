import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Eye, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { FeatureGate } from '@/components/subscription/FeatureGate';
import { SignatureTemplate, listSignatureTemplates, createSignatureTemplate, instantiateSignatureTemplate } from '@/services/signaturesApi';

export default function SignatureTemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setHeaderContent } = useHeader();
  const [templates, setTemplates] = useState<SignatureTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await listSignatureTemplates();
      setTemplates(response || []);
    } catch (error) {
      toast({ title: 'Failed to load templates', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleCreate = useCallback(async () => {
    try {
      const created = await createSignatureTemplate({ title: 'New Template' });
      navigate(`/signatures/templates/${created.id}`);
    } catch (error) {
      toast({ title: 'Failed to create template', variant: 'destructive' });
    }
  }, [navigate, toast]);

  const handleUseTemplate = useCallback(async (templateId: number) => {
    try {
      const document = await instantiateSignatureTemplate(templateId, {});
      navigate(`/signatures/${document.id}`);
    } catch (error) {
      toast({ title: 'Failed to create document from template', variant: 'destructive' });
    }
  }, [navigate, toast]);

  const headerActions = useMemo(() => (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => fetchTemplates()}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh
      </Button>
      <Button onClick={() => handleCreate()}>
        <Plus className="h-4 w-4 mr-2" />
        New Template
      </Button>
    </div>
  ), [fetchTemplates, handleCreate]);

  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex flex-col min-w-0">
          <span className="text-lg font-semibold truncate">Signature Templates</span>
          <span className="text-xs text-muted-foreground truncate">Manage reusable templates for signature documents.</span>
        </div>
        <div className="hidden md:flex">{headerActions}</div>
      </div>
    );
    fetchTemplates();
    return () => setHeaderContent(null);
  }, [setHeaderContent, headerActions, fetchTemplates]);

  return (
    <PageContainer>
      <FeatureGate feature="signature_documents" showOverlay>
        <PageSurface>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold">Signature Templates</h1>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={3}>Loading...</TableCell>
                  </TableRow>
                )}
                {!loading && templates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3}>No templates yet.</TableCell>
                  </TableRow>
                )}
                {!loading && templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.title}</TableCell>
                    <TableCell>{new Date(template.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => navigate(`/signatures/templates/${template.id}`)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleUseTemplate(template.id)}>
                        <Send className="h-4 w-4 mr-1" />
                        Use
                      </Button>
                    </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </PageSurface>
      </FeatureGate>
    </PageContainer>
  );
}
