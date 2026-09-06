import React from 'react';
import { STATUS_THEME_CLASSES } from '@/lib/statusVisuals';
import { parseMentionSegments } from '@/lib/mentionTokens';
import { cn } from '@/lib/utils';

export interface MentionTextProps {
  text: string;
  className?: string;
}

/**
 * Renders plain text with `@[label](contact:id)` tokens as client pills. The
 * pill takes the blue status theme, the same as the client chip and the
 * rich-text mention node, so a client reads identically everywhere.
 */
export const MentionText: React.FC<MentionTextProps> = ({ text, className }) => {
  const segments = parseMentionSegments(text);
  if (segments.every((segment) => segment.kind === 'text')) {
    return <span className={className}>{text}</span>;
  }
  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        ) : (
          <span
            key={index}
            className={cn(
              'inline whitespace-nowrap rounded-full px-1.5 font-semibold',
              STATUS_THEME_CLASSES.blue.badgeClass,
            )}
            data-contact-id={segment.contactId}
          >
            @{segment.label}
          </span>
        ),
      )}
    </span>
  );
};

export default MentionText;
