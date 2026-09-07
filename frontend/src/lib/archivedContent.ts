import type { ArchivableKind, ArchivedWorkspaceContent } from '@/services/workspaceArchiveGraphql';

export interface ArchivedRow {
  type: ArchivableKind;
  id: number | string;
  title: string;
  category: string | null;
  color: string | null;
  archivedAt: string | null;
}

/** One flat, newest-first list across every family; frames have no category. */
export const flattenArchived = (content: ArchivedWorkspaceContent): ArchivedRow[] => {
  const rows: ArchivedRow[] = [
    ...content.lists.map((item) => ({
      type: 'list' as const, id: item.id, title: item.title, category: item.type ?? item.category ?? null,
      color: item.color_value ?? null, archivedAt: item.archived_at ?? null,
    })),
    ...content.notes.map((item) => ({
      type: 'note' as const, id: item.id, title: item.title, category: item.category ?? null,
      color: item.color_value ?? null, archivedAt: item.archived_at ?? null,
    })),
    ...content.whiteboards.map((item) => ({
      type: 'whiteboard' as const, id: item.id, title: item.title, category: item.category ?? null,
      color: item.color_value ?? null, archivedAt: item.archived_at ?? null,
    })),
    ...content.wireframes.map((item) => ({
      type: 'wireframe' as const, id: item.id, title: item.title, category: item.category ?? null,
      color: item.color_value ?? null, archivedAt: item.archived_at ?? null,
    })),
    ...content.frames.map((item) => ({
      type: 'frame' as const, id: item.id, title: item.title, category: null,
      color: item.color_value, archivedAt: item.archived_at ?? null,
    })),
  ];
  return rows.sort((left, right) =>
    new Date(right.archivedAt ?? 0).getTime() - new Date(left.archivedAt ?? 0).getTime());
};
