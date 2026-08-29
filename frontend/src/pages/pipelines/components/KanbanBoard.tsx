import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  DollarSign,
  Kanban,
  Maximize2,
  Minus,
  MoreHorizontal,
  Plus,
  Trophy,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { Pipeline, Deal, PipelineStage } from '@/types';
import { markDealWon, markDealLost, deleteDeal } from '@/services/pipelinesApi';

interface KanbanBoardProps {
  pipeline: Pipeline;
  deals: Deal[];
  onDealMove: (dealId: number, newStageId: string) => void;
  onAddDeal: (stageId: string) => void;
  onRefresh: () => void;
  organizationId: number;
  onRemove?: () => void;
}

const ZOOM_LEVELS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100];
const STAGE_WIDTH = 320;
const BOARD_GAP = 16;
const BOARD_PADDING = 48;
type KanbanZoom = number | 'fit';

const getZoomStorageKey = (organizationId: number, pipelineId: number) =>
  `itemize:pipelines:${organizationId}:kanban-zoom:${pipelineId}`;

const readSavedZoom = (organizationId: number, pipelineId: number): KanbanZoom => {
  try {
    const savedValue = localStorage.getItem(getZoomStorageKey(organizationId, pipelineId));
    if (savedValue === 'fit') return 'fit';
    const value = Number(savedValue);
    return ZOOM_LEVELS.includes(value) ? value : 'fit';
  } catch {
    return 'fit';
  }
};

