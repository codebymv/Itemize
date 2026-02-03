import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Send, XCircle, Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageContainer, PageSurface } from '@/components/layout/PageContainer';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { FeatureGate } from '@/components/subscription/FeatureGate';
import {
  SignatureDocument,
  listSignatureDocuments,
  sendSignatureDocument,
  cancelSignatureDocument,
  downloadSignedDocument
} from '@/services/signaturesApi';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-800'
};

export function SignaturesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setHeaderContent } = useHeader();
  const [documents, setDocuments] = useState<SignatureDocument[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await listSignatureDocuments();
      setDocuments(response.items || []);
    } catch (error) {
      toast({ title: 'Failed to load documents', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const headerActions = useMemo(() => (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => fetchDocuments()}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh
      </Button>
      <Button variant="outline" onClick={() => navigate('/signatures/templates')}>
        Templates
      </Button>
      <Button onClick={() => navigate('/signatures/new')}>
        <Plus className="h-4 w-4 mr-2" />
        New Document
      </Button>
    </div>
  ), [navigate, fetchDocuments]);

  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex flex-col min-w-0">
          <span className="text-lg font-semibold truncate">Signatures</span>
          <span className="text-xs text-muted-foreground truncate">Send documents for signature and track status.</span>
        </div>
        <div className="hidden md:flex">{headerActions}</div>
      </div>
    );
    fetchDocuments();
    return () => setHeaderContent(null);
  }, [setHeaderContent, headerActions, fetchDocuments]);

  const handleSend = async (id: number) => {
    try {
      await sendSignatureDocument(id);
      toast({ title: 'Signature request sent' });
      fetchDocuments();
    } catch (error) {
      toast({ title: 'Failed to send signature request', variant: 'destructive' });
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await cancelSignatureDocument(id);
      toast({ title: 'Signature request cancelled' });
      fetchDocuments();
    } catch (error) {
      toast({ title: 'Failed to cancel request', variant: 'destructive' });
    }
  };

  const handleDownload = async (id: number) => {
    try {
      const result = await downloadSignedDocument(id);
      if (result?.url) {
        window.open(result.url, '_blank');
      }
    } catch (error) {
      toast({ title: 'Signed document not available', variant: 'destructive' });
    }
  };

  return (
    <PageContainer>
      <FeatureGate feature="signature_documents" showOverlay>
        <PageSurface>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold">Signature Documents</h1>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={5}>Loading...</TableCell>
                  </TableRow>
                )}
                {!loading && documents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>No signature documents yet.</TableCell>
                  </TableRow>
                )}
                {!loading && documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[doc.status] || statusColors.draft}>{doc.status}</Badge>
                    </TableCell>
                    <TableCell>{doc.sent_at ? new Date(doc.sent_at).toLocaleDateString() : '-'}</TableCell>
                    <TableCell>{doc.completed_at ? new Date(doc.completed_at).toLocaleDateString() : '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/signatures/${doc.id}`)}>
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        {doc.status === 'draft' && (
                          <Button variant="outline" size="sm" onClick={() => handleSend(doc.id)}>
                            <Send className="h-4 w-4 mr-1" />
                            Send
                          </Button>
                        )}
                        {doc.status !== 'completed' && doc.status !== 'cancelled' && (
                          <Button variant="outline" size="sm" onClick={() => handleCancel(doc.id)}>
                            <XCircle className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                        )}
                        {doc.status === 'completed' && (
                          <Button variant="outline" size="sm" onClick={() => handleDownload(doc.id)}>
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        )}
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

export default SignaturesPage;
