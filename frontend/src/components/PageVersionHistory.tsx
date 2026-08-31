/**
 * Page Version History Component
 * Shows version history, allows previewing, publishing, and restoring versions
 */

import React, { useCallback, useState, useEffect } from 'react';
import { History as HistoryIcon, Eye, Play, Trash2, RotateCcw, Clock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteDialog } from '@/components/ui/delete-dialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { useToast } from '@/hooks/use-toast';
import {
    getPageVersions,
    createPageVersion,
    publishPageVersion,
    deletePageVersion,
    restorePageVersion,
    PageVersion,
} from '@/services/pageVersionsApi';
import { useOrganization } from '@/hooks/useOrganization';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { defineStatus } from '@/lib/statusVisuals';

const CURRENT_VERSION_VISUAL = defineStatus('Current', 'blue', Play);
const PUBLISHED_VERSION_VISUAL = defineStatus('Published', 'green', Eye);

interface PageVersionHistoryProps {
    pageId: number;
    pageName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPreviewVersion?: (versionId: number) => void;
}

export function PageVersionHistory({ pageId, pageName, open, onOpenChange, onPreviewVersion }: PageVersionHistoryProps) {
    const { organizationId } = useOrganization();
    const { toast } = useToast();
    const [versions, setVersions] = useState<PageVersion[]>([]);
    const [currentVersionId, setCurrentVersionId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState<PageVersion | null>(null);
    const [deleteVersionId, setDeleteVersionId] = useState<number | null>(null);

    const loadVersions = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        setLoadError(false);
        try {
            const data = await getPageVersions(pageId, organizationId);
            setVersions(data.versions);
            setCurrentVersionId(data.currentVersionId);
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [organizationId, pageId]);

    // Load versions when dialog opens
    useEffect(() => {
        if (open && organizationId) {
            void loadVersions();
        }
    }, [loadVersions, open, organizationId]);

    const handleCreateVersion = async () => {
        if (!organizationId) return;
        try {
            await createPageVersion(pageId, `Version from ${new Date().toLocaleDateString()}`, organizationId);
            toast({ title: 'Version Created', description: 'New version saved successfully' });
            loadVersions();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to create version', variant: 'destructive' });
        }
    };

    const handlePublish = async (versionId: number) => {
        if (!organizationId) return;
        try {
            await publishPageVersion(pageId, versionId, organizationId);
            toast({ title: 'Published', description: 'Version published to production' });
            loadVersions();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to publish version', variant: 'destructive' });
        }
    };

    const handleDelete = async () => {
        if (!organizationId || !deleteVersionId) return;
        try {
            await deletePageVersion(pageId, deleteVersionId, organizationId);
            toast({ title: 'Deleted', description: 'Version deleted successfully' });
            loadVersions();
        } catch (error) {
            toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to delete version', variant: 'destructive' });
        } finally {
            setDeleteVersionId(null);
        }
    };

    const handleRestore = async (versionId: number) => {
        if (!organizationId) return;
        if (!confirm('This will create a new version from the selected one. Continue?')) return;
        try {
            await restorePageVersion(pageId, versionId, organizationId);
            toast({ title: 'Restored', description: 'Version restored successfully as new version' });
            loadVersions();
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to restore version', variant: 'destructive' });
        }
    };

    const formatDate = (dateString: string) => {
        try {
            return formatDistanceToNow(new Date(dateString), { addSuffix: true });
        } catch {
            return 'Unknown date';
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[80vh] p-0 flex flex-col">
                <DialogHeader className="border-b px-6 py-4 pr-12">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="flex items-center gap-2">
                            <HistoryIcon className="h-5 w-5 text-blue-600" />
                            Version History - {pageName}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            Browse, save, preview, and restore versions of {pageName}.
                        </DialogDescription>
                        <Button onClick={handleCreateVersion} disabled={loading || !organizationId} size="sm">
                            <Clock className="h-4 w-4 mr-2" />
                            Save New Version
                        </Button>
                    </div>
                </DialogHeader>
                <ScrollArea className="flex-1 p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <p className="text-muted-foreground">Loading versions...</p>
                        </div>
                    ) : loadError ? (
                        <ErrorState
                            kind="inline"
                            icon={HistoryIcon}
                            title="Unable to load version history"
                            description="We couldn't load saved versions. Try again."
                            onRetry={() => void loadVersions()}
                            className="min-h-40"
                        />
                    ) : versions.length === 0 ? (
                        <EmptyState
                            icon={HistoryIcon}
                            kind="inline"
                            title="No versions yet"
                            action={<Button type="button" className="h-11 bg-blue-600 text-white interaction-button--primary" onClick={handleCreateVersion} disabled={!organizationId}>Create version</Button>}
                            className="min-h-40"
                        />
                    ) : (
                        <div className="space-y-3">
                            {versions.map((version, index) => (
                                <div
                                    key={version.id}
                                    className={`flex items-center gap-4 p-4 rounded-lg border ${
                                        currentVersionId === version.id
                                            ? 'border-primary/30 bg-accent'
                                            : 'interaction-row bg-card'
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium">Version {version.version_number}</span>
                                            {currentVersionId === version.id && (
                                                <Badge className={cn('text-xs', CURRENT_VERSION_VISUAL.badgeClass)}>{CURRENT_VERSION_VISUAL.label}</Badge>
                                            )}
                                            {version.published_at && (
                                                <Badge className={cn('text-xs', PUBLISHED_VERSION_VISUAL.badgeClass)}>{PUBLISHED_VERSION_VISUAL.label}</Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-1">{version.description || `Version saved ${formatDate(version.created_at)}`}</p>
                                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <User className="h-3 w-3" />
                                                {version.created_by_name || 'Unknown'}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {formatDate(version.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {currentVersionId !== version.id && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handlePublish(version.id)}
                                            >
                                                <Play className="h-4 w-4 mr-1" />
                                                Publish
                                            </Button>
                                        )}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <HistoryIcon className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {onPreviewVersion && (
                                                    <DropdownMenuItem onClick={() => onPreviewVersion(version.id)}>
                                                        <Eye className="h-4 w-4 mr-2" />
                                                        Preview
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem onClick={() => handleRestore(version.id)}>
                                                    <RotateCcw className="h-4 w-4 mr-2" />
                                                    Restore
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => setDeleteVersionId(version.id)}
                                                    className="text-destructive focus:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>

            <DeleteDialog
                open={deleteVersionId !== null}
                onOpenChange={(open) => !open && setDeleteVersionId(null)}
                onConfirm={handleDelete}
                itemType="version"
                itemTitle={versions.find(v => v.id === deleteVersionId)?.description || `Version ${deleteVersionId}`}
            />
        </Dialog>
    );
}
