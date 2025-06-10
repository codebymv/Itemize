import React, { useEffect, useState, useCallback } from 'react';
import { Edit3, Check, X, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNoteSuggestions } from '../../hooks/use-note-suggestions';

interface NoteContentProps {
  content: string;
  isEditingContent: boolean;
  editContent: string;
  setEditContent: (value: string) => void;
  setIsEditingContent: (value: boolean) => void;
  handleEditContent: () => void;
  contentEditRef: React.RefObject<HTMLTextAreaElement>;
  noteCategory?: string;
}

export const NoteContent: React.FC<NoteContentProps> = ({
  content,
  isEditingContent,
  editContent,
  setEditContent,
  setIsEditingContent,
  handleEditContent,
  contentEditRef,
  noteCategory
}) => {
  // Note AI enabled state - separate from lists
  const [aiEnabled, setAiEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('itemize-note-ai-enabled');
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });
  
  // Save note AI setting to localStorage
  useEffect(() => {
    localStorage.setItem('itemize-note-ai-enabled', JSON.stringify(aiEnabled));
  }, [aiEnabled]);
  
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const [showSuggestionButton, setShowSuggestionButton] = useState<boolean>(false);

  // Smart note suggestions hook
  const {
    suggestions,
    continuations,
    currentSuggestion,
    isLoading,
    error,
    triggerSuggestions,
    getSuggestionForInput,
    metrics
  } = useNoteSuggestions({
    enabled: aiEnabled && isEditingContent,
    noteContent: editContent,
    noteCategory
  });

  // Get current autocomplete suggestion based on cursor position
  const currentAutocomplete = getSuggestionForInput(editContent, cursorPosition);

  // Add click-outside functionality
  useEffect(() => {
    if (!isEditingContent) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contentEditRef.current && 
        !contentEditRef.current.contains(event.target as Node)
      ) {
        handleEditContent();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isEditingContent, handleEditContent, contentEditRef]);

  // Handle cursor position changes
  const handleSelectionChange = useCallback((e?: React.MouseEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLTextAreaElement>) => {
    if (contentEditRef.current) {
      setCursorPosition(contentEditRef.current.selectionStart || 0);
    }
  }, []);

  // Accept a suggestion from the suggestion button
  const acceptSuggestion = useCallback((suggestion: string) => {
    if (suggestion) {
      // Add suggestion at current cursor position or end of content
      const beforeCursor = editContent.substring(0, cursorPosition);
      const afterCursor = editContent.substring(cursorPosition);
      
      // Smart insertion - add space or newline if needed
      let insertText = suggestion;
      if (beforeCursor && !beforeCursor.endsWith(' ') && !beforeCursor.endsWith('\n')) {
        insertText = ' ' + insertText;
      }
      
      const newContent = beforeCursor + insertText + afterCursor;
      setEditContent(newContent);
      setCursorPosition(beforeCursor.length + insertText.length);
    }
  }, [editContent, cursorPosition, setEditContent]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isEditingContent) return;
    
    // Save on Ctrl+Enter or Escape
    if ((e.ctrlKey && e.key === 'Enter') || e.key === 'Escape') {
      e.preventDefault();
      handleEditContent();
      return;
    }

    // Tab or Right Arrow to accept autocomplete
    if (
      currentAutocomplete && 
      cursorPosition === editContent.length && 
      (e.key === 'Tab' || e.key === 'ArrowRight')
    ) {
      e.preventDefault();
      acceptSuggestion(currentAutocomplete);
      return;
    }

    // Ctrl+Space to trigger suggestions
    if (e.ctrlKey && e.key === ' ') {
      e.preventDefault();
      triggerSuggestions();
      return;
    }
  }, [
    isEditingContent, 
    currentAutocomplete, 
    cursorPosition, 
    editContent.length, 
    handleEditContent, 
    acceptSuggestion, 
    triggerSuggestions
  ]);

  // Show suggestion button when there are suggestions available
  useEffect(() => {
    setShowSuggestionButton(
      aiEnabled && 
      isEditingContent && 
      (suggestions.length > 0 || continuations.length > 0 || currentSuggestion !== null)
    );
  }, [aiEnabled, isEditingContent, suggestions.length, continuations.length, currentSuggestion]);

  return (
    <div 
      className="flex-1 flex flex-col h-full relative"
      onClick={() => {
        if (!isEditingContent) {
          setIsEditingContent(true);
          setEditContent(content);
          // Focus the textarea after state update
          setTimeout(() => {
            contentEditRef.current?.focus();
          }, 0);
        }
      }}
    >
      {/* Main textarea with autocomplete overlay */}
      <div className="relative flex-1">
        <Textarea
          ref={contentEditRef}
          value={isEditingContent ? editContent : content}
          onChange={(e) => {
            if (isEditingContent) {
              setEditContent(e.target.value);
              setCursorPosition(e.target.selectionStart || 0);
            }
          }}
          onKeyDown={handleKeyDown}
          onSelect={handleSelectionChange}
          onClick={(e) => {
            if (isEditingContent) {
              handleSelectionChange(e);
            }
          }}
          className="flex-1 resize-none border-none focus:ring-0 bg-transparent p-3 text-sm w-full cursor-text whitespace-pre-wrap"
          placeholder={isEditingContent ? "Type your note content..." : "Click anywhere to add content..."}
          readOnly={!isEditingContent}
          style={{ height: '100%', fontFamily: '"Raleway", sans-serif' }}
        />

        {/* GitHub Copilot-style autocomplete overlay */}
        {isEditingContent && currentAutocomplete && cursorPosition === editContent.length && (
          <div 
            className="absolute inset-0 p-3 pointer-events-none overflow-hidden"
            style={{ fontSize: '14px', lineHeight: '1.5' }}
          >
            <div className="whitespace-pre-wrap">
              <span className="text-transparent">{editContent}</span>
              <span 
                className="text-gray-400 font-medium"
                style={{ fontFamily: '"Raleway", sans-serif' }}
                title="Press Tab or Right Arrow to accept, Ctrl+Space for more suggestions"
              >
                {currentAutocomplete.substring(editContent.length)}
              </span>
            </div>
          </div>
        )}

        {/* AI status indicator */}
        {aiEnabled && isEditingContent && (
          <div className="absolute top-2 right-2 flex items-center gap-1">
            {isLoading && (
              <Sparkles size={14} className="text-blue-500 animate-pulse" />
            )}
            {error && (
              <span className="text-xs text-red-500" title={error}>⚠</span>
            )}
          </div>
        )}
      </div>

      {/* Smart suggestion button - only show when editing and have suggestions */}
      {showSuggestionButton && isEditingContent && (
        <div className="border-t bg-gray-50 p-2">
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={triggerSuggestions}
              disabled={isLoading}
              className="flex items-center gap-1 px-2 py-1 rounded text-blue-600 hover:bg-blue-50 transition-colors"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              <Sparkles size={12} className={isLoading ? 'animate-pulse' : ''} />
              <span>AI Suggest</span>
            </button>

            {/* Show available suggestions */}
            {currentSuggestion && (
              <button
                onClick={() => acceptSuggestion(currentSuggestion)}
                className="flex-1 text-left px-2 py-1 rounded bg-white border text-gray-700 hover:bg-gray-50 transition-colors truncate"
                style={{ fontFamily: '"Raleway", sans-serif' }}
                title={currentSuggestion}
              >
                "{currentSuggestion}"
              </button>
            )}

            {/* Keyboard shortcuts hint */}
            <span className="text-gray-500 ml-auto" style={{ fontFamily: '"Raleway", sans-serif' }}>
              Ctrl+Space
            </span>
          </div>

          {/* Debug info (can be removed in production) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-gray-400 mt-1">
              Words: {metrics.wordCount} | 
              Should trigger: {metrics.shouldTrigger ? 'Yes' : 'No'} |
              Suggestions: {suggestions.length} |
              Continuations: {continuations.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}; 