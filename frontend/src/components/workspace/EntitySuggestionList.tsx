import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { UserRound } from 'lucide-react';
import { STATUS_THEME_CLASSES } from '@/lib/statusVisuals';
import { cn } from '@/lib/utils';
import type { EntitySuggestion } from '@/lib/entitySuggestions';

export interface EntitySuggestionListProps {
  items: EntitySuggestion[];
  loading?: boolean;
  emptyLabel?: string;
  onSelect: (item: EntitySuggestion) => void;
}

/** Imperative surface the editor's suggestion plugin drives with its own keydown events. */
export interface EntitySuggestionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/**
 * The Slack-style row list that appears at the caret for `@` (and later `$`,
 * `#`, `/`). The editor keeps focus, so keyboard handling arrives through the
 * imperative handle rather than DOM focus: arrows move, Enter/Tab accept,
 * Escape is left to the caller so the typed text survives.
 */
export const EntitySuggestionList = forwardRef<EntitySuggestionListHandle, EntitySuggestionListProps>(
  ({ items, loading = false, emptyLabel = 'No matching clients', onSelect }, ref) => {
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
      setActiveIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event) => {
        if (items.length === 0) return false;
        if (event.key === 'ArrowDown') {
          setActiveIndex((index) => (index + 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowUp') {
          setActiveIndex((index) => (index - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const item = items[activeIndex];
          if (item) onSelect(item);
          return true;
        }
        return false;
      },
    }), [activeIndex, items, onSelect]);

    return (
      <div
        role="listbox"
        aria-label="Client suggestions"
        aria-activedescendant={items[activeIndex] ? `entity-suggestion-${items[activeIndex].kind}-${items[activeIndex].id}` : undefined}
        className="w-max min-w-[18rem] max-w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        data-testid="entity-suggestion-list"
      >
        {items.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            {loading ? 'Searching…' : emptyLabel}
          </div>
        ) : (
          items.map((item, index) => (
            <button
              key={`${item.kind}-${item.id}`}
              id={`entity-suggestion-${item.kind}-${item.id}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                'interaction-control flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left text-sm touch-manipulation md:min-h-9',
                index === activeIndex && 'bg-accent text-accent-foreground',
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(item)}
            >
              <span
                className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                  STATUS_THEME_CLASSES.blue.iconBackgroundClass,
                  STATUS_THEME_CLASSES.blue.iconClass,
                )}
                aria-hidden="true"
              >
                {item.kind === 'contact' ? item.initials : <UserRound className="h-3.5 w-3.5" />}
              </span>
              <span className="truncate font-medium">{item.label}</span>
              {item.detail && (
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {item.detail}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    );
  },
);

EntitySuggestionList.displayName = 'EntitySuggestionList';

export default EntitySuggestionList;
