import React, { useCallback, useEffect, useRef } from 'react';
import '@/styles/tiptap-editor.css';
import { Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import TextStyle from '@tiptap/extension-text-style';
import { Sparkles } from 'lucide-react';
import { RichTextToolbar } from './RichTextToolbar';
import { SuggestionActions } from '@/components/ai/SuggestionActions';
import { SaveStatus } from '@/components/ui/save-status';
import { useNoteSuggestions } from '../../hooks/use-note-suggestions';
import { formatRelativeTime } from '../../utils/timeUtils';
import { useAISuggest } from '@/context/AISuggestContext';
import { useAutosave } from '@/hooks/useAutosave';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import logger from '@/lib/logger';
import { migrateNoteContentToHtml, shouldApplyExternalNoteHtml } from './noteEditorHtml';
import { formatNoteSuggestion } from './noteSuggestionText';
import { AutocompleteExtension, type AutocompleteStorage } from './autocompleteStorage';

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
  noteCategory,
  noteColor = '#FFFFE0',
  noteId,
  onAutoSave,
  updatedAt
}) => {
  const isUpdatingFromProps = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  
  // Use global AI enabled state from context
  const { aiEnabled } = useAISuggest();

  const {
    state: saveState,
    flush: flushAutosave,
    retry: retryAutosave,
    hasUnsavedChanges,
  } = useAutosave({
    value: editContent,
    savedValue: content,
    onSave: onAutoSave,
    enabled: isEditingContent,
    delay: 1000,
  });

  useUnsavedChangesGuard({
    when: hasUnsavedChanges || saveState === 'saving',
    message: 'This note still has unsaved changes. Leave this page anyway?',
  });

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
            class: 'note-blockquote',
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
      if (isUpdatingFromProps.current) {
        return;
      }
      const htmlContent = editor.getHTML();
      setEditContent(htmlContent);
      
      if (!isEditingContent) {
        logger.debug('tiptap', 'Auto-enabling editing mode because content changed');
        setIsEditingContent(true);
      }
    },
  });

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
    getSuggestionForInput, 
    triggerSuggestions: fetchAISuggestions,
    forceRefreshSuggestions,
    clearSuggestions,
    isLoading: isLoadingSuggestions,
    error: suggestionError,
  } = useNoteSuggestions({
    enabled: aiEnabled && isEditingContent,
    noteContent: plainTextContent,
    noteCategory
  });

  // Migrate content from plain text to HTML
  useEffect(() => {
    if (!editor || content === undefined) {
      return;
    }
    const incomingHtml = migrateNoteContentToHtml(content);
    if (!shouldApplyExternalNoteHtml({
      isFocused: editor.isFocused,
      isUpdatingFromProps: isUpdatingFromProps.current,
      currentHtml: editor.getHTML(),
      incomingHtml,
    })) {
      return;
    }
    isUpdatingFromProps.current = true;
    editor.commands.setContent(incomingHtml, false);
    setEditContent(incomingHtml);
    isUpdatingFromProps.current = false;
  }, [editor, content, setEditContent]);

  const currentWordCount = plainTextContent.trim().split(/\s+/).filter(word => word.length > 0).length;
  const rawAutocomplete = getSuggestionForInput(plainTextContent, cursorPosition);
  const currentAutocomplete = rawAutocomplete
    ? formatNoteSuggestion(rawAutocomplete, plainTextContent)
    : null;

  const dismissSuggestion = useCallback(() => {
    clearSuggestions();
    const autocomplete = editor?.storage.autocomplete as AutocompleteStorage | undefined;
    if (autocomplete) autocomplete.suggestion = null;
  }, [clearSuggestions, editor]);

  const acceptCurrentSuggestion = useCallback(() => {
    if (!editor || !currentAutocomplete) return;
    const insertion = formatNoteSuggestion(currentAutocomplete, editor.getText());
    if (!insertion) return;
    editor.chain().focus().insertContent(insertion).run();
    dismissSuggestion();
  }, [currentAutocomplete, dismissSuggestion, editor]);

  const regenerateSuggestion = useCallback(() => {
    dismissSuggestion();
    forceRefreshSuggestions();
  }, [dismissSuggestion, forceRefreshSuggestions]);

  // Update editor's autocomplete storage with current state
  useEffect(() => {
    const autocomplete = editor?.storage.autocomplete as AutocompleteStorage | undefined;
    if (!autocomplete) return;
    autocomplete.suggestion = currentAutocomplete;
    autocomplete.triggerSuggestions = fetchAISuggestions;
    autocomplete.acceptSuggestion = acceptCurrentSuggestion;
    return () => {
      autocomplete.suggestion = null;
      autocomplete.triggerSuggestions = null;
      autocomplete.acceptSuggestion = null;
    };
  }, [acceptCurrentSuggestion, currentAutocomplete, editor, fetchAISuggestions]);

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
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        void flushAutosave().then((saved) => {
          if (saved) setIsEditingContent(false);
        });
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isEditingContent, editor, flushAutosave, setIsEditingContent]);

  if (!editor) {
    return <div className="p-4">Loading editor...</div>;
  }

  return (
    <div 
      ref={rootRef}
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
        className={`flex-1 relative cursor-text overflow-hidden ${
          isEditingContent && aiEnabled && (currentAutocomplete || isLoadingSuggestions || suggestionError)
            ? 'pb-32 md:pb-9'
            : updatedAt || saveState !== 'idle'
              ? 'pb-9'
              : 'pb-2'
        }`}
        onClick={handleEditorClick}
      >
        {/* Editor Content - Always editable */}
        <div className="relative h-full">
          <EditorContent
            editor={editor}
            className="prose prose-sm max-w-none h-full p-3 focus-within:outline-none cursor-text overflow-y-auto text-foreground"
            style={{
              borderColor: noteColor,
              minHeight: '120px',
            }}
          />

          {isEditingContent && currentAutocomplete && aiEnabled && plainTextContent.trim().split(/\s+/).length >= 3 && (
            <div
              className="pointer-events-none absolute inset-0 hidden overflow-hidden p-3 text-sm leading-relaxed text-muted-foreground md:block"
              aria-hidden
            >
              <span className="invisible whitespace-pre-wrap">{plainTextContent}</span>
              <span className="italic opacity-70">{currentAutocomplete}</span>
            </div>
          )}

        </div>
      </div>

      {isEditingContent && aiEnabled && (
        <>
          <div className={`absolute left-2 right-2 z-20 md:hidden ${updatedAt || saveState !== 'idle' ? 'bottom-8' : 'bottom-2'}`}>
            <SuggestionActions
              suggestion={currentWordCount >= 3 ? currentAutocomplete : null}
              isLoading={isLoadingSuggestions}
              error={suggestionError}
              onAccept={acceptCurrentSuggestion}
              onDismiss={dismissSuggestion}
              onRegenerate={regenerateSuggestion}
            />
          </div>
          <div className={`absolute left-2 right-2 z-20 hidden md:block ${updatedAt || saveState !== 'idle' ? 'bottom-8' : 'bottom-2'}`}>
            <SuggestionActions
              isLoading={isLoadingSuggestions}
              error={suggestionError}
              onAccept={acceptCurrentSuggestion}
              onDismiss={dismissSuggestion}
              onRegenerate={regenerateSuggestion}
            />
          </div>
        </>
      )}

      {/* Footer with persistence state and last edited time */}
      {(updatedAt || saveState !== 'idle') && (
        <div
          className="absolute bottom-0 left-0 right-0 flex-shrink-0 px-2 md:px-3 py-1 md:py-2"
          style={{
            borderTop: `1px solid ${noteColor}33`,
            backgroundColor: 'hsl(var(--card))',
            fontSize: '10px'
          }}
        >
          <div className="flex items-center justify-between">
            {saveState !== 'idle' ? (
              <SaveStatus state={saveState} onRetry={() => { void retryAutosave(); }} />
            ) : updatedAt ? (
              <div
                className="text-muted-foreground truncate text-xs md:text-xs"
                style={{
                  fontFamily: '"Raleway", sans-serif',
                  fontSize: 'inherit'
                }}
              >
                <span className="hidden sm:inline">Last edited: </span>
                <span className="sm:hidden">Edited: </span>
                {formatRelativeTime(updatedAt)}
              </div>
            ) : null}
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
