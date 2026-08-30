import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Send, XCircle, Download, Eye, FileSignature, FileText, CheckCircle, ChevronDown, MoreVertical, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageLayout } from '@/components/layout/PageLayout';
import { HeaderAction, HeaderCombinedQuery, HeaderFilters, HeaderSearch } from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/StatCard';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { ExpandedRowActionLabel, ExpandedRowActions } from '@/components/ui/expanded-row';
import { useToast } from '@/hooks/use-toast';
import { ListRowSkeleton } from '@/components/ui/loading-skeletons';
import FieldPlacementCanvas from './components/FieldPlacementCanvas';
import { getRecipientStatusVisual, getSignatureOperationalVisual } from './constants/signatureConstants';
import { filterDocuments, getDocumentStats, type DocumentStatusFilter } from './signatureCatalog';
import {
  SignatureDocument,
  SignatureDocumentDetails,
  listSignatureDocuments,
  getSignatureDocument,
  sendSignatureDocument,
  remindSignatureDocument,
  retrySignatureDocument,
  cancelSignatureDocument,
  deleteSignatureDocument,
  downloadSignedDocument
} from '@/services/signaturesApi';

export function SignaturesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<SignatureDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedDocumentId, setExpandedDocumentId] = useState<number | null>(null);
  const [expandedDocumentData, setExpandedDocumentData] = useState<SignatureDocumentDetails | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatusFilter>('all');
  const [deleteDocumentId, setDeleteDocumentId] = useState<number | null>(null);

  const stats = useMemo(() => getDocumentStats(documents), [documents]);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await listSignatureDocuments();
      setDocuments(response.items || []);
    } catch (error) {
      setLoadError('Documents could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const filteredDocuments = useMemo(
    () => filterDocuments(documents, { search: searchQuery, status: statusFilter }),
    [documents, searchQuery, statusFilter],
  );

  const statusSelect = (compact = false) => (
    <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as DocumentStatusFilter)}>
      <SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[10rem] bg-muted/20'}>
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All documents</SelectItem>
        <SelectItem value="active">Active</SelectItem>
        <SelectItem value="draft">Draft</SelectItem>
        <SelectItem value="completed">Completed</SelectItem>
        <SelectItem value="invalid">Invalid</SelectItem>
      </SelectContent>
    </Select>
  );

  const filterCount = Number(statusFilter !== 'all');
  const queryCount = filterCount + Number(searchQuery.trim().length > 0);

  const handleSend = async (id: number) => {
    try {
      await sendSignatureDocument(id);
      toast({ title: 'Signature request queued' });
      fetchDocuments();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to send signature request', variant: 'destructive' });
    }
  };

  const handleResend = async (id: number) => {
    try {
      await remindSignatureDocument(id);
      toast({ title: 'Signature reminder queued' });
      fetchDocuments();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to resend signature request', variant: 'destructive' });
    }
  };

  const handleRetry = async (id: number) => {
    try {
      await retrySignatureDocument(id);
      toast({ title: 'Failed processing queued for retry' });
      fetchDocuments();
    } catch (error) {
      toast({ title: 'Retry unavailable', description: 'The failed step could not be retried.', variant: 'destructive' });
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

  const handleDelete = async (): Promise<boolean> => {
    if (!deleteDocumentId) return false;
    try {
      await deleteSignatureDocument(deleteDocumentId);
      setDocuments((current) => current.filter((document) => document.id !== deleteDocumentId));
      setDeleteDocumentId(null);
      return true;
    } catch (error) {
      return false;
    }
  };

  const loadExpandedDocument = async (documentId: number) => {
    setExpandedDocumentId(documentId);
    setExpandedDocumentData(null);
    setPreviewError(false);
    setLoadingPreview(true);

    try {
      const data = await getSignatureDocument(documentId);
      setExpandedDocumentData(data);
    } catch {
      setPreviewError(true);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleToggleExpand = (documentId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (expandedDocumentId === documentId) {
      setExpandedDocumentId(null);
      setExpandedDocumentData(null);
      setPreviewError(false);
      return;
    }
    void loadExpandedDocument(documentId);
  };

  return (
    <PageLayout
      title="DOCUMENTS"
      icon={<FileSignature className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      headerTools={{
        search: (
          <HeaderSearch
            label="Search documents"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={setSearchQuery}
            width="wide"
          />
        ),
        filters: (
          <HeaderFilters
            label="Filter documents by status"
            activeCount={filterCount}
            compactChildren={statusSelect(true)}
            preferExpanded
          >
            {statusSelect()}
          </HeaderFilters>
        ),
        combinedQuery: (
          <HeaderCombinedQuery
            label="Search and filter documents"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={setSearchQuery}
            activeCount={queryCount}
          >
            {statusSelect(true)}
          </HeaderCombinedQuery>
        ),
        primaryAction: (
          <HeaderAction
            label="New document"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => navigate('/documents/new')}
          />
        ),
      }}
    >
          {!loadError && (
          <ResponsiveCardRail
            label="Document status summary"
            desktopColumns="md:grid-cols-4"
            className="responsive-stat-summary"
          >
            <StatCard
              title="Invalid"
              badgeText="Invalid"
              value={stats.invalid}
              icon={XCircle}
              description="Not completed"
              colorTheme="red"
              isLoading={loading}
            />
            <StatCard
              title="Drafts"
              badgeText="Drafts"
              value={stats.draft}
              icon={FileText}
              description="In preparation"
              colorTheme="blue"
              isLoading={loading}
            />
            <StatCard
              title="Active"
              badgeText="Active"
              value={stats.active}
              icon={Send}
              description="Sent or underway"
              colorTheme="orange"
              isLoading={loading}
            />
            <StatCard
              title="Completed"
              badgeText="Completed"
              value={stats.completed}
              icon={CheckCircle}
              description="All collected"
              colorTheme="green"
              isLoading={loading}
            />
          </ResponsiveCardRail>
          )}

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6">
                  <ListRowSkeleton count={5} />
                </div>
              ) : loadError ? (
                <ErrorState
                  title="Documents unavailable"
                  description={loadError}
                  onAction={() => void fetchDocuments()}
                  className="px-6"
                />
              ) : filteredDocuments.length === 0 ? (
                <EmptyState
                  icon={FileSignature}
                  kind={queryCount > 0 ? 'results' : 'collection'}
                  title={documents.length === 0 ? 'No documents yet' : 'No documents match your search'}
                  description={documents.length === 0
                    ? 'Create a document to start collecting signatures.'
                    : undefined}
                  actionLabel={queryCount > 0 ? 'Clear filters' : 'New document'}
                  onAction={queryCount > 0
                    ? () => { setSearchQuery(''); setStatusFilter('all'); }
                    : () => navigate('/documents/new')}
                  className="p-12"
                />
              ) : (
                <div className="divide-y">
                  {filteredDocuments.map((doc) => {
                    const isExpanded = expandedDocumentId === doc.id;
                    const statusVisual = getSignatureOperationalVisual(doc);
                    const StatusIcon = statusVisual.icon;
                    const hasProcessingFailure = doc.delivery_state === 'failed'
                      || doc.completion_state === 'dead_letter';
                    return (
                      <div key={doc.id}>
                        <div
                          className="p-4 hover:bg-muted/50 transition-colors cursor-pointer group"
                          onClick={(e) => handleToggleExpand(doc.id, e)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full md:h-10 md:w-10 ${statusVisual.iconBackgroundClass}`}>
                                <StatusIcon className={`h-5 w-5 ${statusVisual.iconClass}`} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium md:text-base">{doc.title}</p>
                                {doc.document_number && (
                                  <p className="truncate text-xs text-muted-foreground">{doc.document_number}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                aria-label={isExpanded ? `Collapse ${doc.title}` : `Expand ${doc.title}`}
                                aria-expanded={isExpanded}
                                onClick={(e) => handleToggleExpand(doc.id, e)}
                              >
                                <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" className="h-8 w-8 p-0" aria-label={`Actions for ${doc.title}`}>
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
                                  {hasProcessingFailure && (
                                    <DropdownMenuItem onClick={() => handleRetry(doc.id)}>
                                      <RefreshCw className="h-4 w-4 mr-2" />Retry failed step
                                    </DropdownMenuItem>
                                  )}
                                  {!hasProcessingFailure && (doc.status === 'sent' || doc.status === 'in_progress') && (
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
                                  {(doc.status === 'sent' || doc.status === 'in_progress') && (
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
                            <Badge className={`pointer-events-none cursor-default text-xs ${statusVisual.badgeClass}`}>
                              {statusVisual.label}
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
                            <span className="text-xs text-muted-foreground">Created {new Date(doc.created_at).toLocaleDateString()}</span>
                            {doc.sent_at && (
                              <span className="text-xs text-muted-foreground">Sent {new Date(doc.sent_at).toLocaleDateString()}</span>
                            )}
                            {doc.completed_at && (
                              <span className="text-xs text-green-600 dark:text-green-400">Completed {new Date(doc.completed_at).toLocaleDateString()}</span>
                            )}
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
                                  {expandedDocumentData.recipients.map((recipient) => {
                                    const visual = getRecipientStatusVisual(recipient);
                                    return (
                                      <Badge key={recipient.id} className={`gap-1.5 ${visual.badgeClass}`}>
                                        {recipient.name || recipient.email}
                                        <span aria-hidden="true">·</span>
                                        {visual.label}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {isExpanded && (
                          <div className="bg-muted/30 border-t px-6 py-6">
                            <ExpandedRowActions>
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
                                <ExpandedRowActionLabel full="View document" compact="View" />
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
                                  <ExpandedRowActionLabel full="Send document" compact="Send" />
                                </Button>
                              )}
                              {hasProcessingFailure && (
                                <Button
                                  size="sm"
                                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRetry(doc.id);
                                  }}
                                >
                                  <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                  <ExpandedRowActionLabel full="Retry failed step" compact="Retry" />
                                </Button>
                              )}
                              {!hasProcessingFailure && (doc.status === 'sent' || doc.status === 'in_progress') && (
                                <Button
                                  size="sm"
                                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleResend(doc.id);
                                  }}
                                >
                                  <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                  <ExpandedRowActionLabel full="Resend document" compact="Resend" />
                                </Button>
                              )}
                              {(doc.status === 'sent' || doc.status === 'in_progress') && (
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
                                  <ExpandedRowActionLabel full="Cancel document" compact="Cancel" />
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
                                  <ExpandedRowActionLabel full="Download document" compact="Download" />
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
                                  <ExpandedRowActionLabel full="Delete document" compact="Delete" />
                                </Button>
                              )}
                            </ExpandedRowActions>
                            {loadingPreview ? (
                              <div className="flex items-center justify-center py-8 text-muted-foreground">Loading preview...</div>
                            ) : previewError ? (
                              <ErrorState
                                kind="inline"
                                icon={FileSignature}
                                title="Unable to load document preview"
                                description="The document is still available to edit."
                                onRetry={() => void loadExpandedDocument(doc.id)}
                              />
                            ) : expandedDocumentData ? (
                              <div className="space-y-4">
                                {(expandedDocumentData.document.status === 'completed'
                                  ? expandedDocumentData.document.signed_file_url
                                  : expandedDocumentData.document.file_url) ? (
                                  <FieldPlacementCanvas
                                    fields={expandedDocumentData.document.status === 'completed'
                                      ? []
                                      : expandedDocumentData.fields}
                                    onChange={() => undefined}
                                    fileUrl={expandedDocumentData.document.status === 'completed'
                                      ? expandedDocumentData.document.signed_file_url!
                                      : expandedDocumentData.document.file_url!}
                                    roles={expandedDocumentData.recipients.map((recipient) => recipient.role_name || '').filter(Boolean)}
                                    documentId={expandedDocumentData.document.id}
                                    readOnly
                                  />
                                ) : (
                                  <div className="text-sm text-muted-foreground">
                                    Upload a PDF to preview field placement.
                                  </div>
                                )}

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
