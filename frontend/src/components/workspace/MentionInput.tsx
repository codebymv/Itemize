import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input';
import {
  EntitySuggestionList,
  type EntitySuggestionListHandle,
} from '@/components/workspace/EntitySuggestionList';
import {
  fetchContactSuggestions,
  upgradeSuggestion,
  type EntitySuggestion,
} from '@/lib/entitySuggestions';
import {
  applyMentionTrigger,
  findMentionTrigger,
  type MentionTrigger,
} from '@/lib/mentionTokens';

/** What a plain input needs to know to offer `@` clients. Built once per card. */
export interface MentionContext {
  organizationId: number | null;
  canBind: boolean;
  onUpgrade?: () => void;
}

export interface MentionInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  mention?: MentionContext;
}

const POPUP_OFFSET_PX = 4;

const placeBelow = (host: HTMLElement, anchor: HTMLElement) => {
  const rect = anchor.getBoundingClientRect();
  const width = host.offsetWidth || 288;
  const height = host.offsetHeight || 0;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const below = rect.bottom + POPUP_OFFSET_PX;
  const top = below + height > window.innerHeight - 8 && rect.top - height - POPUP_OFFSET_PX > 8
    ? rect.top - height - POPUP_OFFSET_PX
    : below;
  host.style.left = `${left}px`;
  host.style.top = `${top}px`;
};

/**
 * A plain `Input` that offers the Slack-style client list when the user types
 * `@`. Accepting a row replaces `@query` with a mention token; the card that
 * saves the text decides whether that mention also binds the card.
 */
export const MentionInput = forwardRef<HTMLInputElement, MentionInputProps>(
  ({ value, onValueChange, mention, onKeyDown, onBlur, ...inputProps }, forwardedRef) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const hostRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<EntitySuggestionListHandle>(null);
    const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
    const [rows, setRows] = useState<EntitySuggestion[]>([]);
    const [loading, setLoading] = useState(false);

    useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

    const enabled = Boolean(mention);
    const open = enabled && trigger !== null;

    const syncTrigger = useCallback((nextValue: string, caret: number | null) => {
      if (!enabled) return;
      setTrigger(findMentionTrigger(nextValue, caret ?? nextValue.length));
    }, [enabled]);

    // Fetch rows for the open trigger; the Free plan gets the single upgrade row.
    useEffect(() => {
      if (!open || !mention) return;
      if (!mention.canBind || mention.organizationId === null) {
        setRows([upgradeSuggestion]);
        return;
      }
      let cancelled = false;
      setLoading(true);
      void fetchContactSuggestions(trigger?.query ?? '', mention.organizationId)
        .then((next) => {
          if (!cancelled) setRows(next);
        })
        .catch(() => {
          if (!cancelled) setRows([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [open, mention, trigger?.query]);

    useLayoutEffect(() => {
      if (!open || !hostRef.current || !inputRef.current) return;
      const host = hostRef.current;
      const anchor = inputRef.current;
      placeBelow(host, anchor);
      const reposition = () => placeBelow(host, anchor);
      window.addEventListener('resize', reposition);
      window.addEventListener('scroll', reposition, true);
      return () => {
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition, true);
      };
    }, [open, rows]);

    const select = useCallback((item: EntitySuggestion) => {
      if (!trigger) return;
      if (item.kind === 'upgrade') {
        setTrigger(null);
        mention?.onUpgrade?.();
        return;
      }
      const caret = inputRef.current?.selectionStart ?? value.length;
      const next = applyMentionTrigger(value, trigger, caret, { contactId: item.id, label: item.label });
      onValueChange(next.value);
      setTrigger(null);
      requestAnimationFrame(() => {
        const element = inputRef.current;
        if (!element) return;
        element.focus();
        element.setSelectionRange(next.caret, next.caret);
      });
    }, [mention, onValueChange, trigger, value]);

    return (
      <>
        <Input
          {...inputProps}
          ref={inputRef}
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            syncTrigger(event.target.value, event.target.selectionStart);
          }}
          onKeyDown={(event) => {
            if (open) {
              if (event.key === 'Escape') {
                event.preventDefault();
                setTrigger(null);
                return;
              }
              if (listRef.current?.onKeyDown(event.nativeEvent)) {
                event.preventDefault();
                return;
              }
            }
            onKeyDown?.(event);
          }}
          onBlur={(event) => {
            setTrigger(null);
            onBlur?.(event);
          }}
          aria-autocomplete={enabled ? 'list' : undefined}
          aria-expanded={enabled ? open : undefined}
        />
        {open && createPortal(
          <div
            ref={hostRef}
            style={{ position: 'fixed', zIndex: 10050 }}
            data-testid="mention-input-popup"
          >
            <EntitySuggestionList ref={listRef} items={rows} loading={loading} onSelect={select} />
          </div>,
          document.body,
        )}
      </>
    );
  },
);

MentionInput.displayName = 'MentionInput';

export default MentionInput;