export function KanbanBoard({
  pipeline,
  deals,
  onDealMove,
  onAddDeal,
  onRefresh,
  organizationId,
  onRemove,
}: KanbanBoardProps) {
  const { toast } = useToast();
  const [draggedDealId, setDraggedDealId] = useState<number | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [deleteDealId, setDeleteDealId] = useState<number | null>(null);
  const boardViewportRef = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(100);
  const [zoomSetting, setZoomSetting] = useState<KanbanZoom>(() =>
    readSavedZoom(organizationId, pipeline.id),
  );

  const stages = pipeline.stages as PipelineStage[];

  useEffect(() => {
    setZoomSetting(readSavedZoom(organizationId, pipeline.id));
  }, [organizationId, pipeline.id]);

  useEffect(() => {
    const viewport = boardViewportRef.current;
    if (!viewport) return;
    let settleTimer: number | undefined;

    const updateFitZoom = () => {
      const naturalWidth = (stages.length * STAGE_WIDTH)
        + (Math.max(stages.length - 1, 0) * BOARD_GAP)
        + BOARD_PADDING;
      const availableWidth = viewport.clientWidth;
      const nextFit = naturalWidth > 0
        ? Math.max(20, Math.min(100, ((availableWidth - 1) / naturalWidth) * 100))
        : 100;
      setFitZoom(nextFit);
    };

    const handleViewportResize = () => {
      updateFitZoom();
      window.clearTimeout(settleTimer);
      // The app sidebar animates its width for 200 ms. Measure once more after
      // the shell settles so Fit always reflects the final board width.
      settleTimer = window.setTimeout(updateFitZoom, 240);
    };

    handleViewportResize();
    const observer = new ResizeObserver(handleViewportResize);
    observer.observe(viewport);
    window.addEventListener('resize', handleViewportResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleViewportResize);
      window.clearTimeout(settleTimer);
    };
  }, [stages.length]);

  useEffect(() => {
    try {
      localStorage.setItem(
        getZoomStorageKey(organizationId, pipeline.id),
        zoomSetting.toString(),
      );
    } catch {
      // A blocked storage write should not prevent the board from working.
    }
  }, [organizationId, pipeline.id, zoomSetting]);

  const effectiveZoom = zoomSetting === 'fit' ? fitZoom : zoomSetting;
  const zoomIndex = ZOOM_LEVELS.findIndex((level) => level >= effectiveZoom);
  const zoomOut = () => {
    const nextIndex = zoomIndex <= 0 ? 0 : zoomIndex - 1;
    setZoomSetting(ZOOM_LEVELS[nextIndex]);
  };
  const zoomIn = () => {
    const nextIndex = zoomIndex === -1
      ? ZOOM_LEVELS.length - 1
      : Math.min(zoomIndex + 1, ZOOM_LEVELS.length - 1);
    setZoomSetting(ZOOM_LEVELS[nextIndex]);
  };

  const openDeals = deals.filter((deal) => !deal.won_at && !deal.lost_at);
  const pipelineValue = openDeals.reduce((sum, deal) => sum + (deal.value || 0), 0);

  // Get deals for a specific stage
  const getDealsForStage = (stageId: string) => {
    return deals.filter(d => d.stage_id === stageId && !d.won_at && !d.lost_at);
  };

  // Get stage total value
  const getStageValue = (stageId: string) => {
    return getDealsForStage(stageId).reduce((sum, d) => sum + (d.value || 0), 0);
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, dealId: number) => {
    setDraggedDealId(dealId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedDealId(null);
    setDragOverStageId(null);
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStageId(stageId);
  };

  const handleDragLeave = () => {
    setDragOverStageId(null);
  };

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    if (draggedDealId) {
      onDealMove(draggedDealId, stageId);
    }
    setDraggedDealId(null);
    setDragOverStageId(null);
  };

  // Deal actions
  const handleMarkWon = async (dealId: number) => {
    try {
      await markDealWon(dealId, organizationId);
      toast({ title: 'Deal Won', description: 'Deal has been marked as won' });
      onRefresh();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update deal', variant: 'destructive' });
    }
  };

  const handleMarkLost = async (dealId: number) => {
    try {
      await markDealLost(dealId, undefined, organizationId);
      toast({ title: 'Deal Lost', description: 'Deal has been marked as lost' });
      onRefresh();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update deal', variant: 'destructive' });
    }
  };

  const handleDeleteDeal = async () => {
    if (!deleteDealId) return;
    
    try {
      await deleteDeal(deleteDealId, organizationId);
      toast({ title: 'Deleted', description: 'Deal deleted successfully' });
      onRefresh();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete deal', variant: 'destructive' });
    } finally {
      setDeleteDealId(null);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <section aria-label={`${pipeline.name} pipeline`} className="border-b last:border-b-0">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <Kanban className="icon-accent h-4 w-4 shrink-0" aria-hidden="true" />
            <h2 className="truncate text-base font-semibold">{pipeline.name}</h2>
            {pipeline.is_default ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex cursor-help"
                    tabIndex={0}
                    aria-label="Default pipeline"
                  >
                    <Badge variant="secondary" className="font-light">
                      Default
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Opens first and is preselected for new deals.
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span><span className="font-medium text-foreground">{openDeals.length}</span> open</span>
            <span><span className="font-medium text-foreground">{formatCurrency(pipelineValue)}</span> value</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <div className="flex h-9 items-center rounded-md border bg-background" aria-label={`${pipeline.name} board zoom`}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={zoomOut}
              disabled={effectiveZoom <= ZOOM_LEVELS[0]}
              aria-label={`Zoom out ${pipeline.name} board`}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-12 text-center text-xs tabular-nums" aria-live="polite">
              {Math.round(effectiveZoom)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={zoomIn}
              disabled={effectiveZoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
              aria-label={`Zoom in ${pipeline.name} board`}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`h-9 gap-2 font-light ${
              zoomSetting === 'fit' ? 'bg-muted text-blue-600 dark:text-blue-400' : ''
            }`}
            onClick={() => setZoomSetting('fit')}
            aria-label={`Fit ${pipeline.name} board`}
            aria-pressed={zoomSetting === 'fit'}
          >
            <Maximize2 className="h-4 w-4" />
            <span className="hidden sm:inline">Fit</span>
          </Button>
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground"
              onClick={onRemove}
              aria-label={`Remove ${pipeline.name} from stacked pipelines`}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div ref={boardViewportRef} className="min-h-96 overflow-x-auto">
        <div
          className="flex gap-4 p-6"
          style={{
            zoom: effectiveZoom / 100,
            minHeight: `${384 / (effectiveZoom / 100)}px`,
          }}
        >
        {stages.map((stage) => {
          const stageDeals = getDealsForStage(stage.id);
          const stageValue = getStageValue(stage.id);
          const isDropTarget = dragOverStageId === stage.id;

          return (
            <div
              key={stage.id}
              className={`flex-shrink-0 w-80 flex flex-col rounded-lg transition-colors ${
                isDropTarget ? 'bg-blue-50 dark:bg-blue-950/20' : 'bg-muted/30'
              }`}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              {/* Stage Header */}
              <div className="p-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="font-medium text-sm">{stage.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {stageDeals.length}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatCurrency(stageValue)}
                </span>
              </div>

              {/* Deals List */}
              <ScrollArea className="flex-1 p-2">
                <div className="space-y-2">
                  {stageDeals.map((deal) => (
                    <Card
                      key={deal.id}
                      className={`cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md ${
                        draggedDealId === deal.id ? 'opacity-50' : ''
                      }`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, deal.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-sm line-clamp-2">
                            {deal.title}
                          </h4>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 -mt-1 -mr-1">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleMarkWon(deal.id)}>
                                <Trophy className="h-4 w-4 mr-2 text-green-600" />
                                Mark as Won
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleMarkLost(deal.id)}>
                                <XCircle className="h-4 w-4 mr-2 text-red-600" />
                                Mark as Lost
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteDealId(deal.id)}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Contact */}
                        {(deal.contact_first_name || deal.contact_last_name || deal.contact_company) && (
                          <p className="text-xs text-muted-foreground mb-2">
                            {[deal.contact_first_name, deal.contact_last_name].filter(Boolean).join(' ')}
                            {deal.contact_company && (
                              <span> - {deal.contact_company}</span>
                            )}
                          </p>
                        )}

                        {/* Deal info */}
                        <div className="flex flex-wrap gap-2 text-xs">
                          {deal.value > 0 && (
                            <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <DollarSign className="h-3 w-3" />
                              {formatCurrency(deal.value)}
                            </div>
                          )}
                          {deal.expected_close_date && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {formatDate(deal.expected_close_date)}
                            </div>
                          )}
                          {deal.assigned_to_name && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <User className="h-3 w-3" />
                              {deal.assigned_to_name}
                            </div>
                          )}
                        </div>

                        {/* Probability */}
                        {deal.probability > 0 && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-muted-foreground">Probability</span>
                              <span>{deal.probability}%</span>
                            </div>
                            <div className="h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${deal.probability}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}

                  {/* Add deal button */}
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-muted-foreground hover:text-foreground"
                    onClick={() => onAddDeal(stage.id)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add deal
                  </Button>
                </div>
              </ScrollArea>
            </div>
          );
        })}
        </div>
      </div>

      <DeleteDialog
        open={deleteDealId !== null}
        onOpenChange={(open) => !open && setDeleteDealId(null)}
        onConfirm={handleDeleteDeal}
        itemType="deal"
        itemTitle={deals.find(d => d.id === deleteDealId)?.title}
      />
    </section>
  );
}

export default KanbanBoard;
