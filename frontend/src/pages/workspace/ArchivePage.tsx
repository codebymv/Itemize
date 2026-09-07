import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  CheckSquare,
  Frame,
  GitBranch,
  Palette,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ARCHIVE_QUERY_KEY, useWorkspaceArchive } from '@/hooks/useWorkspaceArchive';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';
import { compactAge } from '@/lib/referenceStatus';
import { getArchivedWorkspaceContentViaGraphql, type ArchivableKind } from '@/services/workspaceArchiveGraphql';
import { flattenArchived } from '@/lib/archivedContent';
import { DEFAULT_CARD_ACCENT } from '@/lib/cardAccent';

const TYPE_META: Record<ArchivableKind, { label: string; icon: LucideIcon }> = {
  list: { label: 'List', icon: CheckSquare },
  note: { label: 'Note', icon: StickyNote },
  whiteboard: { label: 'Whiteboard', icon: Palette },
  wireframe: { label: 'Wireframe', icon: GitBranch },
  frame: { label: 'Frame', icon: Frame },
};

/**
 * Everything the owner has parked. Nothing here is on the canvas or in
 * Contents; Restore puts a row back exactly where it was.
 */
export function ArchivePage() {
  const { restore } = useWorkspaceArchive();
  const archiveQuery = useQuery({
    queryKey: ARCHIVE_QUERY_KEY,
    queryFn: ({ signal }) => getArchivedWorkspaceContentViaGraphql(signal),
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });
  const rows = useMemo(
    () => (archiveQuery.data ? flattenArchived(archiveQuery.data) : []),
    [archiveQuery.data],
  );

  return (
    <PageLayout
      title="ARCHIVE"
      icon={<Archive className="h-5 w-5 flex-shrink-0 text-icon-accent" />}
    >
      <Card>
        <CardContent className="p-0">
          {archiveQuery.isPending ? (
            <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading archived content">
              {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16" />)}
            </div>
          ) : archiveQuery.isError ? (
            <ErrorState
              title="Unable to load the archive"
              description="Your archived items are safe; this page just could not reach them."
              actionLabel="Try again"
              onAction={() => void archiveQuery.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Archive}
              kind="collection"
              title="Nothing archived"
              description="Archive a list, note, whiteboard, wireframe, or frame from its menu — or type /archive — and it waits here, off the canvas."
              className="p-12"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Title</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden md:table-cell">Category</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground hidden sm:table-cell">Archived</th>
                    <th className="text-right p-3 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const meta = TYPE_META[row.type];
                    const Icon = meta.icon;
                    const age = compactAge(row.archivedAt);
                    return (
                      <tr key={`${row.type}-${row.id}`} className="border-b">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Icon className="h-5 w-5" style={{ color: row.color || DEFAULT_CARD_ACCENT }} aria-hidden="true" />
                            <span className="text-xs text-muted-foreground hidden sm:inline">{meta.label}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-medium">{row.title}</span>
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          {row.category ? <Badge variant="secondary">{row.category}</Badge> : <span className="text-sm text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground hidden sm:table-cell">
                          {age === null ? '—' : age === 'now' ? 'just now' : `${age} ago`}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void restore(row.type, row.id)}
                            aria-label={`Restore ${meta.label.toLowerCase()} ${row.title}`}
                          >
                            <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden="true" />
                            Restore
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  );
}

export default ArchivePage;
