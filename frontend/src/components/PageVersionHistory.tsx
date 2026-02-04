/**
 * Page Version History Component
 * Shows version history, allows previewing, publishing, and restoring versions
 */

import React, { useState, useEffect } from 'react';
import { History as HistoryIcon, Eye, Play, Trash2, RotateCcw, Clock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
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
    const [selectedVersion, setSelectedVersion] = useState<PageVersion | null>(null);

    // Load versions when dialog opens
    useEffect(() => {
        if (open && organizationId) {
            loadVersions();
        }
    }, [open, organizationId]);

    const loadVersions = async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const data = await getPageVersions(pageId, organizationId);
            setVersions(data.versions);
            setCurrentVersionId(data.currentVersionId);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load version history', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

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

    const handleDelete = async (versionId: number) => {
        if (!organizationId) return;
        if (!confirm('Are you sure you want to delete this version?')) return;
        try {
            await deletePageVersion(pageId, versionId, organizationId);
            toast({ title: 'Deleted', description: 'Version deleted successfully' });
            loadVersions();
        } catch (error) {
            toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to delete version', variant: 'destructive' });
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
                <DialogHeader className="px-6 py-4 border-b">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="flex items-center gap-2">
                            <HistoryIcon className="h-5 w-5 text-blue-600" />
                            Version History - {pageName}
                        </DialogTitle>
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
                    ) : versions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-center">
                            <HistoryIcon className="h-12 w-12 text-muted-foreground mb-3" />
                            <p className="text-lg font-medium mb-1">No versions yet</p>
                            <p className="text-sm text-muted-foreground mb-4">Create your first version to save a snapshot</p>
                            <Button onClick={handleCreateVersion} disabled={!organizationId}>
                                Create Version
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {versions.map((version, index) => (
                                <div
                                    key={version.id}
                                    className={`flex items-center gap-4 p-4 rounded-lg border ${
                                        currentVersionId === version.id
                                            ? 'bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700'
                                            : 'bg-card hover:bg-muted/50'
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium">Version {version.version_number}</span>
                                            {currentVersionId === version.id && (
                                                <Badge className="bg-green-100 text-green-800 text-xs">Current</Badge>
                                            )}
                                            {version.published_at && (
                                                <Badge variant="outline" className="text-xs">Published</Badge>
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
                                                    onClick={() => handleDelete(version.id)}
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
        </Dialog>
    );
}