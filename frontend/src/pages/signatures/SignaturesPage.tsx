import React, { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Send, XCircle, Download, Eye, FileSignature, FileText, CheckCircle, ChevronDown, MoreVertical, Trash2, RefreshCw, PieChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageLayout } from '@/components/layout/PageLayout';
import { HeaderAction, HeaderCombinedQuery, HeaderFilters, HeaderSearch } from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/StatCard';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { FramedSection } from '@/components/ui/framed-section';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { ExpandedRowActionLabel, ExpandedRowActions } from '@/components/ui/expanded-row';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';
import { ListRowSkeleton } from '@/components/ui/loading-skeletons';
import FieldPlacementCanvas from './components/FieldPlacementCanvas';
import { getRecipientStatusVisual, getSignatureOperationalVisual } from './constants/signatureConstants';
import { type DocumentStatusFilter } from './signatureCatalog';
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
import { signatureQueryKeys } from '@/services/signatureQueryKeys';
import { useKeyedSingleFlightAction } from '@/hooks/useSingleFlightAction';
import { useKeyedStableMutationKey } from '@/hooks/useStableMutationKey';

const PAGE_SIZE = 20;

const statusesForFilter: Record<DocumentStatusFilter, SignatureDocument['status'][] | undefined> = {
  all: undefined,
  active: ['sent', 'in_progress'],
  draft: ['draft'],
  completed: ['completed'],
  invalid: ['cancelled', 'expired'],
};

