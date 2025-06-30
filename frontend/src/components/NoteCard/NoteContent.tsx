import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Edit3, Check, X, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNoteSuggestions } from '../../hooks/use-note-suggestions';
import { useAISuggest } from '@/context/AISuggestContext';
import { formatRelativeTime } from '@/utils/timeUtils';

interface NoteContentProps {
  content: string;
  isEditingContent: boolean;
  editContent: string;
  setEditContent: (value: string) => void;
  setIsEditingContent: (value: boolean) => void;
  handleEditContent: () => void;
  contentEditRef: React.RefObject<HTMLTextAreaElement>;
  noteCategory?: string;
  noteColor?: string;
  noteId: number; // Add noteId for autosave
  onAutoSave: (content: string) => Promise<void>; // Add autosave handler
  updatedAt?: string; // Add updated_at timestamp from database
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
  noteColor = '#FFFFE0',
  noteId,
  onAutoSave,
  updatedAt
}) => {
  // Use global AI enabled state from context
  const { aiEnabled } = useAISuggest();
  
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const [showSuggestionButton, setShowSuggestionButton] = useState<boolean>(false);
  
  // Autosave state
  const [isAutoSaving, setIsAutoSaving] = useState<boolean>(false);
  const [lastSavedContent, setLastSavedContent] = useState<string>(content);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const AUTOSAVE_DELAY = 1000; // 1 second with granular updates for optimal real-time performance

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
  
  // Granular autosave function for content only
  const performAutosave = useCallback(async (content: string) => {
    if (content.trim() === lastSavedContent.trim()) {
      return; // No changes to save
    }

    try {
      setIsAutoSaving(true);
      // Use granular content update instead of full note update
      await onAutoSave(content);
      setLastSavedContent(content);
      setHasUnsavedChanges(false);
      console.log('📝 Granular autosaved note content:', noteId);
    } catch (error) {
      console.error('❌ Autosave failed:', error);
    } finally {
      setIsAutoSaving(false);
    }
  }, [lastSavedContent, onAutoSave, noteId]);
  
  // Track unsaved changes
  useEffect(() => {
    if (isEditingContent) {
      setHasUnsavedChanges(editContent.trim() !== lastSavedContent.trim());
    }
  }, [editContent, lastSavedContent, isEditingContent]);
  
  // Debounced autosave effect
  useEffect(() => {
    if (!isEditingContent) return;
    
    // Clear existing timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
    
    // Set new timeout for autosave
    autosaveTimeoutRef.current = setTimeout(() => {
      if (editContent.trim() !== lastSavedContent.trim()) {
        performAutosave(editContent);
      }
    }, AUTOSAVE_DELAY);
    
    // Cleanup on unmount or when dependencies change
    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [editContent, isEditingContent, performAutosave, lastSavedContent]);
  
  // Update lastSavedContent when content prop changes (from external updates)
  useEffect(() => {
    setLastSavedContent(content);
    setHasUnsavedChanges(false);
  }, [content]);
  
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
        // Clear autosave timeout since we're manually saving
        if (autosaveTimeoutRef.current) {
          clearTimeout(autosaveTimeoutRef.current);
        }
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
      // Clear autosave timeout since we're manually saving
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
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
      className="flex-1 flex flex-col h-full relative cursor-pointer"
      onClick={(e) => {
        // Don't trigger if clicking on AI indicator
        const target = e.target as HTMLElement;
        if (target.closest('.ai-indicator, .sparkles-icon')) {
          return;
        }
        
        if (!isEditingContent) {
          setIsEditingContent(true);
          setEditContent(content);
          // Focus the textarea after state update with a longer delay for mobile
          setTimeout(() => {
            contentEditRef.current?.focus();
            // For mobile, also trigger the virtual keyboard
            if (window.innerWidth < 768) {
              contentEditRef.current?.click();
            }
          }, 100);
        }
      }}
      style={{
        paddingBottom: updatedAt ? '36px' : '8px' // Reserve space for footer (responsive)
      }}
    >
      {/* Main textarea with autocomplete overlay */}
      <div className="relative flex-1 overflow-hidden">
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
          onTouchStart={(e) => {
            // Ensure mobile devices can focus the textarea
            if (!isEditingContent) {
              e.stopPropagation();
            }
          }}
          className={`flex-1 resize-none bg-transparent w-full cursor-text whitespace-pre-wrap !border-none !ring-0 !ring-offset-0 !outline-none focus:!border-none focus:!ring-0 focus:!ring-offset-0 focus-visible:!border-none focus-visible:!ring-0 focus-visible:!ring-offset-0 overflow-y-auto ${
            aiEnabled && isEditingContent ? 'p-3 pr-8' : 'p-3'
          }`}
          placeholder={isEditingContent ? "Type your note content..." : (window.innerWidth < 768 ? "Tap to edit content..." : "Click anywhere to add content...")}
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
            className={`absolute inset-0 pointer-events-none overflow-hidden whitespace-pre-wrap ${
              aiEnabled ? 'p-3 pr-8' : 'p-3'
            }`}
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

        {/* AI status indicator and autosave status */}
        {isEditingContent && (aiEnabled || isAutoSaving || hasUnsavedChanges) && (
          <div className="ai-indicator absolute top-2 right-2 flex items-center gap-1">
            {isAutoSaving && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Autosaving..."></div>
                <span className="text-xs text-green-600" title="Autosaving...">💾</span>
              </div>
            )}
            {!isAutoSaving && hasUnsavedChanges && (
              <div className="w-2 h-2 bg-orange-400 rounded-full" title="Unsaved changes (will autosave in a few seconds)"></div>
            )}
            {aiEnabled && isLoading && (
              <Sparkles size={14} className="sparkles-icon text-blue-500 animate-pulse" />
            )}
            {aiEnabled && error && (
              <span className="text-xs text-red-500" title={error}>⚠</span>
            )}
          </div>
        )}
      </div>

      {/* Last edited section with dividing line - Always visible at bottom */}
      {updatedAt && (
        <div 
          className="absolute bottom-0 left-0 right-0 flex-shrink-0 px-2 md:px-3 py-1 md:py-2"
          style={{ 
            borderTop: `1px solid ${noteColor}33`,
            backgroundColor: '#ffffff',
            fontSize: '10px'
          }}
        >
          <div className="flex items-center justify-between">
            <div 
              className="text-gray-500 truncate text-xs md:text-xs" 
              style={{ 
                fontFamily: '"Raleway", sans-serif',
                fontSize: 'inherit'
              }}
            >
              <span className="hidden sm:inline">Last edited: </span>
              <span className="sm:hidden">Edited: </span>
              {formatRelativeTime(updatedAt)}
            </div>
            {aiEnabled && (
              <div title="AI-powered suggestions enabled" className="flex-shrink-0 ml-1 md:ml-2">
                <Sparkles 
                  className="h-2.5 w-2.5 md:h-3 md:w-3" 
                  style={{ color: noteColor }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* GitHub Copilot-style only - no suggestion box UI */}
    </div>
  );
}; 