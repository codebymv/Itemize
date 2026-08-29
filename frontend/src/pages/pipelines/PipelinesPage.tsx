import React, { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { CornerRightDown, Plus, Settings, MoreHorizontal, TrendingUp, Kanban, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { Pipeline, Deal } from '@/types';
import { getPipelines, getPipeline, moveDealToStage } from '@/services/pipelinesApi';
import { useOrganization } from '@/hooks/useOrganization';
import { KanbanBoard } from './components/KanbanBoard';
import { CreateDealModal } from './components/CreateDealModal';
import { CreatePipelineModal } from './components/CreatePipelineModal';
import { PageLayout } from '@/components/layout/PageLayout';
import {
  HeaderAction,
  HeaderActionLabel,
  HeaderCombinedQuery,
  HeaderFilters,
  HeaderSearch,
} from '@/components/layout/DesktopHeaderTools';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

const getApiStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;

type PipelineWithDeals = Pipeline & { deals: Deal[] };

export function PipelinesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Onboarding
  const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('pipelines');

  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);
  const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({
    onError: (error) => {
      return getApiStatus(error) === 500
        ? 'CRM database tables are not ready. Please restart your backend server to run migrations.'
        : 'Failed to initialize organization. Please check your connection.';
    }
  });
  const [showCreateDealModal, setShowCreateDealModal] = useState(false);
  const [showCreatePipelineModal, setShowCreatePipelineModal] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null);
  const [createPipelineAsStacked, setCreatePipelineAsStacked] = useState(false);
  const [dealPipelineId, setDealPipelineId] = useState<number | null>(null);
  const [initialStageId, setInitialStageId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [stackedPipelineIds, setStackedPipelineIds] = useState<number[]>([]);
  const [stackedPipelinesHydratedFor, setStackedPipelinesHydratedFor] = useState<number | null>(null);

  const pipelinesQueryKey = useMemo(
    () => ['pipelines', organizationId] as const,
    [organizationId],
  );
  const {
    data: pipelines = [],
    error: pipelinesError,
    isPending: isPipelinesPending,
    refetch: refetchPipelines,
  } = useQuery({
    queryKey: pipelinesQueryKey,
    queryFn: () => getPipelines(organizationId!),
    enabled: !!organizationId && !orgLoading,
  });

  const defaultPipelineId = pipelines.find((pipeline) => pipeline.is_default)?.id ?? pipelines[0]?.id ?? null;
  const activePipelineId = selectedPipelineId !== null
    && pipelines.some((pipeline) => pipeline.id === selectedPipelineId)
    ? selectedPipelineId
    : defaultPipelineId;
  const pipelineQueryKey = useMemo(
    () => ['pipeline', organizationId, activePipelineId] as const,
    [activePipelineId, organizationId],
  );
  const {
    data: currentPipeline = null,
    error: pipelineError,
    isPending: isPipelinePending,
  } = useQuery<PipelineWithDeals>({
    queryKey: pipelineQueryKey,
    queryFn: () => getPipeline(activePipelineId!, organizationId!),
    enabled: !!organizationId && activePipelineId !== null && !orgLoading,
  });

  const stackedPipelineQueries = useQueries({
    queries: stackedPipelineIds.map((pipelineId) => ({
      queryKey: ['pipeline', organizationId, pipelineId] as const,
      queryFn: () => getPipeline(pipelineId, organizationId!),
      enabled: !!organizationId && !orgLoading,
    })),
  });

  const stackedPipelines = stackedPipelineIds.flatMap((pipelineId, index) => {
    const pipeline = stackedPipelineQueries[index]?.data as PipelineWithDeals | undefined;
    return pipeline?.id === pipelineId ? [pipeline] : [];
  });

  const loading = orgLoading
    || (!!organizationId && isPipelinesPending)
    || (activePipelineId !== null && isPipelinePending);

  useEffect(() => {
    if (!organizationId) return;
    try {
      const saved = JSON.parse(
        localStorage.getItem(`itemize:pipelines:${organizationId}:stacked`) || '[]',
      );
      setStackedPipelineIds(
        Array.isArray(saved)
          ? saved.filter((pipelineId): pipelineId is number => Number.isInteger(pipelineId))
          : [],
      );
    } catch {
      setStackedPipelineIds([]);
    }
    setStackedPipelinesHydratedFor(organizationId);
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || stackedPipelinesHydratedFor !== organizationId) return;
    try {
      localStorage.setItem(
        `itemize:pipelines:${organizationId}:stacked`,
        JSON.stringify(stackedPipelineIds),
      );
    } catch {
      // The page still works when browser storage is unavailable.
    }
  }, [organizationId, stackedPipelineIds, stackedPipelinesHydratedFor]);

  useEffect(() => {
    if (isPipelinesPending) return;
    setStackedPipelineIds((currentIds) => currentIds.filter((pipelineId) => (
      pipelineId !== activePipelineId
      && pipelines.some((pipeline) => pipeline.id === pipelineId)
    )));
  }, [activePipelineId, isPipelinesPending, pipelines]);

  useEffect(() => {
    if (!pipelinesError) return;
    console.error('Error fetching pipelines:', pipelinesError);
    toast({
      title: 'Error',
      description: 'Failed to load pipelines',
      variant: 'destructive',
    });
  }, [pipelinesError, toast]);

  useEffect(() => {
    if (!pipelineError) return;
    console.error('Error fetching pipeline:', pipelineError);
    toast({
      title: 'Error',
      description: 'Failed to load pipeline',
      variant: 'destructive',
    });
  }, [pipelineError, toast]);

  // Handle deal stage change (drag and drop)
  const handleDealMove = async (pipelineId: number, dealId: number, newStageId: string) => {
    if (!organizationId) return;

    const targetPipelineQueryKey = ['pipeline', organizationId, pipelineId] as const;
    const previousPipeline = queryClient.getQueryData<PipelineWithDeals>(targetPipelineQueryKey);
    queryClient.setQueryData<PipelineWithDeals>(targetPipelineQueryKey, (pipeline) => {
      if (!pipeline) return pipeline;
      return {
        ...pipeline,
        deals: pipeline.deals.map((deal) => (
          deal.id === dealId ? { ...deal, stage_id: newStageId } : deal
        )),
      };
    });

    try {
      await moveDealToStage(dealId, newStageId, organizationId);
    } catch (error) {
      if (previousPipeline) {
        queryClient.setQueryData(targetPipelineQueryKey, previousPipeline);
      }
      console.error('Error moving deal:', error);
      toast({
        title: 'Error',
        description: 'Failed to move deal',
        variant: 'destructive',
      });
    }
  };

  // Handle deal created
  const handleDealCreated = (_deal: Deal) => {
    const createdInPipelineId = dealPipelineId;
    setShowCreateDealModal(false);
    setDealPipelineId(null);
    setInitialStageId(undefined);
    if (createdInPipelineId && organizationId) {
      void queryClient.invalidateQueries({
        queryKey: ['pipeline', organizationId, createdInPipelineId],
      });
    }
    toast({
      title: 'Created',
      description: 'Deal created successfully',
    });
  };

  // Handle pipeline created
  const handlePipelineCreated = (pipeline: Pipeline) => {
    setShowCreatePipelineModal(false);
    setEditingPipeline(null);
    queryClient.setQueryData<Pipeline[]>(pipelinesQueryKey, (currentPipelines = []) => [
      ...currentPipelines.filter((currentPipeline) => currentPipeline.id !== pipeline.id),
      pipeline,
    ]);
    if (createPipelineAsStacked && activePipelineId !== null) {
      setStackedPipelineIds((currentIds) => [...new Set([...currentIds, pipeline.id])]);
    } else {
      setSelectedPipelineId(pipeline.id);
    }
    setCreatePipelineAsStacked(false);
    void queryClient.invalidateQueries({ queryKey: pipelinesQueryKey });
    toast({
      title: 'Created',
      description: 'Pipeline created successfully',
    });
  };

  const handlePipelineUpdated = (pipeline: Pipeline) => {
    setShowCreatePipelineModal(false);
    setEditingPipeline(null);
    queryClient.setQueryData<Pipeline[]>(pipelinesQueryKey, (currentPipelines = []) => (
      currentPipelines.map((currentPipeline) => {
        if (currentPipeline.id === pipeline.id) return { ...currentPipeline, ...pipeline };
        return pipeline.is_default
          ? { ...currentPipeline, is_default: false }
          : currentPipeline;
      })
    ));
    if (organizationId) {
      queryClient.setQueryData<PipelineWithDeals>(
        ['pipeline', organizationId, pipeline.id],
        (currentPipeline) => currentPipeline
          ? { ...currentPipeline, ...pipeline, deals: currentPipeline.deals }
          : currentPipeline,
      );
      void queryClient.invalidateQueries({ queryKey: ['pipeline', organizationId, pipeline.id] });
    }
    void queryClient.invalidateQueries({ queryKey: pipelinesQueryKey });
    toast({
      title: 'Updated',
      description: 'Pipeline updated successfully',
    });
  };

  // Add deal to specific stage
  const openCreateDeal = (pipelineId: number, stageId?: string) => {
    setDealPipelineId(pipelineId);
    setInitialStageId(stageId);
    setShowCreateDealModal(true);
  };

  const refreshPipeline = (pipelineId: number) => {
    if (!organizationId) return;
    void queryClient.invalidateQueries({
      queryKey: ['pipeline', organizationId, pipelineId],
    });
  };

  const addStackedPipeline = (pipelineId: number) => {
    if (pipelineId === activePipelineId) return;
    setStackedPipelineIds((currentIds) => [...new Set([...currentIds, pipelineId])]);
  };

  const removeStackedPipeline = (pipelineId: number) => {
    setStackedPipelineIds((currentIds) => currentIds.filter((id) => id !== pipelineId));
  };

  const visiblePipelineIds = new Set([
    ...(activePipelineId === null ? [] : [activePipelineId]),
    ...stackedPipelineIds,
  ]);
  const availablePipelinesToStack = pipelines.filter(
    (pipeline) => !visiblePipelineIds.has(pipeline.id),
  );
  const activePipelineForEditing = currentPipeline
    ?? pipelines.find((pipeline) => pipeline.id === activePipelineId)
    ?? null;
  const dealPipeline = dealPipelineId === currentPipeline?.id
    ? currentPipeline
    : stackedPipelines.find((pipeline) => pipeline.id === dealPipelineId) ?? null;
  const hasPipelines = pipelines.length > 0;
  const pipelineOptions = () => pipelines.map((pipeline) => (
    <SelectItem
      key={pipeline.id}
      value={pipeline.id.toString()}
      textValue={pipeline.name}
    >
      <span className="flex items-center gap-2">
        <span>{pipeline.name}</span>
        {pipeline.is_default && (
          <Badge
            variant="secondary"
            className="h-5 shrink-0 px-1.5 text-[10px] font-light"
          >
            Default
          </Badge>
        )}
      </span>
    </SelectItem>
  ));
  const pipelineSelect = (compact = false) => (
    <Select
      value={activePipelineId?.toString() || ''}
      onValueChange={(value) => setSelectedPipelineId(parseInt(value))}
    >
      <SelectTrigger
        aria-label="Select primary pipeline"
        className={compact
          ? 'h-11 w-full'
          : 'pipeline-selector__trigger h-11 w-[11.25rem] bg-muted/20'}
      >
        <SelectValue placeholder="Select primary pipeline">
          {activePipelineForEditing && (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{activePipelineForEditing.name}</span>
              {!compact && activePipelineForEditing.is_default && (
                <Badge
                  variant="secondary"
                  className="pipeline-selector__selected-default h-5 shrink-0 px-1.5 text-[10px] font-light"
                >
                  Default
                </Badge>
              )}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>{pipelineOptions()}</SelectContent>
    </Select>
  );
  const pipelineActions = (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-11 min-w-11 gap-2 px-3 font-light"
              aria-label="Pipeline actions"
            >
              <MoreHorizontal className="h-4 w-4" />
              <HeaderActionLabel>More</HeaderActionLabel>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Pipeline actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => activePipelineId !== null && openCreateDeal(activePipelineId)}
          className="group/menu"
        >
          <Plus className="mr-2 h-4 w-4 transition-colors group-hover/menu:text-blue-600 dark:group-hover/menu:text-blue-400" />
          Add Deal
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!activePipelineForEditing}
          onClick={() => {
            if (!activePipelineForEditing) return;
            setEditingPipeline(activePipelineForEditing);
            setCreatePipelineAsStacked(false);
            setShowCreatePipelineModal(true);
          }}
        >
          <Settings className="mr-2 h-4 w-4" />
          Pipeline Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const newPipelineAction = (
    <HeaderAction
      label="New pipeline"
      icon={<Plus className="h-4 w-4" />}
      onClick={() => {
        setEditingPipeline(null);
        setCreatePipelineAsStacked(false);
        setShowCreatePipelineModal(true);
      }}
    />
  );
  const renderNewPipelineButton = () => (
    <Button
      size="sm"
      className="bg-blue-600 hover:bg-blue-700 text-white font-light whitespace-nowrap"
      onClick={() => {
        setEditingPipeline(null);
        setCreatePipelineAsStacked(false);
        setShowCreatePipelineModal(true);
      }}
    >
      <Plus className="h-4 w-4 mr-2" />
      New pipeline
    </Button>
  );

  const filterDeals = (deals: Deal[]) => {
    if (!searchQuery) return deals;
    const query = searchQuery.toLowerCase();
    return deals.filter((deal) => {
      const titleMatch = deal.title.toLowerCase().includes(query);
      const contactMatch = deal.contact
        ? `${deal.contact.first_name || ''} ${deal.contact.last_name || ''}`.toLowerCase().includes(query)
          || (deal.contact.email || '').toLowerCase().includes(query)
        : false;
      const tagMatch = deal.tags?.some((tag) => tag.toLowerCase().includes(query));
      return titleMatch || contactMatch || tagMatch;
    });
  };

  const renderPipelineBoard = (pipeline: PipelineWithDeals, stacked = false) => (
    <KanbanBoard
      key={pipeline.id}
      pipeline={pipeline}
      deals={filterDeals(pipeline.deals)}
      onDealMove={(dealId, stageId) => handleDealMove(pipeline.id, dealId, stageId)}
      onAddDeal={(stageId) => openCreateDeal(pipeline.id, stageId)}
      onRefresh={() => refreshPipeline(pipeline.id)}
      organizationId={organizationId!}
      onRemove={stacked ? () => removeStackedPipeline(pipeline.id) : undefined}
    />
  );

  // Show error state if initialization failed
  if (initError) {
    return (
      <PageLayout
        title="PIPELINES"
        icon={<Kanban className="h-5 w-5 text-blue-600 flex-shrink-0" />}
      >
        <ErrorState
          title="CRM Not Ready"
          description={initError}
          icon={TrendingUp}
          onAction={() => void refetchPipelines()}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="PIPELINES"
      icon={<Kanban className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
      mobileClassName="flex-col items-stretch"
      contentClassName="p-0 sm:p-0"
      desktopTools={hasPipelines ? {
        search: (
          <HeaderSearch
            label="Search deals"
            placeholder="Search deals..."
            value={searchQuery}
            onChange={setSearchQuery}
          />
        ),
        filters: (
          <HeaderFilters
            label="Select primary pipeline"
            compactChildren={pipelineSelect(true)}
            preferExpanded="when-roomy"
          >
            {pipelineSelect()}
          </HeaderFilters>
        ),
        combinedQuery: (
          <HeaderCombinedQuery
            label="Search deals and select primary pipeline"
            placeholder="Search deals..."
            value={searchQuery}
            onChange={setSearchQuery}
            activeCount={Number(searchQuery.trim().length > 0)}
          >
            {pipelineSelect(true)}
          </HeaderCombinedQuery>
        ),
        secondaryAction: pipelineActions,
        primaryAction: newPipelineAction,
      } : {
        primaryAction: newPipelineAction,
      }}
      mobileActions={
        hasPipelines ? (
          <>
            <div className="flex items-center gap-2 w-full">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search deals..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-9 w-full bg-muted/20 border-border/50"
                />
              </div>
              <Button
                size="icon"
                className="bg-blue-600 hover:bg-blue-700 text-white h-9 w-9"
                onClick={() => activePipelineId !== null && openCreateDeal(activePipelineId)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 w-full">
              <Select
                value={activePipelineId?.toString() || ''}
                onValueChange={(v) => setSelectedPipelineId(parseInt(v))}
              >
                <SelectTrigger className="flex-1 h-9" aria-label="Select primary pipeline">
                  <SelectValue placeholder="Select primary pipeline" />
                </SelectTrigger>
                <SelectContent>{pipelineOptions()}</SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    setEditingPipeline(null);
                    setCreatePipelineAsStacked(false);
                    setShowCreatePipelineModal(true);
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Pipeline
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!activePipelineForEditing}
                    onClick={() => {
                      if (!activePipelineForEditing) return;
                      setEditingPipeline(activePipelineForEditing);
                      setCreatePipelineAsStacked(false);
                      setShowCreatePipelineModal(true);
                    }}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Pipeline Settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        ) : (
          renderNewPipelineButton()
        )
      }
    >
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={closeOnboarding}
        onComplete={completeOnboarding}
        onDismiss={dismissOnboarding}
        content={ONBOARDING_CONTENT.pipelines}
      />

      <div className="flex min-h-0 flex-col">
        {loading ? (
          <div aria-label="Loading pipeline board" aria-busy="true">
            <div className="flex flex-col gap-3 border-b px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-9 w-16" />
              </div>
            </div>
            <div className="flex min-h-96 gap-4 overflow-x-auto p-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="w-80 flex-shrink-0 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between border-b p-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                  <div className="space-y-2 p-2">
                    {(i === 1 || i === 2) ? (
                      <Skeleton className="h-28 w-full rounded-lg" />
                    ) : (
                      <Skeleton className="h-9 w-full" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : pipelines.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No pipelines yet"
            description="Create a pipeline to track deals."
            actionLabel="New pipeline"
            onAction={() => {
              setEditingPipeline(null);
              setCreatePipelineAsStacked(false);
              setShowCreatePipelineModal(true);
            }}
          />
        ) : currentPipeline ? (
          <>
            {renderPipelineBoard(currentPipeline)}

            {stackedPipelineIds.map((pipelineId, index) => {
              const query = stackedPipelineQueries[index];
              const pipeline = stackedPipelines.find((item) => item.id === pipelineId);
              if (pipeline) return renderPipelineBoard(pipeline, true);
              if (query?.isError) {
                return (
                  <div key={pipelineId} className="flex items-center justify-between gap-4 border-b px-6 py-5">
                    <p className="text-sm text-muted-foreground">This pipeline could not be loaded.</p>
                    <Button variant="ghost" size="sm" onClick={() => removeStackedPipeline(pipelineId)}>
                      Remove
                    </Button>
                  </div>
                );
              }
              return (
                <div key={pipelineId} className="space-y-3 border-b p-6">
                  <Skeleton className="h-9 w-56" />
                  <Skeleton className="h-80 w-full" />
                </div>
              );
            })}

            <div className="flex justify-center p-4 sm:p-6">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    className="h-11 font-light"
                    aria-label="Show another pipeline"
                  >
                    <CornerRightDown className="mr-2 h-4 w-4" />
                    Show another pipeline
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-56">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Show Existing Pipeline
                  </DropdownMenuLabel>
                  {availablePipelinesToStack.length > 0 ? (
                    availablePipelinesToStack.map((pipeline) => (
                      <DropdownMenuItem
                        key={pipeline.id}
                        onClick={() => addStackedPipeline(pipeline.id)}
                      >
                        <Kanban className="mr-2 h-4 w-4" />
                        {pipeline.name}
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem disabled>
                      All pipelines are already shown
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setEditingPipeline(null);
                      setCreatePipelineAsStacked(true);
                      setShowCreatePipelineModal(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create and Show New Pipeline
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        ) : null}

      {/* Create Deal Modal */}
      {showCreateDealModal && organizationId && dealPipelineId && dealPipeline && (
        <CreateDealModal
          pipelineId={dealPipelineId}
          stages={dealPipeline.stages || []}
          initialStageId={initialStageId}
          organizationId={organizationId}
          onClose={() => {
            setShowCreateDealModal(false);
            setDealPipelineId(null);
            setInitialStageId(undefined);
          }}
          onCreated={handleDealCreated}
        />
      )}

      {/* Create Pipeline Modal */}
      {showCreatePipelineModal && organizationId && (
        <CreatePipelineModal
          organizationId={organizationId}
          pipeline={editingPipeline ?? undefined}
          onClose={() => {
            setShowCreatePipelineModal(false);
            setCreatePipelineAsStacked(false);
            setEditingPipeline(null);
          }}
          onCreated={handlePipelineCreated}
          onUpdated={handlePipelineUpdated}
        />
      )}
      </div>
    </PageLayout>
  );
}

export default PipelinesPage;
