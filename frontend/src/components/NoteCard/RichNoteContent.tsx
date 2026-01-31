import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import TextStyle from '@tiptap/extension-text-style';
import { Extension } from '@tiptap/core';
import { Sparkles } from 'lucide-react';
import { RichTextToolbar } from './RichTextToolbar';
import { useNoteSuggestions } from '../../hooks/use-note-suggestions';
import { formatRelativeTime } from '../../utils/timeUtils';
import { useAISuggest } from '@/context/AISuggestContext';
import { useTheme } from 'next-themes';
import { storage } from '@/lib/storage';
import logger from '@/lib/logger';

// Global storage for autocomplete suggestions (persists across editor recreations)
let globalAutocompleteStorage: {
  suggestion: string | null;
  triggerSuggestions: (() => void) | null;
  setSuggestionDebounce: ((wordCount: number) => void) | null;
  handleSave: (() => void) | null;
} = {
  suggestion: null,
  triggerSuggestions: null,
  setSuggestionDebounce: null,
  handleSave: null,
};

// TipTap extension for autocomplete keyboard shortcuts
const AutocompleteExtension = Extension.create({
  name: 'autocomplete',

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        logger.debug('tiptap', 'Tab key pressed');
        logger.debug('tiptap', 'Editor focus state:', this.editor.isFocused);
        logger.debug('tiptap', 'Local storage object:', JSON.stringify(this.storage, null, 2));
        logger.debug('tiptap', 'Global storage object:', JSON.stringify(globalAutocompleteStorage, null, 2));
        
        // Use global storage instead of local storage
        const suggestion = globalAutocompleteStorage.suggestion;
        logger.debug('tiptap', 'Current suggestion from global storage:', suggestion?.substring(0, 30));
        
        if (suggestion) {
          logger.debug('tiptap', 'Accepting suggestion with Tab:', suggestion.substring(0, 30));
          
          // Get current content to check for duplicates before insertion
          const currentContent = this.editor.getText();
          const suggestionTrimmed = suggestion.trim();
          
          // Enhanced duplicate checking for both single words and phrases
          const lastWords = currentContent.trim().split(/\s+/).slice(-10);
          const suggestionWords = suggestionTrimmed.toLowerCase().split(/\s+/);
          
          // Check for single word duplicates (like "the")
          if (suggestionWords.length === 1) {
            const singleWord = suggestionWords[0];
            if (lastWords.some(word => word.toLowerCase() === singleWord)) {
              logger.debug('tiptap', 'Preventing single word duplicate:', {
                duplicateWord: singleWord,
                lastWords: lastWords.slice(-5)
              });
              globalAutocompleteStorage.suggestion = null;
              return true; // Prevent default but don't insert
            }
          }
          
          // Check for phrase duplicates (3+ words)
          const suggestionStart = suggestionWords.slice(0, 3).join(' ');
          const lastWordsText = lastWords.join(' ').toLowerCase();
          
          if (suggestionStart.length > 3 && lastWordsText.includes(suggestionStart)) {
            logger.debug('tiptap', 'Preventing phrase duplicate:', {
              suggestionStart,
              lastWords: lastWords.slice(-5)
            });
            globalAutocompleteStorage.suggestion = null;
            return true; // Prevent default but don't insert
          }
          
          // Clear the suggestion first to prevent immediate re-showing
          globalAutocompleteStorage.suggestion = null;
          
          // Insert the suggestion
          this.editor.commands.insertContent(suggestion);
          
          // Get word count AFTER insertion for proper debounce
          const newContent = this.editor.getText();
          const newWordCount = newContent.trim().split(/\s+/).filter(word => word.length > 0).length;
          
          // Set debounce AFTER inserting content using global storage
          if (globalAutocompleteStorage.setSuggestionDebounce) {
            globalAutocompleteStorage.setSuggestionDebounce(newWordCount);
          }
          
          return true; // Prevent default Tab behavior
        } else {
          logger.debug('tiptap', 'No suggestion available in global storage');
          logger.debug('tiptap', 'Global storage state:', globalAutocompleteStorage);
        }
        return false;
      },
      ArrowRight: () => {
        const suggestion = globalAutocompleteStorage.suggestion;
        if (suggestion) {
          logger.debug('tiptap', 'ArrowRight pressed with suggestion:', suggestion.substring(0, 30));
          
          // Get current content to check for duplicates before insertion
          const currentContent = this.editor.getText();
          const suggestionTrimmed = suggestion.trim();
          
          // Enhanced duplicate checking for both single words and phrases
          const lastWords = currentContent.trim().split(/\s+/).slice(-10);
          const suggestionWords = suggestionTrimmed.toLowerCase().split(/\s+/);
          
          // Check for single word duplicates (like "the")
          if (suggestionWords.length === 1) {
            const singleWord = suggestionWords[0];
            if (lastWords.some(word => word.toLowerCase() === singleWord)) {
              logger.debug('tiptap', 'Preventing single word duplicate (ArrowRight):', {
                duplicateWord: singleWord,
                lastWords: lastWords.slice(-5)
              });
              globalAutocompleteStorage.suggestion = null;
              return true; // Prevent default but don't insert
            }
          }
          
          // Check for phrase duplicates (3+ words)
          const suggestionStart = suggestionWords.slice(0, 3).join(' ');
          const lastWordsText = lastWords.join(' ').toLowerCase();
          
          if (suggestionStart.length > 3 && lastWordsText.includes(suggestionStart)) {
            logger.debug('tiptap', 'Preventing phrase duplicate (ArrowRight):', {
              suggestionStart,
              lastWords: lastWords.slice(-5)
            });
            globalAutocompleteStorage.suggestion = null;
            return true; // Prevent default but don't insert
          }
          
          // Clear the suggestion first to prevent immediate re-showing
          globalAutocompleteStorage.suggestion = null;
          
          // Insert the suggestion
          this.editor.commands.insertContent(suggestion);
          
          // Get word count AFTER insertion for proper debounce
          const newContent = this.editor.getText();
          const newWordCount = newContent.trim().split(/\s+/).filter(word => word.length > 0).length;
          
          // Set debounce AFTER inserting content using global storage
          if (globalAutocompleteStorage.setSuggestionDebounce) {
            globalAutocompleteStorage.setSuggestionDebounce(newWordCount);
          }
          
          return true; // Prevent default Arrow behavior
        }
        return false;
      },
    };
  },

  addStorage() {
    return {
      autocomplete: null,
    };
  },

  onBeforeCreate() {
    // NEVER reset existing storage - preserve suggestion if it exists
    const existingSuggestion = this.storage.autocomplete?.suggestion;
    
    if (!this.storage.autocomplete || typeof this.storage.autocomplete !== 'object') {
      this.storage.autocomplete = {
        suggestion: null,
        triggerSuggestions: () => {},
        setSuggestionDebounce: () => {},
        handleSave: () => {},
      };
    } else if (existingSuggestion) {
      // Preserve existing suggestion during recreation
      this.storage.autocomplete.suggestion = existingSuggestion;
    }
    
    logger.debug('tiptap', 'onBeforeCreate called, preserving suggestion:', this.storage.autocomplete?.suggestion?.substring(0, 30) || 'null');
  },

  onCreate() {
    logger.debug('tiptap', 'onCreate called, final storage:', this.storage.autocomplete?.suggestion?.substring(0, 30) || 'null');
  },
});

