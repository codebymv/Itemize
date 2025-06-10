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
  noteColor?: string; // Add note color prop
}

export const NoteContent: React.FC<NoteContentProps> = ({
  content,
  isEditingContent,
  editContent,
  setEditContent,
  setIsEditingContent,
  handleEditContent,
  contentEditRef,
  noteCategory,
  noteColor = '#FFFFE0'
}) => {
  // Note AI enabled state - separate from lists
  const [aiEnabled, setAiEnabled] = useState<boolean>(() => {
    try {
      // Force enable note AI by clearing old disabled setting
      localStorage.setItem('itemize-note-ai-enabled', 'true');
      return true;
    } catch (e) {
      return true;
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
  
  // Debug logging for note autocomplete
  useEffect(() => {
    console.log('📝 Note Autocomplete State:', {
      isEditingContent,
      aiEnabled,
      editContent: editContent.substring(0, 50) + (editContent.length > 50 ? '...' : ''),
      cursorPosition,
      currentAutocomplete,
      suggestionsCount: suggestions.length,
      continuationsCount: continuations.length,
      wordCount: editContent.trim().split(/\s+/).length,
      shouldShow: isEditingContent && currentAutocomplete && cursorPosition === editContent.length
    });
  }, [isEditingContent, aiEnabled, editContent, cursorPosition, currentAutocomplete, suggestions.length, continuations.length]);

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
          className="flex-1 resize-none bg-transparent p-3 w-full cursor-text whitespace-pre-wrap !border-none !ring-0 !ring-offset-0 !outline-none focus:!border-none focus:!ring-0 focus:!ring-offset-0 focus-visible:!border-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
          placeholder={isEditingContent ? "Type your note content..." : "Click anywhere to add content..."}
          readOnly={!isEditingContent}
          style={{ 
            height: '100%', 
            fontFamily: '"Raleway", sans-serif',
            fontSize: '14px',
            lineHeight: '20px',
            border: 'none !important',
            outline: 'none !important',
            boxShadow: 'none !important'
          } as React.CSSProperties}
        />

        {/* GitHub Copilot-style autocomplete overlay */}
        {isEditingContent && currentAutocomplete && cursorPosition === editContent.length && (
          <div 
            className="absolute inset-0 p-3 pointer-events-none overflow-hidden whitespace-pre-wrap"
            style={{ 
              fontFamily: '"Raleway", sans-serif',
              fontSize: '14px',
              lineHeight: '20px'
            }}
          >
            <span className="text-transparent">{editContent}</span>
            <span 
              className="text-gray-400"
              title="Press Tab or Right Arrow to accept, Ctrl+Space for more suggestions"
            >
              {currentAutocomplete}
            </span>
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

      {/* GitHub Copilot-style only - no suggestion box UI */}
    </div>
  );
}; 