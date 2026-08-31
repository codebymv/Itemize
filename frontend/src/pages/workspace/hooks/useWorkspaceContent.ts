import { useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from '@/lib/queryPolicy';
import {
  getWorkspaceContentSnapshotViaGraphql,
  type WorkspaceContentSnapshot,
} from '@/services/workspaceContentSnapshotGraphql';
import type { List, Note, Vault, Whiteboard, Wireframe } from '@/types';

const EMPTY_LISTS: List[] = [];
const EMPTY_NOTES: Note[] = [];
const EMPTY_WHITEBOARDS: Whiteboard[] = [];
const EMPTY_WIREFRAMES: Wireframe[] = [];
const EMPTY_VAULTS: Vault[] = [];

type WorkspaceRowsKey =
  | 'lists'
  | 'notes'
  | 'whiteboards'
  | 'wireframes'
  | 'vaults';

export function useWorkspaceContent(scopeKey?: string | null) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ['workspace-content-snapshot', scopeKey ?? 'authenticated'] as const,
    [scopeKey],
  );
  const snapshotQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => getWorkspaceContentSnapshotViaGraphql(signal),
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });
  const snapshot = snapshotQuery.data;

  const updateRows = useCallback(<K extends WorkspaceRowsKey,>(
    field: K,
    action: SetStateAction<WorkspaceContentSnapshot[K]>,
  ) => {
    queryClient.setQueryData<WorkspaceContentSnapshot>(queryKey, current => {
      if (!current) return current;
      const next = typeof action === 'function'
        ? (action as (value: WorkspaceContentSnapshot[K]) => WorkspaceContentSnapshot[K])(
          current[field],
        )
        : action;
      return { ...current, [field]: next };
    });
  }, [queryClient, queryKey]);

  const setLists: Dispatch<SetStateAction<List[]>> = useCallback(
    action => updateRows('lists', action),
    [updateRows],
  );
  const setNotes: Dispatch<SetStateAction<Note[]>> = useCallback(
    action => updateRows('notes', action),
    [updateRows],
  );
  const setWhiteboards: Dispatch<SetStateAction<Whiteboard[]>> = useCallback(
    action => updateRows('whiteboards', action),
    [updateRows],
  );
  const setWireframes: Dispatch<SetStateAction<Wireframe[]>> = useCallback(
    action => updateRows('wireframes', action),
    [updateRows],
  );
  const setVaults: Dispatch<SetStateAction<Vault[]>> = useCallback(
    action => updateRows('vaults', action),
    [updateRows],
  );

  const refresh = useCallback(async (): Promise<boolean> => {
    const result = await snapshotQuery.refetch();
    return !result.error;
  }, [snapshotQuery]);
  const loading = snapshotQuery.isPending;
  const refreshing = snapshotQuery.isFetching && !snapshotQuery.isPending;

  return {
    lists: snapshot?.lists ?? EMPTY_LISTS,
    notes: snapshot?.notes ?? EMPTY_NOTES,
    whiteboards: snapshot?.whiteboards ?? EMPTY_WHITEBOARDS,
    wireframes: snapshot?.wireframes ?? EMPTY_WIREFRAMES,
    vaults: snapshot?.vaults ?? EMPTY_VAULTS,
    pages: snapshot?.pages,
    setLists,
    setNotes,
    setWhiteboards,
    setWireframes,
    setVaults,
    loading,
    isLoading: loading,
    refreshing,
    isRefreshing: refreshing,
    error: snapshotQuery.error && !snapshot
      ? 'We could not load your workspace content. Your existing items have not been changed.'
      : null,
    refresh,
  };
}