export function SignaturesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organizationId, isLoading: organizationLoading, error: organizationError } = useOrganization();
  const [expandedDocumentId, setExpandedDocumentId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [deleteDocumentId, setDeleteDocumentId] = useState<number | null>(null);
  const { isPending: isDocumentPending, run: runDocumentAction } = useKeyedSingleFlightAction<number>();
  const deliveryAttempts = useKeyedStableMutationKey<string>('signature-delivery');

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
    setExpandedDocumentId(null);
  }, [debouncedSearch, statusFilter]);

  const queueQueryKey = signatureQueryKeys.documentQueue(organizationId, {
    search: debouncedSearch,
    status: statusFilter,
    page,
    limit: PAGE_SIZE,
  });
  const queueQuery = useQuery({
    queryKey: queueQueryKey,
    queryFn: ({ signal }) => listSignatureDocuments({
      statuses: statusesForFilter[statusFilter],
      search: debouncedSearch || undefined,
      page,
      limit: PAGE_SIZE,
    }, organizationId as number, signal),
    enabled: organizationId !== null,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
    placeholderData: keepPreviousData,
  });
  const documents = useMemo(() => queueQuery.data?.items ?? [], [queueQuery.data?.items]);
  const pagination = queueQuery.data?.pagination ?? { page, limit: PAGE_SIZE, total: 0, totalPages: 0 };
  const stats = queueQuery.data?.stats ?? { total: 0, invalid: 0, draft: 0, active: 0, completed: 0 };
  const loading = organizationLoading || (organizationId !== null && queueQuery.isPending);
  const loadError = queueQuery.error && !queueQuery.data
    ? 'Documents could not be loaded. Please try again.'
    : null;
  const expandedQuery = useQuery({
    queryKey: signatureQueryKeys.document(organizationId, expandedDocumentId),
    queryFn: ({ signal }) => getSignatureDocument(
      expandedDocumentId as number,
      organizationId as number,
      signal,
    ),
    enabled: expandedDocumentId !== null && organizationId !== null,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });
  const expandedDocumentData = expandedQuery.data ?? null;
  const loadingPreview = expandedQuery.isPending && expandedQuery.fetchStatus !== 'idle';
  const previewError = expandedQuery.isError && !expandedQuery.data;

  useEffect(() => {
    if (!queueQuery.data) return;
    const lastAvailablePage = Math.max(1, queueQuery.data.pagination.totalPages);
    if (page > lastAvailablePage) setPage(lastAvailablePage);
  }, [page, queueQuery.data]);

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

  const refreshQueue = async (updated?: SignatureDocument) => {
    if (!organizationId) return;
    if (updated) {
      queryClient.setQueryData<SignatureDocumentDetails>(
        signatureQueryKeys.document(organizationId, updated.id),
        current => current ? { ...current, document: updated } : current,
      );
    }
    await queryClient.invalidateQueries({ queryKey: signatureQueryKeys.documents(organizationId) });
  };

  const handleSend = async (id: number) => {
    if (!organizationId) return;
    await runDocumentAction(id, async () => {
      const attempt = `send:${id}`;
      const idempotencyKey = deliveryAttempts.begin(attempt, `${organizationId}:${attempt}`);
      if (!idempotencyKey) return;
      try {
        const updated = await sendSignatureDocument(id, idempotencyKey, organizationId);
        deliveryAttempts.reset(attempt);
        toast({ title: 'Signature request queued' });
        void refreshQueue(updated);
      } catch (error) {
        deliveryAttempts.release(attempt);
        toast({ title: 'Error', description: 'Failed to send signature request', variant: 'destructive' });
      }
    });
  };

  const handleResend = async (id: number) => {
    if (!organizationId) return;
    await runDocumentAction(id, async () => {
      const attempt = `remind:${id}`;
      const idempotencyKey = deliveryAttempts.begin(attempt, `${organizationId}:${attempt}`);
      if (!idempotencyKey) return;
      try {
        const updated = await remindSignatureDocument(id, idempotencyKey, organizationId);
        deliveryAttempts.reset(attempt);
        toast({ title: 'Signature reminder queued' });
        void refreshQueue(updated);
      } catch (error) {
        deliveryAttempts.release(attempt);
        toast({ title: 'Error', description: 'Failed to resend signature request', variant: 'destructive' });
      }
    });
  };

  const handleRetry = async (id: number) => {
    if (!organizationId) return;
    await runDocumentAction(id, async () => {
      const attempt = `retry:${id}`;
      const idempotencyKey = deliveryAttempts.begin(attempt, `${organizationId}:${attempt}`);
      if (!idempotencyKey) return;
      try {
        const updated = await retrySignatureDocument(id, idempotencyKey, organizationId);
        deliveryAttempts.reset(attempt);
        toast({ title: 'Failed processing queued for retry' });
        void refreshQueue(updated);
      } catch (error) {
        deliveryAttempts.release(attempt);
        toast({ title: 'Retry unavailable', description: 'The failed step could not be retried.', variant: 'destructive' });
      }
    });
  };

  const handleCancel = async (id: number) => {
    if (!organizationId) return;
    await runDocumentAction(id, async () => {
      try {
        const updated = await cancelSignatureDocument(id, organizationId);
        toast({ title: 'Signature request cancelled' });
        await refreshQueue(updated);
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to cancel request', variant: 'destructive' });
      }
    });
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
    if (!deleteDocumentId || !organizationId) return false;
    const documentId = deleteDocumentId;
    const result = await runDocumentAction(documentId, async () => {
      try {
        await deleteSignatureDocument(documentId, organizationId);
        queryClient.removeQueries({
          queryKey: signatureQueryKeys.document(organizationId, documentId),
        });
        await queryClient.invalidateQueries({ queryKey: signatureQueryKeys.documents(organizationId) });
        setDeleteDocumentId(null);
        return true;
      } catch (error) {
        return false;
      }
    });
    return result === true;
  };

  const handleToggleExpand = (documentId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (expandedDocumentId === documentId) {
      setExpandedDocumentId(null);
      return;
    }
    setExpandedDocumentId(documentId);
  };

  if (organizationError) {
    return (
      <PageLayout
        title="DOCUMENTS"
        icon={<FileSignature className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      >
        <OrganizationErrorState title="Unable to load documents" icon={FileSignature} />
      </PageLayout>
    );
  }

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
          <FramedSection title="Overview" icon={PieChart} className="mb-6">
          <ResponsiveCardRail
            label="Document status summary"
            desktopColumns="md:grid-cols-4"
            className="responsive-stat-summary mb-0"
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
          </FramedSection>
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
                  onAction={() => void queueQuery.refetch()}
                  className="px-6"
                />
              ) : documents.length === 0 ? (
                <EmptyState
                  icon={FileSignature}
                  kind={queryCount > 0 ? 'results' : 'collection'}
                  title={stats.total === 0 ? 'No documents yet' : 'No documents match your search'}
                  description={stats.total === 0
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
                  {documents.map((doc) => {
                    const isExpanded = expandedDocumentId === doc.id;
                    const statusVisual = getSignatureOperationalVisual(doc);
                    const StatusIcon = statusVisual.icon;
                    const hasProcessingFailure = doc.delivery_state === 'failed'
                      || doc.completion_state === 'dead_letter';
                    const working = isDocumentPending(doc.id);
                    return (
                      <div key={doc.id} aria-busy={working ? 'true' : undefined}>
                        <div
                          className="p-4 interaction-row cursor-pointer group"
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
                                  <Button variant="ghost" className="h-8 w-8 p-0" disabled={working} aria-label={`Actions for ${doc.title}`}>
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
                                  disabled={working}
                                  className="bg-blue-600 interaction-button--primary text-white text-xs sm:text-sm"
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
                                  disabled={working}
                                  className="bg-blue-600 interaction-button--primary text-white text-xs sm:text-sm"
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
                                  disabled={working}
                                  className="bg-blue-600 interaction-button--primary text-white text-xs sm:text-sm"
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
                                  disabled={working}
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
                                  className="bg-blue-600 interaction-button--primary text-white text-xs sm:text-sm"
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
                                  disabled={working}
                                  className="text-destructive border-destructive/30 interaction-button--destructive-ghost focus:text-destructive text-xs sm:text-sm"
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
                                onRetry={() => void expandedQuery.refetch()}
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

          {pagination.totalPages > 1 && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} documents
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(current => Math.max(1, current - 1))}
                  disabled={queueQuery.isFetching || pagination.page <= 1}
                >
                  Previous
                </Button>
                <span className="min-w-20 text-center text-sm text-muted-foreground">
                  {pagination.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(current => Math.min(pagination.totalPages, current + 1))}
                  disabled={queueQuery.isFetching || pagination.page >= pagination.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

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
