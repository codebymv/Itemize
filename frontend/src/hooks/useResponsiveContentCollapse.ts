import { useCallback, useState } from 'react';

export type WorkspaceContentKind =
  | 'list'
  | 'note'
  | 'whiteboard'
  | 'wireframe'
  | 'vault';

type ContentId = string | number;

const getContentKey = (kind: WorkspaceContentKind, id: ContentId) => `${kind}:${id}`;

/**
 * Keeps workspace editors compact on mobile while preserving independent
 * collapse controls on desktop. Only one mobile editor is expanded at a time.
 */
export function useResponsiveContentCollapse(isMobile: boolean) {
  const [collapsedDesktopKeys, setCollapsedDesktopKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedMobileKey, setExpandedMobileKey] = useState<string | null>(null);

  const isCollapsed = useCallback(
    (kind: WorkspaceContentKind, id: ContentId) => {
      const key = getContentKey(kind, id);
      return isMobile ? expandedMobileKey !== key : collapsedDesktopKeys.has(key);
    },
    [collapsedDesktopKeys, expandedMobileKey, isMobile],
  );

  const toggle = useCallback(
    (kind: WorkspaceContentKind, id: ContentId) => {
      const key = getContentKey(kind, id);

      if (isMobile) {
        setExpandedMobileKey((current) => (current === key ? null : key));
        return;
      }

      setCollapsedDesktopKeys((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [isMobile],
  );

  return { isCollapsed, toggle };
}
