import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Send, FileSignature, CheckCircle, AlertCircle, ChevronDown, MoreVertical, Trash2, PieChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageLayout } from '@/components/layout/PageLayout';
import { HeaderAction, HeaderCombinedQuery, HeaderFilters, HeaderSearch } from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrganizationErrorState } from '@/components/OrganizationErrorState';
import { StatCard } from '@/components/StatCard';
import { ResponsiveCardRail } from '@/components/layout/ResponsiveCardRail';
import { FramedSection } from '@/components/ui/framed-section';
import { ListRowSkeleton } from '@/components/ui/loading-skeletons';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { ExpandedRowActionLabel, ExpandedRowActions } from '@/components/ui/expanded-row';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';
import FieldPlacementCanvas from './components/FieldPlacementCanvas';
import {
  SignatureTemplate,
  listSignatureTemplates,
  getSignatureTemplate,
  createSignatureTemplate,
  instantiateSignatureTemplate,
  deleteSignatureTemplate,
} from '@/services/signaturesApi';
import { signatureQueryKeys } from '@/services/signatureQueryKeys';
import { getTemplateReadinessVisual } from './constants/signatureConstants';
import { filterTemplates, getTemplateStats, type TemplateReadinessFilter } from './signatureCatalog';

export default function SignatureTemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organizationId, isLoading: organizationLoading, error: organizationError } = useOrganization();
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [readinessFilter, setReadinessFilter] = useState<TemplateReadinessFilter>('all');
  const [expandedTemplateId, setExpandedTemplateId] = useState<number | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<number | null>(null);

  const catalogQueryKey = signatureQueryKeys.templates(organizationId);
  const catalogQuery = useQuery({
    queryKey: catalogQueryKey,
    queryFn: ({ signal }) => listSignatureTemplates(organizationId as number, signal),
    enabled: organizationId !== null,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });
  const templates = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const loading = organizationLoading || (organizationId !== null && catalogQuery.isPending);
  const loadError = catalogQuery.error && !catalogQuery.data
    ? 'Templates could not be loaded. Please try again.'
    : null;
  const expandedQuery = useQuery({
    queryKey: signatureQueryKeys.template(organizationId, expandedTemplateId),
    queryFn: ({ signal }) => getSignatureTemplate(
      expandedTemplateId as number,
      organizationId as number,
      signal,
    ),
    enabled: expandedTemplateId !== null && organizationId !== null,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });
  const expandedTemplateData = expandedQuery.data ?? null;
  const loadingPreview = expandedQuery.isPending && expandedQuery.fetchStatus !== 'idle';
  const previewError = expandedQuery.isError && !expandedQuery.data;

  const handleCreate = async () => {
    if (!organizationId) return;
    try {
      setCreating(true);
      const created = await createSignatureTemplate({ title: 'New Template' }, organizationId);
      queryClient.setQueryData<SignatureTemplate[]>(catalogQueryKey, current =>
        current ? [created, ...current.filter(template => template.id !== created.id)] : current,
      );
      navigate(`/templates/${created.id}`);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to create template', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleUseTemplate = async (templateId: number) => {
    if (!organizationId) return;
    try {
      const document = await instantiateSignatureTemplate(templateId, {}, organizationId);
      navigate(`/documents/${document.id}`);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to create document from template', variant: 'destructive' });
    }
  };

  const handleToggleExpand = (templateId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (expandedTemplateId === templateId) {
      setExpandedTemplateId(null);
      return;
    }
    setExpandedTemplateId(templateId);
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!deleteTemplateId || !organizationId) return false;
    try {
      await deleteSignatureTemplate(deleteTemplateId, organizationId);
      queryClient.setQueryData<SignatureTemplate[]>(catalogQueryKey, current =>
        current?.filter(template => template.id !== deleteTemplateId),
      );
      queryClient.removeQueries({
        queryKey: signatureQueryKeys.template(organizationId, deleteTemplateId),
      });
      setDeleteTemplateId(null);
      return true;
    } catch (error) {
      return false;
    }
  };

  const stats = useMemo(() => getTemplateStats(templates), [templates]);
  const filteredTemplates = useMemo(
    () => filterTemplates(templates, { search: searchQuery, readiness: readinessFilter }),
    [readinessFilter, searchQuery, templates],
  );
  const readinessSelect = (compact = false) => (
    <Select value={readinessFilter} onValueChange={(value) => setReadinessFilter(value as TemplateReadinessFilter)}>
      <SelectTrigger className={compact ? 'h-11 w-full' : 'h-11 w-[10rem] bg-muted/20'}>
        <SelectValue placeholder="Readiness" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All templates</SelectItem>
        <SelectItem value="ready">Ready to use</SelectItem>
        <SelectItem value="needs_file">Setup needed</SelectItem>
      </SelectContent>
    </Select>
  );
  const filterCount = Number(readinessFilter !== 'all');
  const queryCount = filterCount + Number(searchQuery.trim().length > 0);

  if (organizationError) {
    return (
      <PageLayout
        title="TEMPLATES"
        icon={<FileSignature className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      >
        <OrganizationErrorState title="Unable to load templates" icon={FileSignature} />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="TEMPLATES"
      icon={<FileSignature className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      headerTools={{
        search: (
          <HeaderSearch
            label="Search templates"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={setSearchQuery}
            width="wide"
          />
        ),
        filters: (
          <HeaderFilters
            label="Filter templates by readiness"
            activeCount={filterCount}
            compactChildren={readinessSelect(true)}
            preferExpanded
          >
            {readinessSelect()}
          </HeaderFilters>
        ),
        combinedQuery: (
          <HeaderCombinedQuery
            label="Search and filter templates"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={setSearchQuery}
            activeCount={queryCount}
          >
            {readinessSelect(true)}
          </HeaderCombinedQuery>
        ),
        primaryAction: (
          <HeaderAction
            label="New template"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => void handleCreate()}
            disabled={creating}
          />
        ),
      }}
    >
          {!loadError && (
            <FramedSection title="Overview" icon={PieChart} className="mb-6">
            <ResponsiveCardRail
              label="Template readiness summary"
              desktopColumns="md:grid-cols-3"
              className="responsive-stat-summary mb-0"
            >
              <StatCard
                title="Templates"
                badgeText="Total"
                value={stats.total}
                icon={FileSignature}
                description="Reusable document setups"
                colorTheme="blue"
                isLoading={loading}
              />
              <StatCard
                title="Ready to use"
                badgeText="Ready"
                value={stats.ready}
                icon={CheckCircle}
                description="Ready to send"
                colorTheme="green"
                isLoading={loading}
              />
              <StatCard
                title="Setup needed"
                badgeText="Setup"
                value={stats.needsFile}
                icon={AlertCircle}
                description="PDF, roles, or fields needed"
                colorTheme="orange"
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
                  title="Templates unavailable"
                  description={loadError}
                  onAction={() => void catalogQuery.refetch()}
                  className="px-6"
                />
              ) : filteredTemplates.length === 0 ? (
                <EmptyState
                  icon={FileSignature}
                  kind={queryCount > 0 ? 'results' : 'collection'}
                  title={templates.length === 0 ? 'No templates yet' : 'No templates match your search'}
                  description={templates.length === 0
                    ? 'Create a reusable template for signature requests.'
                    : undefined}
                  actionLabel={queryCount > 0 ? 'Clear filters' : 'New template'}
                  onAction={queryCount > 0
                    ? () => { setSearchQuery(''); setReadinessFilter('all'); }
                    : () => void handleCreate()}
                  className="p-12"
                />
              ) : (
                <div className="divide-y">
                  {filteredTemplates.map((template) => {
                    const isExpanded = expandedTemplateId === template.id;
                    const readinessVisual = getTemplateReadinessVisual(template.is_ready);
                    const ReadinessIcon = readinessVisual.icon;
                    return (
                      <div key={template.id}>
                        <div
                          className="p-4 interaction-row cursor-pointer group"
                          onClick={(e) => void handleToggleExpand(template.id, e)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full md:h-10 md:w-10 ${readinessVisual.iconBackgroundClass}`}>
                                <ReadinessIcon className={`h-5 w-5 ${readinessVisual.iconClass}`} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium md:text-base">{template.title}</p>
                                <p className={`truncate text-xs ${readinessVisual.iconClass}`}>{readinessVisual.label}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                aria-label={isExpanded ? `Collapse ${template.title}` : `Expand ${template.title}`}
                                aria-expanded={isExpanded}
                                onClick={(e) => void handleToggleExpand(template.id, e)}
                              >
                                <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" className="h-8 w-8 p-0" aria-label={`Actions for ${template.title}`}>
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenuItem onClick={() => navigate(`/templates/${template.id}`)}>
                                    <Eye className="h-4 w-4 mr-2" />View
                                  </DropdownMenuItem>
                                  {template.is_ready ? (
                                    <DropdownMenuItem onClick={() => handleUseTemplate(template.id)}>
                                      <Send className="h-4 w-4 mr-2" />Use
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onClick={() => navigate(`/templates/${template.id}`)}>
                                      <AlertCircle className="h-4 w-4 mr-2" />Finish setup
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setDeleteTemplateId(template.id)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          <div className="mt-2 px-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            {template.file_name && (
                              <span className="max-w-48 truncate text-xs text-muted-foreground">{template.file_name}</span>
                            )}
                            <span className="text-xs text-muted-foreground">Created {new Date(template.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="bg-muted/30 border-t px-6 py-6">
                            <ExpandedRowActions>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/templates/${template.id}`);
                                }}
                                className="text-xs sm:text-sm"
                              >
                                <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                <ExpandedRowActionLabel full="View template" compact="View" />
                              </Button>
                              <Button
                                size="sm"
                                className="bg-blue-600 interaction-button--primary text-white text-xs sm:text-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (template.is_ready) handleUseTemplate(template.id);
                                  else navigate(`/templates/${template.id}`);
                                }}
                              >
                                {template.is_ready ? (
                                  <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                ) : (
                                  <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                )}
                                <ExpandedRowActionLabel
                                  full={template.is_ready ? 'Use Template' : 'Finish Setup'}
                                  compact={template.is_ready ? 'Use' : 'Finish'}
                                />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive border-destructive/30 interaction-button--destructive-ghost focus:text-destructive text-xs sm:text-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTemplateId(template.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                <ExpandedRowActionLabel full="Delete template" compact="Delete" />
                              </Button>
                            </ExpandedRowActions>
                            {loadingPreview ? (
                              <div className="flex items-center justify-center py-8 text-muted-foreground">
                                Loading preview...
                              </div>
                            ) : previewError ? (
                              <ErrorState
                                kind="inline"
                                icon={FileSignature}
                                title="Unable to load template preview"
                                description="The template is still available to edit."
                                onRetry={() => void expandedQuery.refetch()}
                              />
                            ) : expandedTemplateData?.template.id === template.id ? (
                              <div className="space-y-4">
                                {(expandedTemplateData.template.description || expandedTemplateData.template.message) && (
                                  <div className="space-y-2 text-sm text-muted-foreground">
                                    {expandedTemplateData.template.description && (
                                      <p>{expandedTemplateData.template.description}</p>
                                    )}
                                    {expandedTemplateData.template.message && (
                                      <p className="whitespace-pre-wrap">{expandedTemplateData.template.message}</p>
                                    )}
                                  </div>
                                )}

                                {expandedTemplateData.template.file_url ? (
                                  <FieldPlacementCanvas
                                    fields={expandedTemplateData.fields}
                                    onChange={() => undefined}
                                    fileUrl={expandedTemplateData.template.file_url}
                                    roles={expandedTemplateData.roles.map((role) => role.role_name)}
                                    readOnly
                                  />
                                ) : (
                                  <div className="text-sm text-muted-foreground">
                                    Upload a PDF to preview field placement.
                                  </div>
                                )}

                              </div>
                            ) : null}
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
        open={deleteTemplateId !== null}
        onOpenChange={(open) => !open && setDeleteTemplateId(null)}
        onConfirm={handleDelete}
        itemType="template"
        itemTitle={templates.find(t => t.id === deleteTemplateId)?.title}
      />
    </PageLayout>
  );
}
