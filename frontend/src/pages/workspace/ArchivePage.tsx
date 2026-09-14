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
import { ExpandedRowHeader } from '@/components/ui/expanded-row-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ARCHIVE_QUERY_KEY, useWorkspaceArchive } from '@/hooks/useWorkspaceArchive';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';
import { compactAge } from '@/lib/referenceStatus';
import { getArchivedWorkspaceContentViaGraphql, type ArchivableKind } from '@/services/workspaceArchiveGraphql';
import { flattenArchived } from '@/lib/archivedContent';
import { defaultCardAccent } from '@/lib/cardAccent';

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
            <div className="divide-y" data-archived-content-list>
              {rows.map((row) => {
                const meta = TYPE_META[row.type];
                const Icon = meta.icon;
                const age = compactAge(row.archivedAt);
                return (
                  <div key={`${row.type}-${row.id}`} className="expanded-row-header p-4">
                    <ExpandedRowHeader
                      leading={<Icon className="h-5 w-5 shrink-0" style={{ color: row.color || defaultCardAccent() }} aria-hidden="true" />}
                      title={row.title}
                      status={row.category ? <Badge variant="secondary">{row.category}</Badge> : null}
                      value={(
                        <span className="text-sm text-muted-foreground">
                          {age === null ? 'Archived' : age === 'now' ? 'Archived just now' : `Archived ${age} ago`}
                        </span>
                      )}
                      trailing={(
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void restore(row.type, row.id)}
                          aria-label={`Restore ${meta.label.toLowerCase()} ${row.title}`}
                        >
                          <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden="true" />
                          Restore
                        </Button>
                      )}
                      meta={<span className="text-xs text-muted-foreground">{meta.label}</span>}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  );
}

export default ArchivePage;
