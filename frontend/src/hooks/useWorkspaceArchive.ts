import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthState } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import logger from '@/lib/logger';
import {
  setWorkspaceContentArchivedViaGraphql,
  type ArchivableKind,
} from '@/services/workspaceArchiveGraphql';
import type { WorkspaceContentSnapshot } from '@/services/workspaceContentSnapshotGraphql';

export const ARCHIVE_QUERY_KEY = ['workspace-archive'] as const;

const SNAPSHOT_FIELD: Record<ArchivableKind, keyof Omit<WorkspaceContentSnapshot, 'pages'>> = {
  list: 'lists',
  note: 'notes',
  whiteboard: 'whiteboards',
  wireframe: 'wireframes',
  frame: 'frames',
};

const LABEL: Record<ArchivableKind, string> = {
  list: 'List',
  note: 'Note',
  whiteboard: 'Whiteboard',
  wireframe: 'Wireframe',
  frame: 'Frame',
};

/**
 * Archive and restore for any card or frame, from any page. Archiving drops
 * the row out of the shared workspace snapshot at once (the canvas and
 * Contents both read it); restoring refetches so the row returns hydrated.
 */
export function useWorkspaceArchive() {
  const queryClient = useQueryClient();
  const { currentUser } = useAuthState();
  const { toast } = useToast();
  const uid = currentUser?.uid ?? 'authenticated';
  const snapshotKey = useMemo(() => ['workspace-content-snapshot', uid] as const, [uid]);

  const archive = useCallback(async (type: ArchivableKind, id: number | string): Promise<boolean> => {
    try {
      await setWorkspaceContentArchivedViaGraphql(type, Number(id), true);
      queryClient.setQueryData<WorkspaceContentSnapshot>(snapshotKey, (current) => {
        if (!current) return current;
        const field = SNAPSHOT_FIELD[type];
        const rows = current[field] as Array<{ id: number | string }>;
        return { ...current, [field]: rows.filter((row) => String(row.id) !== String(id)) };
      });
      void queryClient.invalidateQueries({ queryKey: ARCHIVE_QUERY_KEY });
      toast({
        title: `${LABEL[type]} archived`,
        description: 'Find it under Workspace › Archive whenever you need it back.',
      });
      return true;
    } catch (error) {
      logger.error('Failed to archive workspace content:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : `Could not archive the ${LABEL[type].toLowerCase()}.`,
        variant: 'destructive',
      });
      return false;
    }
  }, [queryClient, snapshotKey, toast]);

  const restore = useCallback(async (type: ArchivableKind, id: number | string): Promise<boolean> => {
    try {
      await setWorkspaceContentArchivedViaGraphql(type, Number(id), false);
      void queryClient.invalidateQueries({ queryKey: ARCHIVE_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: snapshotKey });
      toast({ title: `${LABEL[type]} restored`, description: 'It is back on the canvas where it was.' });
      return true;
    } catch (error) {
      logger.error('Failed to restore workspace content:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : `Could not restore the ${LABEL[type].toLowerCase()}.`,
        variant: 'destructive',
      });
      return false;
    }
  }, [queryClient, snapshotKey, toast]);

  return { archive, restore };
}