interface RichNoteContentProps {
  content: string;
  isEditingContent: boolean;
  editContent: string;
  setEditContent: (value: string) => void;
  setIsEditingContent: (value: boolean) => void;
  handleEditContent: () => void;
  contentEditRef: React.RefObject<HTMLTextAreaElement>; // Keep for compatibility
  noteCategory?: string;
  noteColor?: string;
  noteId: number;
  onAutoSave: (content: string) => Promise<void>;
  updatedAt?: string;
}

export const RichNoteContent: React.FC<RichNoteContentProps> = ({
  content,
  isEditingContent,
  editContent,
  setEditContent,
  setIsEditingContent,
  handleEditContent,
  noteCategory,
  noteColor = '#FFFFE0',
  noteId,
  onAutoSave,
  updatedAt
}) => {
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  
  // Simplified suggestion state - removed problematic debouncing that causes flashing
  const [lastAcceptedSuggestionLength, setLastAcceptedSuggestionLength] = useState<number>(0);
  
  // Show suggestion button state
  const [showSuggestionButton, setShowSuggestionButton] = useState(false);
  
  // Use global AI enabled state from context
  const { aiEnabled } = useAISuggest();

  // Get theme for styling
  const { theme } = useTheme();
  const isLight = theme === 'light';

  // Initialize editor with extensions
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Configure paragraph
        paragraph: {
          HTMLAttributes: {
            class: 'text-sm leading-relaxed',
          },
        },
        // Configure headings with proper levels
        heading: {
          levels: [1, 2, 3],
          HTMLAttributes: {
            class: 'font-semibold',
          },
        },
        // Configure bold, italic, strike
        bold: {
          HTMLAttributes: {
            class: 'font-bold',
          },
        },
        italic: {
          HTMLAttributes: {
            class: 'italic',
          },
        },
        strike: {
          HTMLAttributes: {
            class: 'line-through',
          },
        },
        // Configure lists
        bulletList: {
          HTMLAttributes: {
            class: 'list-disc list-inside',
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: 'list-decimal list-inside',
          },
        },
        listItem: {
          HTMLAttributes: {
            class: 'ml-4',
          },
        },
        // Configure blockquote
        blockquote: {
          HTMLAttributes: {
            class: 'border-l-4 border-gray-300 pl-4 italic text-gray-600',
          },
        },
      }),
      Underline.configure({
        HTMLAttributes: {
          class: 'underline',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right'],
        defaultAlignment: 'left',
      }),
      TextStyle,
      Placeholder.configure({
        placeholder: 'Start typing your note...',
        emptyEditorClass: 'is-empty',
      }),
      AutocompleteExtension,
    ],
    content: '',
    editable: true,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const htmlContent = editor.getHTML();
      setEditContent(htmlContent);
      
      // Auto-enable editing mode when user starts typing
      if (!isEditingContent) {
        logger.debug('tiptap', 'Auto-enabling editing mode because content changed');
        setIsEditingContent(true);
      }
      
      // Auto-save with debounce
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
      
      autosaveTimeoutRef.current = setTimeout(() => {
        logger.debug('tiptap', 'Auto-saving rich note content...');
        onAutoSave(htmlContent); // Pass just the content for granular updates
      }, 1000); // 1 second with granular updates for optimal real-time performance
    },
  });

  // Global Tab key logger to debug event capture
  useEffect(() => {
    const globalTabHandler = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        logger.debug('tiptap', 'Global Tab Event:', {
          target: e.target,
          tagName: (e.target as Element)?.tagName,
          className: (e.target as Element)?.className,
          editorFocused: editor?.isFocused,
          defaultPrevented: e.defaultPrevented,
          timeStamp: e.timeStamp
        });
        
        // Fallback: If we have a suggestion and Tab wasn't handled by TipTap
        const suggestion = globalAutocompleteStorage.suggestion;
        if (suggestion && !e.defaultPrevented && editor) {
          logger.debug('tiptap', 'Global fallback: Handling Tab with suggestion:', suggestion.substring(0, 30));
          e.preventDefault();
          
          // Clear the suggestion first
          globalAutocompleteStorage.suggestion = null;
          
          // Insert the suggestion
          editor.commands.insertContent(suggestion);
          
          // Get word count AFTER insertion for proper debounce
          const newContent = editor.getText();
          const newWordCount = newContent.trim().split(/\s+/).filter(word => word.length > 0).length;
          
          // Set debounce AFTER inserting content
          if (globalAutocompleteStorage.setSuggestionDebounce) {
            globalAutocompleteStorage.setSuggestionDebounce(newWordCount);
          }
        }
      }
    };

    document.addEventListener('keydown', globalTabHandler, true); // Capture phase
    return () => document.removeEventListener('keydown', globalTabHandler, true);
  }, [editor]);

  // Add keyboard shortcuts for formatting (Apple-style)
  useEffect(() => {
    if (!editor) return;
    
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when editor is focused
      if (!editor.isFocused) return;
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdKey = isMac ? e.metaKey : e.ctrlKey;
      
      if (cmdKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            editor.chain().focus().toggleBold().run();
            break;
          case 'i':
            e.preventDefault();
            editor.chain().focus().toggleItalic().run();
            break;
          case 'u':
            e.preventDefault();
            editor.chain().focus().toggleUnderline().run();
            break;
          default:
            break;
        }
      }
    };
    
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [editor]);

  // Get plain text content for AI processing
  const plainTextContent = editor?.getText() || '';
  const cursorPosition = editor?.state.selection.anchor || 0;

  // AI suggestions hook (placed after plainTextContent is defined)
  const { 
    suggestions, 
    continuations, 
    getSuggestionForInput, 
    triggerSuggestions: fetchAISuggestions,
    forceRefreshSuggestions,
    clearSuggestions,
    currentSuggestion
  } = useNoteSuggestions({
    enabled: aiEnabled,
    noteContent: plainTextContent,
    noteCategory
  });

  // Migrate content from plain text to HTML
  useEffect(() => {
    if (editor && content !== undefined) {
      const currentContent = editor.getHTML();
      
      // Check if we need to migrate from plain text
      if (content && content !== '<p></p>' && content !== currentContent) {
        // If content looks like plain text (no HTML tags), wrap it in a paragraph
        if (!content.includes('<') && !content.includes('>')) {
          const htmlContent = `<p>${content.replace(/\n/g, '</p><p>')}</p>`;
          editor.commands.setContent(htmlContent, false);
          setEditContent(htmlContent);
        } else {
          // Content is already HTML
          editor.commands.setContent(content, false);
          setEditContent(content);
        }
      }
    }
  }, [editor, content, setEditContent]);

  // Simplified word count tracking without problematic debouncing
  const currentWordCount = plainTextContent.trim().split(/\s+/).filter(word => word.length > 0).length;
  const shouldShowSuggestions = true; // Always show suggestions when available

  // Improved grammar correction for AI suggestions
  const fixSuggestionGrammar = useCallback((suggestion: string, context: string): string => {
    if (!suggestion) return suggestion;
    
    const trimmedContext = context.trim();
    
    // Simple and reliable logic: if context doesn't end with sentence punctuation, use lowercase
    const endsWithSentencePunctuation = /[.!?]\s*$/.test(trimmedContext);
    const isStartOfSentence = !trimmedContext || endsWithSentencePunctuation;
    
    let fixedSuggestion = suggestion;
    
    if (isStartOfSentence && fixedSuggestion.length > 0) {
      // Capitalize first letter at start of sentences
      fixedSuggestion = fixedSuggestion.charAt(0).toUpperCase() + fixedSuggestion.slice(1);
    } else if (!isStartOfSentence && fixedSuggestion.length > 0) {
      // Lowercase first letter in middle of sentences
      fixedSuggestion = fixedSuggestion.charAt(0).toLowerCase() + fixedSuggestion.slice(1);
    }
    
    logger.debug('tiptap', 'Grammar fix:', {
      context: `"${trimmedContext.slice(-15)}"`,
      suggestion: `"${suggestion.substring(0, 20)}"`,
      fixed: `"${fixedSuggestion.substring(0, 20)}"`,
      isStartOfSentence,
      endsWithSentencePunctuation
    });
    
    return fixedSuggestion;
  }, []);

  // Get current autocomplete suggestion with stabilization to prevent flashing
  const [stableSuggestion, setStableSuggestion] = useState<string | null>(null);
  const [lastContentLength, setLastContentLength] = useState(0);
  
  // Only update suggestion when content length changes (user typed/deleted)
  // This prevents constant re-evaluation that causes flashing
  useEffect(() => {
    if (plainTextContent.length !== lastContentLength) {
      // If user is actively typing (content increased), update suggestion immediately
      // Don't clear it to prevent flickering
      if (plainTextContent.length > lastContentLength) {
        // Update suggestion immediately to prevent disappearing
        const rawSuggestion = getSuggestionForInput(plainTextContent, cursorPosition);
        const newSuggestion = rawSuggestion ? fixSuggestionGrammar(rawSuggestion, plainTextContent) : null;
        setStableSuggestion(newSuggestion);
        setLastContentLength(plainTextContent.length);
      } else {
        // If user deleted content, update immediately
        const rawSuggestion = getSuggestionForInput(plainTextContent, cursorPosition);
        const newSuggestion = rawSuggestion ? fixSuggestionGrammar(rawSuggestion, plainTextContent) : null;
        setStableSuggestion(newSuggestion);
        setLastContentLength(plainTextContent.length);
      }
    }
  }, [plainTextContent.length, lastContentLength, getSuggestionForInput, fixSuggestionGrammar, plainTextContent, cursorPosition]);
  
  const currentAutocomplete = stableSuggestion;
  
  // Debug logging for Tab functionality
  logger.debug('tiptap', 'Tab Debug:', {
    currentAutocomplete: currentAutocomplete?.substring(0, 20),
    suggestionsAvailable: suggestions.length,
    plainTextLength: plainTextContent.length,
    willShowInline: isEditingContent && currentAutocomplete && aiEnabled && plainTextContent.trim().split(/\s+/).length >= 3
  });

  // Update editor's autocomplete storage with current state
  useEffect(() => {
    if (editor && editor.storage && typeof editor.storage.autocomplete === 'object') {
      logger.debug('tiptap', 'Updating editor autocomplete storage:', {
        suggestion: currentAutocomplete?.substring(0, 30),
        isEditingContent,
        willPassSuggestion: currentAutocomplete !== null,
        finalSuggestion: currentAutocomplete?.substring(0, 30) || 'null',
        storageExists: !!editor.storage.autocomplete,
        editorReady: editor.isEditable
      });

      // Update global storage (persists across editor recreations)
      const updateStorage = () => {
        // Update global storage - this persists even when editor is recreated
        globalAutocompleteStorage.suggestion = currentAutocomplete;
        globalAutocompleteStorage.triggerSuggestions = fetchAISuggestions;
        globalAutocompleteStorage.setSuggestionDebounce = (wordCount: number) => {
          logger.debug('tiptap', 'Setting suggestion tracking after accepting suggestion, word count:', wordCount);
          setLastAcceptedSuggestionLength(wordCount);
          
          // Clear note suggestion cache to force fresh suggestions for new context
          try {
            storage.removeByPrefix('note-suggestions-');
            logger.debug('tiptap', 'Cleared note suggestion cache after accepting suggestion');
          } catch (err) {
            logger.warn('Failed to clear note suggestion cache:', err);
          }
          
          // Clear current in-memory suggestions to prevent stale data
          logger.debug('tiptap', 'Clearing in-memory suggestions before refresh', {
            currentSuggestionsCount: suggestions.length,
            currentContinuationsCount: continuations.length,
            currentSuggestion: currentSuggestion?.substring(0, 30)
          });
          
          // Clear React state immediately to prevent stale suggestions
          if (clearSuggestions) {
            clearSuggestions();
          }
          
          // Immediately clear current autocomplete to prevent stale display
          globalAutocompleteStorage.suggestion = null;
          // Also clear the stable suggestion to prevent flashing
          setStableSuggestion(null);
          
          // Trigger fresh suggestions after a short delay
          if (forceRefreshSuggestions) {
            logger.debug('tiptap', 'Force refreshing suggestions after cache clear');
            setTimeout(() => {
              forceRefreshSuggestions();
            }, 300); // Small delay to let editor settle after insertion
          }
        };
        globalAutocompleteStorage.handleSave = () => {
          // Clear autosave timeout since we're manually saving
          if (autosaveTimeoutRef.current) {
            clearTimeout(autosaveTimeoutRef.current);
          }
          handleEditContent();
        };
        
        // Also update local storage for backward compatibility (but this might get reset)
        if (editor && editor.storage && editor.storage.autocomplete) {
          editor.storage.autocomplete = {
            suggestion: currentAutocomplete,
            triggerSuggestions: fetchAISuggestions,
            setSuggestionDebounce: globalAutocompleteStorage.setSuggestionDebounce,
            handleSave: globalAutocompleteStorage.handleSave,
          };
        }
        
        // Additional logging to verify storage was set correctly
        logger.debug('tiptap', 'Storage after update:', {
          globalSuggestion: globalAutocompleteStorage.suggestion?.substring(0, 30) || 'null',
          localSuggestion: editor?.storage?.autocomplete?.suggestion?.substring(0, 30) || 'null',
          hasGlobalStorage: !!globalAutocompleteStorage.suggestion,
          hasLocalStorage: !!editor?.storage?.autocomplete?.suggestion,
          isEditing: isEditingContent,
          timestamp: Date.now()
        });
      };

      // Update global storage immediately (no need to wait for local storage)
      updateStorage();
    }
  }, [editor, currentAutocomplete, fetchAISuggestions, handleEditContent]); // Removed isEditingContent from dependencies

  // Simplified debug logging for note autocomplete
  useEffect(() => {
    logger.debug('tiptap', 'Rich Note Autocomplete State:', {
      isEditingContent,
      aiEnabled,
      plainTextContent: plainTextContent.substring(0, 50) + (plainTextContent.length > 50 ? '...' : ''),
      cursorPosition,
      currentAutocomplete: currentAutocomplete?.substring(0, 30) + (currentAutocomplete && currentAutocomplete.length > 30 ? '...' : ''),
      suggestionsCount: suggestions.length,
      continuationsCount: continuations.length,
      wordCount: currentWordCount,
      shouldShow: isEditingContent && currentAutocomplete && plainTextContent.trim().split(/\s+/).length >= 3,
      firstSuggestion: suggestions[0]?.substring(0, 30),
      firstContinuation: continuations[0]?.substring(0, 30)
    });
  }, [isEditingContent, aiEnabled, plainTextContent, cursorPosition, currentAutocomplete, suggestions.length, continuations.length, suggestions, continuations]);

  // Show suggestion button when appropriate
  useEffect(() => {
    setShowSuggestionButton(
      aiEnabled && 
      isEditingContent && 
      (suggestions.length > 0 || continuations.length > 0 || currentSuggestion !== null)
    );
  }, [aiEnabled, isEditingContent, suggestions.length, continuations.length, currentSuggestion]);

  // Auto-enable editing mode when suggestions are available
  useEffect(() => {
    if (aiEnabled && !isEditingContent && (suggestions.length > 0 || currentAutocomplete)) {
      logger.debug('tiptap', 'Auto-enabling editing mode because suggestions are available');
      setIsEditingContent(true);
      // Also focus the editor to enable Tab capture
      if (editor) {
        editor.commands.focus();
      }
    }
  }, [aiEnabled, isEditingContent, suggestions.length, currentAutocomplete, editor, setIsEditingContent]);

  // Handle clicks on the editor container to focus
  const handleEditorClick = useCallback((e: React.MouseEvent) => {
    if (editor) {
      // Always ensure editing mode and focus when clicking editor
      if (!isEditingContent) {
        logger.debug('tiptap', 'Enabling editing mode and focusing editor on click');
        setIsEditingContent(true);
      }
      // Always focus the editor on click
      editor.commands.focus();
    }
  }, [editor, isEditingContent, setIsEditingContent]);

  // Click outside handling
  useEffect(() => {
    if (!isEditingContent) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside the editor area
      const editorElement = editor?.view.dom;
      const toolbarElement = document.querySelector('[data-rich-text-toolbar]');
      
      if (
        editorElement && 
        !editorElement.contains(event.target as Node) &&
        (!toolbarElement || !toolbarElement.contains(event.target as Node))
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
  }, [isEditingContent, handleEditContent, editor]);

  // Cleanup autosave timeout on component unmount to prevent stale calls
  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current) {
        logger.debug('tiptap', 'Cleaning up autosave timeout on component unmount');
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, []);

  if (!editor) {
    return <div className="p-4">Loading editor...</div>;
  }

  return (
    <div 
      className="flex flex-col h-full relative"
      data-rich-text-editor
      tabIndex={-1}
    >
      {/* Toolbar - always visible for better UX */}
      <div data-rich-text-toolbar className="flex-shrink-0">
        <RichTextToolbar editor={editor} />
      </div>

      {/* Main Editor Content - takes remaining space but leaves room for footer */}
      <div 
        className="flex-1 relative cursor-text overflow-hidden"
        onClick={handleEditorClick}
        style={{ 
          paddingBottom: updatedAt ? '36px' : '8px' // Reserve space for footer (responsive)
        }}
      >
        {/* Editor Content - Always editable */}
        <div className="relative h-full">
          <EditorContent
            editor={editor}
            className={`prose prose-sm max-w-none h-full p-3 focus-within:outline-none cursor-text overflow-y-auto ${
              isLight ? 'prose-gray' : 'prose-invert'
            }`}
            style={{
              borderColor: noteColor,
              minHeight: '120px',
              color: isLight ? '#374151' : '#e5e7eb'
            }}
          />

          {/* AI Suggestion Overlay - GitHub Copilot style - simplified condition */}
          {isEditingContent && currentAutocomplete && aiEnabled && plainTextContent.trim().split(/\s+/).length >= 3 && (
            <style>
              {`
                .ProseMirror p:last-child::after {
                  content: "${currentAutocomplete.replace(/"/g, '\\"')}";
                  color: #9CA3AF;
                  font-style: italic;
                  opacity: 0.7;
                  pointer-events: none;
                }
              `}
            </style>
          )}

          {/* Hidden measurement div for text width calculation */}
          <div 
            ref={measureRef}
            className="absolute opacity-0 pointer-events-none prose prose-sm max-w-none"
            style={{
              fontFamily: 'inherit',
              fontSize: '14px',
              lineHeight: '20px',
              padding: '12px',
              whiteSpace: 'pre-wrap',
              top: 0,
              left: 0
            }}
          >
            {plainTextContent}
          </div>
        </div>
      </div>

      {/* Footer with Last edited and AI sparkle - Always visible at bottom */}
      {updatedAt && (
        <div
          className="absolute bottom-0 left-0 right-0 flex-shrink-0 px-2 md:px-3 py-1 md:py-2"
          style={{
            borderTop: `1px solid ${noteColor}33`,
            backgroundColor: isLight ? '#ffffff' : '#1e293b',
            fontSize: '10px'
          }}
        >
          <div className="flex items-center justify-between">
            <div
              className={`${isLight ? 'text-gray-500' : 'text-gray-400'} truncate text-xs md:text-xs`}
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
    </div>
  );
};