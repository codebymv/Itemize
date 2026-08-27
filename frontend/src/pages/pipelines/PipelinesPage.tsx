import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Settings, MoreHorizontal, DollarSign, TrendingUp, Kanban, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useOnboardingTrigger } from '@/hooks/useOnboardingTrigger';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';
import { Pipeline, Deal, PipelineStage } from '@/types';
import { getPipelines, getPipeline, createPipeline, moveDealToStage } from '@/services/pipelinesApi';
import { useOrganization } from '@/hooks/useOrganization';
import { KanbanBoard } from './components/KanbanBoard';
import { CreateDealModal } from './components/CreateDealModal';
import { CreatePipelineModal } from './components/CreatePipelineModal';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

const getApiStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;

export function PipelinesPage() {
  const { toast } = useToast();
  // Onboarding
  const { showModal: showOnboarding, handleComplete: completeOnboarding, handleDismiss: dismissOnboarding, handleClose: closeOnboarding } = useOnboardingTrigger('pipelines');

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);
  const [currentPipeline, setCurrentPipeline] = useState<(Pipeline & { deals: Deal[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const { organizationId, error: initError, isLoading: orgLoading } = useOrganization({
    onError: (error) => {
      return getApiStatus(error) === 500
        ? 'CRM database tables are not ready. Please restart your backend server to run migrations.'
        : 'Failed to initialize organization. Please check your connection.';
    }
  });
  const [showCreateDealModal, setShowCreateDealModal] = useState(false);
  const [showCreatePipelineModal, setShowCreatePipelineModal] = useState(false);
  const [initialStageId, setInitialStageId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (orgLoading) {
      setLoading(true);
      return;
    }

    if (!organizationId) {
      setLoading(false);
    }
  }, [organizationId, initError, orgLoading]);

  // Fetch pipelines
  const fetchPipelines = useCallback(async () => {
    if (!organizationId) {
      if (!orgLoading) {
        setPipelines([]);
        setSelectedPipelineId(null);
        setCurrentPipeline(null);
        setLoading(false);
      }
      return;
    }

    try {
      const data = await getPipelines(organizationId);
      setPipelines(data);

      // Select default pipeline or first one
      if (data.length > 0) {
        const defaultPipeline = data.find(p => p.is_default) || data[0];
        setSelectedPipelineId(defaultPipeline.id);
      } else {
        // No pipelines - stop loading so empty state shows
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching pipelines:', error);
      setLoading(false);
      toast({
        title: 'Error',
        description: 'Failed to load pipelines',
        variant: 'destructive',
      });
    }
  }, [organizationId, orgLoading, toast]);

  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);

  // Fetch selected pipeline with deals
  const fetchPipeline = useCallback(async () => {
    if (!selectedPipelineId || !organizationId) return;

    setLoading(true);
    try {
      const data = await getPipeline(selectedPipelineId, organizationId);
      setCurrentPipeline(data);
    } catch (error) {
      console.error('Error fetching pipeline:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pipeline',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedPipelineId, organizationId]);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  // Handle deal stage change (drag and drop)
  const handleDealMove = async (dealId: number, newStageId: string) => {
    if (!organizationId) return;

    try {
      await moveDealToStage(dealId, newStageId, organizationId);
      // Update local state
      setCurrentPipeline(prev => {
        if (!prev) return null;
        return {
          ...prev,
          deals: prev.deals.map(d =>
            d.id === dealId ? { ...d, stage_id: newStageId } : d
          )
        };
      });
    } catch (error) {
      console.error('Error moving deal:', error);
      toast({
        title: 'Error',
        description: 'Failed to move deal',
        variant: 'destructive',
      });
    }
  };

  // Handle deal created
  const handleDealCreated = (deal: Deal) => {
    setShowCreateDealModal(false);
    setInitialStageId(undefined);
    // Refresh pipeline
    fetchPipeline();
    toast({
      title: 'Created',
      description: 'Deal created successfully',
    });
  };

  // Handle pipeline created
  const handlePipelineCreated = (pipeline: Pipeline) => {
    setShowCreatePipelineModal(false);
    fetchPipelines();
    setSelectedPipelineId(pipeline.id);
    toast({
      title: 'Created',
      description: 'Pipeline created successfully',
    });
  };

  // Add deal to specific stage
  const handleAddDealToStage = (stageId: string) => {
    setInitialStageId(stageId);
    setShowCreateDealModal(true);
  };

  // Calculate pipeline stats
  const getPipelineStats = () => {
    if (!currentPipeline) return { totalValue: 0, dealCount: 0, openDeals: 0 };

    const openDeals = currentPipeline.deals.filter(d => !d.won_at && !d.lost_at);
    const totalValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);

    return {
      totalValue,
      dealCount: currentPipeline.deals.length,
      openDeals: openDeals.length
    };
  };

  const stats = getPipelineStats();
  const hasPipelines = pipelines.length > 0;
  const renderNewPipelineButton = () => (
    <Button
      size="sm"
      className="bg-blue-600 hover:bg-blue-700 text-white font-light whitespace-nowrap"
      onClick={() => setShowCreatePipelineModal(true)}
    >
      <Plus className="h-4 w-4 mr-2" />
      New Pipeline
    </Button>
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
          onAction={() => void fetchPipeline()}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="PIPELINES"
      icon={<Kanban className="h-5 w-5 text-blue-600 flex-shrink-0" />}
      mobileClassName="flex-col items-stretch gap-2"
      pageActions={
        hasPipelines ? (
          <>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search deals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 bg-muted/20 border-border/50 focus:bg-background transition-colors"
              />
            </div>
            <Select
              value={selectedPipelineId?.toString() || ''}
              onValueChange={(v) => setSelectedPipelineId(parseInt(v))}
            >
              <SelectTrigger className="w-[180px] h-9 bg-muted/20 border-border/50">
                <SelectValue placeholder="Select pipeline" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((pipeline) => (
                  <SelectItem key={pipeline.id} value={pipeline.id.toString()}>
                    {pipeline.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowCreatePipelineModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Pipeline
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Settings className="h-4 w-4 mr-2" />
                  Pipeline Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white font-light whitespace-nowrap"
              onClick={() => setShowCreateDealModal(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Deal
            </Button>
          </>
        ) : (
          renderNewPipelineButton()
        )
      }
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
                onClick={() => setShowCreateDealModal(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 w-full">
              <Select
                value={selectedPipelineId?.toString() || ''}
                onValueChange={(v) => setSelectedPipelineId(parseInt(v))}
              >
                <SelectTrigger className="flex-1 h-9">
                  <SelectValue placeholder="Select pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((pipeline) => (
                    <SelectItem key={pipeline.id} value={pipeline.id.toString()}>
                      {pipeline.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowCreatePipelineModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Pipeline
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
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

      <div className="h-full flex flex-col">
        {/* Stats bar */}
        {currentPipeline && (
        <div className="px-6 py-3 border-b bg-muted/20">
          <div className="flex gap-6">
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Open deals:</span>
              <span className="font-medium">{stats.openDeals}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Pipeline value:</span>
              <span className="font-medium">
                ${stats.totalValue.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="p-6 flex gap-4 overflow-x-auto">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex-shrink-0 w-80">
                <Skeleton className="h-12 w-full mb-4" />
                <Skeleton className="h-32 w-full mb-2" />
                <Skeleton className="h-32 w-full mb-2" />
                <Skeleton className="h-32 w-full" />
              </div>
            ))}
          </div>
        ) : pipelines.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No pipelines yet"
            description="Create your first sales pipeline to start tracking deals"
            actionLabel="New Pipeline"
            onAction={() => setShowCreatePipelineModal(true)}
          />
        ) : currentPipeline ? (
          (() => {
            const filteredDeals = searchQuery
              ? currentPipeline.deals.filter(deal => {
                  const query = searchQuery.toLowerCase();
                  const titleMatch = deal.title.toLowerCase().includes(query);
                  const contactMatch = deal.contact 
                    ? `${deal.contact.first_name || ''} ${deal.contact.last_name || ''}`.toLowerCase().includes(query) ||
                      (deal.contact.email || '').toLowerCase().includes(query)
                    : false;
                  const tagMatch = deal.tags?.some(tag => tag.toLowerCase().includes(query));
                  return titleMatch || contactMatch || tagMatch;
                })
              : currentPipeline.deals;
            return (
              <KanbanBoard
                pipeline={currentPipeline}
                deals={filteredDeals}
                onDealMove={handleDealMove}
                onAddDeal={handleAddDealToStage}
                onRefresh={fetchPipeline}
                organizationId={organizationId!}
              />
            );
          })()
        ) : null}
      </div>

      {/* Create Deal Modal */}
      {showCreateDealModal && organizationId && selectedPipelineId && (
        <CreateDealModal
          pipelineId={selectedPipelineId}
          stages={currentPipeline?.stages || []}
          initialStageId={initialStageId}
          organizationId={organizationId}
          onClose={() => {
            setShowCreateDealModal(false);
            setInitialStageId(undefined);
          }}
          onCreated={handleDealCreated}
        />
      )}

      {/* Create Pipeline Modal */}
      {showCreatePipelineModal && organizationId && (
        <CreatePipelineModal
          organizationId={organizationId}
          onClose={() => setShowCreatePipelineModal(false)}
          onCreated={handlePipelineCreated}
        />
      )}
      </div>
    </PageLayout>
  );
}

export default PipelinesPage;
