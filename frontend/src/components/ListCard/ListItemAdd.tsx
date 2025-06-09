import React, { KeyboardEvent, useEffect } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ListItemAddProps {
  newItemText: string;
  setNewItemText: (value: string) => void;
  handleAddItem: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  currentInputSuggestion: string | null;
  currentSuggestion: string | null;
  handleAcceptSuggestion: () => void;
  handleGetSuggestion: () => void;
  aiEnabled: boolean;
  isLoadingSuggestions: boolean;
}

export const ListItemAdd: React.FC<ListItemAddProps> = (props) => {
  const {
  newItemText,
  setNewItemText,
  handleAddItem,
  inputRef,
  currentInputSuggestion,
  currentSuggestion,
  handleAcceptSuggestion,
  handleGetSuggestion,
  aiEnabled,
  isLoadingSuggestions
  } = props;
  
  // Debug log for props
  useEffect(() => {
    console.log('ListItemAdd props:', {
      newItemText,
      currentInputSuggestion,
      currentSuggestion, // Log this specifically 
      aiEnabled,
      shouldShowSuggestion: aiEnabled && 
        currentInputSuggestion && 
        newItemText && 
        currentInputSuggestion.toLowerCase().startsWith(newItemText.toLowerCase())
    });
  }, [aiEnabled, currentInputSuggestion, currentSuggestion, newItemText]);
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // For debugging keyboard events
    console.log('Key pressed:', e.key, { currentInputSuggestion });
    
    if (e.key === 'Enter') {
      handleAddItem();
    } else if (e.key === 'Escape') {
      setNewItemText('');
    } else if (e.key === 'Tab' && currentInputSuggestion) {
      // Tab key should always accept suggestions
      e.preventDefault(); // Prevent focus change
      handleAcceptSuggestion();
      console.log('Accepting suggestion with Tab');
    } else if (e.key === 'ArrowRight' && currentInputSuggestion) {
      // Only accept with right arrow if cursor is at the end of input
      const input = e.currentTarget as HTMLInputElement;
      if (input.selectionStart === input.value.length) {
        e.preventDefault();
        handleAcceptSuggestion();
        console.log('Accepting suggestion with ArrowRight');
      }
    }
  };

  return (
    <div className="flex flex-col p-2 border-t">
      <div className="flex items-center gap-2">
        {/* Add helper text above the input */}
        {aiEnabled && (
          <div className="absolute -top-5 right-3 text-xs text-blue-600 font-medium">
            Press Tab to accept suggestions
          </div>
        )}
        <div className="relative flex-1 rounded-md border">
          <Input
            ref={inputRef}
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            placeholder="Add new item..."
            className="h-8 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            onKeyDown={handleKeyDown}
          />
          
          {/* Show AI icon/button in the input only when AI is enabled */}
          {aiEnabled && (
            <button 
              type="button"
              onClick={handleGetSuggestion}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 cursor-pointer"
            >
              <Sparkles 
                size={14} 
                style={{ color: 'var(--list-color)' }}
                className={`${isLoadingSuggestions ? 'animate-pulse' : ''}`} 
              />
            </button>
          )}
          
          {/* Show GitHub Copilot style suggestion */}
          {/* Debug condition: {aiEnabled && !!currentInputSuggestion && !!newItemText} */}
          {aiEnabled && currentInputSuggestion && newItemText && 
           currentInputSuggestion.toLowerCase().startsWith(newItemText.toLowerCase()) && (
            <div className="absolute left-0 top-0 right-8 bottom-0 flex items-center pointer-events-none z-10"> 
              <div className="px-3 flex items-center w-full">
                <span className="text-transparent">{newItemText}</span>
                <span
                  className="text-gray-500 overflow-hidden text-ellipsis whitespace-nowrap font-medium"
                  style={{ pointerEvents: 'none' }} 
                  title="Press Tab or Right Arrow to accept"
                >
                  {currentInputSuggestion.substring(newItemText.length)}
                </span>
              </div>
            </div>
          )}
        </div>
        
        <Button
          size="sm"
          variant="secondary"
          onClick={handleAddItem}
          className="h-8 w-8 p-0"
          disabled={!newItemText.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setNewItemText('')}
          className="h-8 w-8 p-0"
        >
          <span className="sr-only">Clear</span>
          <span aria-hidden="true">×</span>
        </Button>
      </div>
      
      {/* Always show suggestion button when AI is enabled */}
      {aiEnabled && (
        <button
          onClick={handleGetSuggestion}
          className="mt-2 w-full flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
          disabled={isLoadingSuggestions}
        >
          <Sparkles className="w-4 h-4" style={{ color: 'var(--list-color)' }} />
          <span className="font-medium">Suggest:</span>
          <span style={{ color: 'var(--list-color)' }} className="font-medium overflow-hidden text-ellipsis whitespace-nowrap">
            {currentSuggestion || ''}
          </span>
          {isLoadingSuggestions && <span className="ml-2 animate-pulse">·</span>}
        </button>
      )}
    </div>
  );
};
