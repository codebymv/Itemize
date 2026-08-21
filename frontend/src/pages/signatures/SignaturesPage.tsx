import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Send, XCircle, Download, Eye, FileSignature, FileText, CheckCircle, Clock, ChevronDown, MoreVertical, Trash2, Search, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/StatCard';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { useToast } from '@/hooks/use-toast';
import { getStatusBadgeClass } from '@/lib/badge-utils';
import { ListRowSkeleton } from '@/components/ui/loading-skeletons';
import FieldPlacementCanvas from './components/FieldPlacementCanvas';
import {
  SignatureDocument,
  SignatureDocumentDetails,
  listSignatureDocuments,
  getSignatureDocument,
  sendSignatureDocument,
  remindSignatureDocument,
  cancelSignatureDocument,
  deleteSignatureDocument,
  downloadSignedDocument
} from '@/services/signaturesApi';

export function SignaturesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<SignatureDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedDocumentId, setExpandedDocumentId] = useState<number | null>(null);
  const [expandedDocumentData, setExpandedDocumentData] = useState<SignatureDocumentDetails | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [deleteDocumentId, setDeleteDocumentId] = useState<number | null>(null);

  const stats = useMemo(() => {
    const draftCount = documents.filter((doc) => doc.status === 'draft').length;
    const sentCount = documents.filter((doc) => doc.status === 'sent').length;
    const inProgressCount = documents.filter((doc) => doc.status === 'in_progress').length;
    const completedCount = documents.filter((doc) => doc.status === 'completed').length;
    const activeCount = sentCount + inProgressCount;
    return { draftCount, sentCount, inProgressCount, completedCount, activeCount };
  }, [documents]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />;
      case 'sent': return <Send className="h-5 w-5 text-orange-600 dark:text-orange-400" />;
      case 'in_progress': return <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />;
      case 'draft': return <Clock className="h-5 w-5 text-sky-600 dark:text-sky-400" />;
      case 'cancelled': return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
      default: return <Clock className="h-5 w-5 text-gray-400 dark:text-gray-500" />;
    }
  };

  const getStatusIconBg = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 dark:bg-green-900';
      case 'sent': return 'bg-orange-100 dark:bg-orange-900';
      case 'in_progress': return 'bg-orange-100 dark:bg-orange-900';
      case 'draft': return 'bg-sky-100 dark:bg-sky-900';
      case 'cancelled': return 'bg-red-100 dark:bg-red-900';
      default: return 'bg-gray-100 dark:bg-gray-800';
    }
  };

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await listSignatureDocuments();
      setDocuments(response.items || []);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load documents', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const headerActions = useMemo(() => (
    <>
      <div className="relative w-full max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-9 bg-muted/20 border-border/50 focus:bg-background transition-colors"
        />
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="all" className="text-xs">
            All
            <Badge variant="secondary" className="ml-2">{documents.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="active" className="text-xs">
            Active
            <Badge variant="secondary" className="ml-2">{stats.activeCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="draft" className="text-xs">
            Draft
            <Badge variant="secondary" className="ml-2">{stats.draftCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="text-xs">
            Done
            <Badge variant="secondary" className="ml-2">{stats.completedCount}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate('/documents/new')}>
        <Plus className="h-4 w-4 mr-2" />
        New Document
      </Button>
    </>
  ), [activeTab, documents.length, navigate, searchQuery, stats.activeCount, stats.completedCount, stats.draftCount]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const filteredDocuments = useMemo(() => {
    let filtered = documents;

    switch (activeTab) {
      case 'active':
        filtered = filtered.filter((doc) => doc.status === 'sent' || doc.status === 'in_progress');
        break;
      case 'draft':
        filtered = filtered.filter((doc) => doc.status === 'draft');
        break;
      case 'completed':
        filtered = filtered.filter((doc) => doc.status === 'completed');
        break;
      default:
        break;
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((doc) =>
        doc.title?.toLowerCase().includes(query) ||
        doc.message?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [documents, activeTab, searchQuery]);

  const handleSend = async (id: number) => {
    try {
      await sendSignatureDocument(id);
      toast({ title: 'Signature request sent' });
      fetchDocuments();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to send signature request', variant: 'destructive' });
    }
  };

  const handleResend = async (id: number) => {
    try {
      await remindSignatureDocument(id);
      toast({ title: 'Signature request resent' });
      fetchDocuments();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to resend signature request', variant: 'destructive' });
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await cancelSignatureDocument(id);
      toast({ title: 'Signature request cancelled' });
      fetchDocuments();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to cancel request', variant: 'destructive' });
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

  const handleDelete = async () => {
    if (!deleteDocumentId) return;
    try {
      await deleteSignatureDocument(deleteDocumentId);
      toast({ title: 'Draft deleted' });
      fetchDocuments();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete draft', variant: 'destructive' });
    } finally {
      setDeleteDocumentId(null);
    }
  };

  const handleToggleExpand = async (documentId: number, e: React.MouseEvent) => {
    e.stopPropagation();

    if (expandedDocumentId === documentId) {
      setExpandedDocumentId(null);
      setExpandedDocumentData(null);
      return;
    }

    setExpandedDocumentId(documentId);
    setExpandedDocumentData(null);
    setLoadingPreview(true);

    try {
      const data = await getSignatureDocument(documentId);
      setExpandedDocumentData(data);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load document details', variant: 'destructive' });
      setExpandedDocumentId(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <PageLayout
      title="DOCUMENTS"
      icon={<FileSignature className="h-5 w-5 text-blue-600 flex-shrink-0" />}
      mobileClassName="flex-col items-stretch"
      headerActions={headerActions}
      mobileActions={
        <>
          <div className="flex items-center gap-2 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 bg-muted/20 border-border/50 w-full"
              />
            </div>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white h-9" onClick={() => navigate('/documents/new')}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full h-9">
              <TabsTrigger value="all" className="flex-1 text-xs">
                All
                <Badge variant="secondary" className="ml-1">{documents.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="active" className="flex-1 text-xs">
                Active
                <Badge variant="secondary" className="ml-1">{stats.activeCount}</Badge>
              </TabsTrigger>
              <TabsTrigger value="draft" className="flex-1 text-xs">
                Draft
                <Badge variant="secondary" className="ml-1">{stats.draftCount}</Badge>
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex-1 text-xs">
                Done
                <Badge variant="secondary" className="ml-1">{stats.completedCount}</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </>
      }
    >
          <ResponsiveCardRail
            label="Document status summary"
            desktopColumns="md:grid-cols-4"
          >
            <StatCard
              title="Drafts"
              badgeText="Drafts"
              value={stats.draftCount}
              icon={FileText}
              description={`document${stats.draftCount !== 1 ? 's' : ''}`}
              colorTheme="gray"
              isLoading={loading}
            />
            <StatCard
              title="Sent"
              badgeText="Sent"
              value={stats.sentCount}
              icon={Send}
              description={`document${stats.sentCount !== 1 ? 's' : ''}`}
              colorTheme="orange"
              isLoading={loading}
            />
            <StatCard
              title="In Progress"
              badgeText="In Progress"
              value={stats.inProgressCount}
              icon={Clock}
              description={`document${stats.inProgressCount !== 1 ? 's' : ''}`}
              colorTheme="orange"
              isLoading={loading}
            />
            <StatCard
              title="Completed"
              badgeText="Completed"
              value={stats.completedCount}
              icon={CheckCircle}
              description={`document${stats.completedCount !== 1 ? 's' : ''}`}
              colorTheme="green"
              isLoading={loading}
            />
          </ResponsiveCardRail>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6">
                  <ListRowSkeleton count={5} />
                </div>
              ) : filteredDocuments.length === 0 ? (
                <EmptyState
                  icon={FileSignature}
                  title="No signature documents yet"
                  description="Create a document to start collecting signatures."
                  actionLabel="New Document"
                  onAction={() => navigate('/documents/new')}
                  className="p-12"
                />
              ) : (
                <div className="divide-y">
                  {filteredDocuments.map((doc) => {
                    const isExpanded = expandedDocumentId === doc.id;
                    return (
                      <div key={doc.id}>
                        <div
                          className="p-4 hover:bg-muted/50 transition-colors cursor-pointer group"
                          onClick={(e) => handleToggleExpand(doc.id, e)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getStatusIconBg(doc.status)}`}>
                                {getStatusIcon(doc.status)}
                              </div>
                              <p className="font-medium text-sm md:text-base truncate">{doc.title}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={(e) => handleToggleExpand(doc.id, e)}
                              >
                                <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? '' : 'transform rotate-180'}`} />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenuItem onClick={() => navigate(`/documents/${doc.id}`)}>
                                    <Eye className="h-4 w-4 mr-2" />View
                                  </DropdownMenuItem>
                                  {doc.status === 'draft' && (
                                    <DropdownMenuItem onClick={() => handleSend(doc.id)}>
                                      <Send className="h-4 w-4 mr-2" />Send
                                    </DropdownMenuItem>
                                  )}
                                  {(doc.status === 'sent' || doc.status === 'in_progress') && (
                                    <DropdownMenuItem onClick={() => handleResend(doc.id)}>
                                      <RefreshCw className="h-4 w-4 mr-2" />Resend
                                    </DropdownMenuItem>
                                  )}
                                  {doc.status === 'draft' && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => setDeleteDocumentId(doc.id)}
                                        className="text-destructive focus:text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />Delete
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  {doc.status !== 'completed' && doc.status !== 'cancelled' && doc.status !== 'draft' && (
                                    <DropdownMenuItem onClick={() => handleCancel(doc.id)}>
                                      <XCircle className="h-4 w-4 mr-2" />Cancel
                                    </DropdownMenuItem>
                                  )}
                                  {doc.status === 'completed' && (
                                    <DropdownMenuItem onClick={() => handleDownload(doc.id)}>
                                      <Download className="h-4 w-4 mr-2" />Download
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <Badge className={`text-xs pointer-events-none cursor-default ${getStatusBadgeClass(doc.status)}`}>
                              {doc.status.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())}
                            </Badge>
                            {(() => {
                              const expandedRecipients = expandedDocumentData?.document.id === doc.id
                                ? expandedDocumentData.recipients
                                : null;
                              const recipientCount = doc.recipient_count
                                ?? (doc as { recipients_count?: number }).recipients_count
                                ?? (expandedRecipients ? expandedRecipients.length : undefined);
                              if (recipientCount == null) return null;
                              return (
                                <span className="text-xs text-muted-foreground">
                                  {recipientCount} recipient{recipientCount !== 1 ? 's' : ''}
                                </span>
                              );
                            })()}
                            <span className="text-xs text-muted-foreground">Sent {doc.sent_at ? new Date(doc.sent_at).toLocaleDateString() : '-'}</span>
                            <span className="text-xs text-muted-foreground">Completed {doc.completed_at ? new Date(doc.completed_at).toLocaleDateString() : '-'}</span>
                          </div>

                          {isExpanded && expandedDocumentData?.document.id === doc.id && (
                            <>
                              {expandedDocumentData.document.message && (
                                <div className="mt-2 px-6 text-sm text-muted-foreground whitespace-pre-wrap">
                                  {expandedDocumentData.document.message}
                                </div>
                              )}
                              {expandedDocumentData.recipients.length > 0 && (
                                <div className="mt-2 px-6 flex flex-wrap gap-2">
                                  {expandedDocumentData.recipients.map((recipient) => (
                                    <Badge key={recipient.id} variant="secondary">
                                      {recipient.name || recipient.email}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {isExpanded && (
                          <div className="bg-muted/30 border-t px-6 py-6">
                            {loadingPreview ? (
                              <div className="flex items-center justify-center py-8 text-muted-foreground">Loading preview...</div>
                            ) : expandedDocumentData ? (
                              <div className="space-y-4">
                                {expandedDocumentData.document.file_url ? (
                                  <FieldPlacementCanvas
                                    fields={expandedDocumentData.fields}
                                    onChange={() => undefined}
                                    fileUrl={expandedDocumentData.document.file_url}
                                    roles={expandedDocumentData.recipients.map((recipient) => recipient.role_name || '').filter(Boolean)}
                                    documentId={expandedDocumentData.document.id}
                                    readOnly
                                  />
                                ) : (
                                  <div className="text-sm text-muted-foreground">
                                    Upload a PDF to preview field placement.
                                  </div>
                                )}

                                <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-4 pt-4 border-t">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/documents/${doc.id}`);
                                    }}
                                    className="text-xs sm:text-sm"
                                  >
                                    <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                    View
                                  </Button>
                                  {doc.status === 'draft' && (
                                    <Button
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSend(doc.id);
                                      }}
                                    >
                                      <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                      Send
                                    </Button>
                                  )}
                                  {(doc.status === 'sent' || doc.status === 'in_progress') && (
                                    <Button
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleResend(doc.id);
                                      }}
                                    >
                                      <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                      Resend
                                    </Button>
                                  )}
                                  {doc.status !== 'completed' && doc.status !== 'cancelled' && doc.status !== 'draft' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancel(doc.id);
                                      }}
                                      className="text-xs sm:text-sm"
                                    >
                                      <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                      Cancel
                                    </Button>
                                  )}
                                  {doc.status === 'completed' && (
                                    <Button
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownload(doc.id);
                                      }}
                                    >
                                      <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                      Download
                                    </Button>
                                  )}
                                  {doc.status === 'draft' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive focus:text-destructive text-xs sm:text-sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteDocumentId(doc.id);
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                      Delete
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">No details available.</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

      <DeleteDialog
        open={deleteDocumentId !== null}
        onOpenChange={(open) => !open && setDeleteDocumentId(null)}
        onConfirm={handleDelete}
        itemType="document"
        itemTitle={documents.find(d => d.id === deleteDocumentId)?.title}
      />
    </PageLayout>
  );
}

export default SignaturesPage;
