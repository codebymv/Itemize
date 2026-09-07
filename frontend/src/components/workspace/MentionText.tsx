import React, { useMemo } from 'react';
import { accentFill, useCardAccent } from '@/lib/cardAccent';
import { parseMentionSegments, referenceKey } from '@/lib/mentionTokens';
import { describeReference, indexReferences } from '@/lib/referenceStatus';
import { cn } from '@/lib/utils';
import type { WorkspaceReference } from '@/types';

export interface MentionTextProps {
  text: string;
  /** The card's hydrated references; a money pill shows live state from here. */
  references?: readonly WorkspaceReference[] | null;
  className?: string;
}

const sigil = (entityType: string): string => (entityType === 'contact' ? '@' : '$');

/**
 * Renders plain text with `@[label](contact:id)` and `$[label](invoice:id)`
 * tokens as pills. Both take the blue status theme, the same as the client
 * chip and the rich-text mention node, so a reference reads identically
 * everywhere. A money pill carries its live state — "sent · viewed 2d" —
 * when the owner's projection includes it.
 */
export const MentionText: React.FC<MentionTextProps> = ({ text, references, className }) => {
  const accent = useCardAccent();
  const segments = parseMentionSegments(text);
  const index = useMemo(() => indexReferences(references), [references]);
  if (segments.every((segment) => segment.kind === 'text')) {
    return <span className={className}>{text}</span>;
  }
  return (
    <span className={className}>
      {segments.map((segment, position) => {
        if (segment.kind === 'text') {
          return <React.Fragment key={position}>{segment.text}</React.Fragment>;
        }
        const reference = index.get(referenceKey(segment.entityType, segment.entityId));
        const label = reference?.label ?? segment.label;
        const state = reference ? describeReference(reference) : null;
        return (
          <span
            key={position}
            className={cn('inline whitespace-nowrap rounded-full px-1.5 font-semibold')}
            style={accentFill(accent)}
            data-entity-type={segment.entityType}
            data-entity-id={segment.entityId}
            title={state ? `${label} · ${state}` : undefined}
          >
            {sigil(segment.entityType)}
            {label}
            {state && (
              <span className="ml-1 font-normal opacity-80">· {state}</span>
            )}
          </span>
        );
      })}
    </span>
  );
};

export default MentionText;
