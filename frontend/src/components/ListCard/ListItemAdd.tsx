import React, { KeyboardEvent } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SuggestionActions } from '@/components/ai/SuggestionActions';

interface ListItemAddProps {
  newItemText: string;
  setNewItemText: (value: string) => void;
  handleAddItem: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  currentInputSuggestion: string | null;
  currentSuggestion: string | null;
  handleAcceptSuggestion: () => void;
  handleGetSuggestion: () => void;
  dismissSuggestion: () => void;
  aiEnabled: boolean;
  isLoadingSuggestions: boolean;
  suggestionError: string | null;
}

export const ListItemAdd: React.FC<ListItemAddProps> = ({
  newItemText,
  setNewItemText,
  handleAddItem,
  inputRef,
  currentInputSuggestion,
  currentSuggestion,
  handleAcceptSuggestion,
  handleGetSuggestion,
  dismissSuggestion,
  aiEnabled,
  isLoadingSuggestions,
  suggestionError,
}) => {
  const acceptanceSuggestion = currentInputSuggestion || currentSuggestion;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleAddItem();
    } else if (event.key === 'Escape') {
      setNewItemText('');
    } else if (event.key === 'Tab' && acceptanceSuggestion) {
      event.preventDefault();
      handleAcceptSuggestion();
    } else if (event.key === 'ArrowRight' && acceptanceSuggestion) {
      if (event.currentTarget.selectionStart === event.currentTarget.value.length) {
        event.preventDefault();
        handleAcceptSuggestion();
      }
    }
  };

  return (
    <div className="flex flex-col border-t p-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 rounded-md border">
          <Input
            ref={inputRef}
            value={newItemText}
            onChange={(event) => setNewItemText(event.target.value)}
            placeholder="Add new item..."
            className={`h-8 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 ${aiEnabled ? 'pr-8' : ''}`}
            style={{ fontFamily: '"Raleway", sans-serif' }}
            onKeyDown={handleKeyDown}
          />

          {aiEnabled && (
            <button
              type="button"
              onClick={handleGetSuggestion}
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer disabled:cursor-wait"
              aria-label="Generate an AI list item suggestion"
              disabled={isLoadingSuggestions}
            >
              <Sparkles
                size={14}
                style={{ color: 'var(--list-color)' }}
                className={isLoadingSuggestions ? 'animate-pulse' : ''}
                aria-hidden="true"
              />
            </button>
          )}

          {aiEnabled && currentInputSuggestion && newItemText
            && currentInputSuggestion.toLowerCase().startsWith(newItemText.toLowerCase()) && (
              <div className="pointer-events-none absolute inset-y-0 left-0 right-8 z-10 flex items-center">
                <div className="flex w-full items-center px-3 pr-2">
                  <span className="text-transparent">{newItemText}</span>
                  <span
                    className="overflow-hidden text-ellipsis whitespace-nowrap font-medium text-muted-foreground"
                    style={{ fontFamily: '"Raleway", sans-serif', maxWidth: 'calc(100% - 2rem)' }}
                    title="Press Tab or Right Arrow to accept"
                  >
                    {currentInputSuggestion.substring(newItemText.length)}
                  </span>
                </div>
              </div>
            )}
        </div>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleAddItem}
          className="h-8 w-8 p-0"
          disabled={!newItemText.trim()}
          aria-label="Add list item"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setNewItemText('')}
          className="h-8 w-8 p-0"
          aria-label="Clear new item"
          disabled={!newItemText}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {aiEnabled && (
        <SuggestionActions
          className="mt-2"
          suggestion={currentSuggestion}
          isLoading={isLoadingSuggestions}
          error={suggestionError}
          onAccept={handleAcceptSuggestion}
          onDismiss={dismissSuggestion}
          onRegenerate={handleGetSuggestion}
        />
      )}
    </div>
  );
};
