'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Callout } from './extensions/CalloutExtension';
import { Badge } from './extensions/BadgeExtension';
import { useEffect, useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    List,
    ListOrdered,
    Type,
    AlignLeft,
    AlignCenter,
    AlignRight,
    Quote,
    Link as LinkIcon,
    X,
    Minus,
    AlertCircle,
    MousePointerClick,
    Palette,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    minHeight?: string;
    disabled?: boolean;
}

/**
 * Rich Text Editor for email composition
 * Features: Bold, Italic, Underline, Headings, Lists, Alignment, Quotes, Links,
 *           Horizontal Dividers, Callout Boxes, CTA Buttons
 */
export function RichTextEditor({
    value = '',
    onChange,
    placeholder = 'Write your message...',
    minHeight = '200px',
    disabled = false,
}: RichTextEditorProps) {
    const [showHeadingOptions, setShowHeadingOptions] = useState(false);
    const [showLinkInput, setShowLinkInput] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [showCalloutOptions, setShowCalloutOptions] = useState(false);
    const [showButtonInput, setShowButtonInput] = useState(false);
    const [buttonText, setButtonText] = useState('');
    const [buttonUrl, setButtonUrl] = useState('');
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const isUpdatingFromProps = useRef(false);

    const handleUpdate = useCallback(({ editor }: { editor: any }) => {
        if (isUpdatingFromProps.current) {
            isUpdatingFromProps.current = false;
            return;
        }
        const html = editor.getHTML();
        onChange(html);
    }, [onChange]);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                horizontalRule: {
                    HTMLAttributes: {
                        class: 'email-divider',
                    },
                },
            }),
            Underline.configure({
                HTMLAttributes: {
                    class: 'underline',
                },
            }).extend({
                name: 'customUnderline',
            }),
            TextAlign.configure({
                types: ['heading', 'paragraph'],
                defaultAlignment: 'left',
            }),
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    rel: 'noopener noreferrer',
                    target: '_blank',
                },
            }).extend({
                name: 'customLink',
            }),
            Placeholder.configure({
                placeholder,
                emptyEditorClass: 'is-editor-empty',
            }),
            Callout,
            Badge,
        ],
        content: value,
        editorProps: {
            attributes: {
                class: 'prose prose-sm focus:outline-none max-w-full',
            },
        },
        onUpdate: handleUpdate,
        editable: !disabled,
        immediatelyRender: false,
    });

    // Sync content from props
    useEffect(() => {
        if (editor && !editor.isDestroyed && value !== editor.getHTML()) {
            isUpdatingFromProps.current = true;
            editor.commands.setContent(value || '<p></p>');
        }
    }, [value, editor]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (editorContainerRef.current && !editorContainerRef.current.contains(event.target as Node)) {
                setShowHeadingOptions(false);
                setShowLinkInput(false);
                setShowCalloutOptions(false);
                setShowButtonInput(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const applyHeading = (level: 1 | 2 | 3) => {
        if (!editor) return;
        editor.chain().focus().toggleHeading({ level }).run();
        setShowHeadingOptions(false);
    };

    const clearHeading = () => {
        if (!editor) return;
        editor.chain().focus().setParagraph().run();
        setShowHeadingOptions(false);
    };

    const handleSetLink = () => {
        if (!editor) return;
        if (linkUrl) {
            editor.chain().focus().setLink({ href: linkUrl }).run();
        } else {
            editor.chain().focus().unsetLink().run();
        }
        setShowLinkInput(false);
        setLinkUrl('');
    };

    // Insert a callout box with specified variant
    const insertCallout = (variant: 'info' | 'warning' | 'success' | 'slate') => {
        if (!editor) return;

        editor.chain()
            .focus()
            .insertContent({
                type: 'callout',
                attrs: { variant },
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Enter callout content here...' }],
                    },
                ],
            })
            .run();
        setShowCalloutOptions(false);
    };

    // Insert a CTA button
    const insertButton = () => {
        if (!editor || !buttonText.trim()) return;

        const url = buttonUrl.trim() || '#';
        const buttonHtml = `<p><a href="${url}" class="button-primary">${buttonText}</a></p>`;
        editor.chain().focus().insertContent(buttonHtml).run();
        setShowButtonInput(false);
        setButtonText('');
        setButtonUrl('');
    };

    // Insert a badge/label
    const insertBadge = (variant: 'blue' | 'amber' | 'red' | 'slate' | 'green') => {
        if (!editor) return;

        if (!editor.state.selection.empty) {
            // If text is selected, apply badge mark to it
            editor.chain().focus().setBadge({ variant }).run();
        } else {
            // If no selection, insert badge text with mark
            editor.chain()
                .focus()
                .insertContent({
                    type: 'text',
                    text: 'BADGE TEXT',
                    marks: [{ type: 'badge', attrs: { variant } }],
                })
                .run();
        }
    };

    const ToolbarButton = ({
        onClick,
        isActive,
        title,
        children
    }: {
        onClick: () => void;
        isActive?: boolean;
        title: string;
        children: React.ReactNode;
    }) => (
        <button
            onClick={onClick}
            className={cn(
                'p-2 rounded transition-colors',
                isActive ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800'
            )}
            title={title}
            type="button"
            disabled={disabled}
        >
            {children}
        </button>
    );

    return (
        <div className="w-full" ref={editorContainerRef}>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5 p-2 border border-slate-200 dark:border-slate-700 rounded-t-md bg-slate-50 dark:bg-slate-800">
                {/* Text formatting */}
                <ToolbarButton
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                    isActive={editor?.isActive('bold')}
                    title="Bold (Ctrl+B)"
                >
                    <Bold size={16} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                    isActive={editor?.isActive('italic')}
                    title="Italic (Ctrl+I)"
                >
                    <Italic size={16} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor?.chain().focus().toggleUnderline().run()}
                    isActive={editor?.isActive('underline')}
                    title="Underline (Ctrl+U)"
                >
                    <UnderlineIcon size={16} />
                </ToolbarButton>

                <div className="ml-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />

                {/* Heading dropdown */}
                <div className="relative">
                    <ToolbarButton
                        onClick={() => setShowHeadingOptions(!showHeadingOptions)}
                        isActive={editor?.isActive('heading')}
                        title="Heading"
                    >
                        <Type size={16} />
                    </ToolbarButton>

                    {showHeadingOptions && (
                        <div className="absolute top-full left-0 mt-1 w-40 bg-white dark:bg-slate-900 rounded-md shadow-lg z-50 border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <button
                                onClick={() => applyHeading(1)}
                                className={cn(
                                    'p-2 w-full text-left text-lg font-bold hover:bg-slate-100 dark:hover:bg-slate-800',
                                    editor?.isActive('heading', { level: 1 }) && 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                )}
                            >
                                Heading 1
                            </button>
                            <button
                                onClick={() => applyHeading(2)}
                                className={cn(
                                    'p-2 w-full text-left text-base font-semibold hover:bg-slate-100 dark:hover:bg-slate-800',
                                    editor?.isActive('heading', { level: 2 }) && 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                )}
                            >
                                Heading 2
                            </button>
                            <button
                                onClick={() => applyHeading(3)}
                                className={cn(
                                    'p-2 w-full text-left text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800',
                                    editor?.isActive('heading', { level: 3 }) && 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                )}
                            >
                                Heading 3
                            </button>
                            <button
                                onClick={clearHeading}
                                className={cn(
                                    'p-2 w-full text-left border-t border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800',
                                    !editor?.isActive('heading') && 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                )}
                            >
                                Paragraph
                            </button>
                        </div>
                    )}
                </div>

                <div className="ml-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />

                {/* Lists */}
                <ToolbarButton
                    onClick={() => editor?.chain().focus().toggleBulletList().run()}
                    isActive={editor?.isActive('bulletList')}
                    title="Bullet List"
                >
                    <List size={16} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                    isActive={editor?.isActive('orderedList')}
                    title="Numbered List"
                >
                    <ListOrdered size={16} />
                </ToolbarButton>

                <div className="ml-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />

                {/* Alignment */}
                <ToolbarButton
                    onClick={() => editor?.commands.setTextAlign('left')}
                    isActive={editor?.isActive({ textAlign: 'left' })}
                    title="Align Left"
                >
                    <AlignLeft size={16} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor?.commands.setTextAlign('center')}
                    isActive={editor?.isActive({ textAlign: 'center' })}
                    title="Align Center"
                >
                    <AlignCenter size={16} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor?.commands.setTextAlign('right')}
                    isActive={editor?.isActive({ textAlign: 'right' })}
                    title="Align Right"
                >
                    <AlignRight size={16} />
                </ToolbarButton>

                <div className="ml-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />

                {/* Quote */}
                <ToolbarButton
                    onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                    isActive={editor?.isActive('blockquote')}
                    title="Quote"
                >
                    <Quote size={16} />
                </ToolbarButton>

                {/* Horizontal Divider */}
                <ToolbarButton
                    onClick={() => editor?.chain().focus().setHorizontalRule().run()}
                    title="Horizontal Divider"
                >
                    <Minus size={16} />
                </ToolbarButton>

                {/* Link button */}
                <div className="relative">
                    <ToolbarButton
                        onClick={() => {
                            if (!editor) return;
                            const hasSelection = !editor.state.selection.empty;
                            if (hasSelection || editor.isActive('link')) {
                                setShowLinkInput(!showLinkInput);
                                if (editor.isActive('link')) {
                                    setLinkUrl(editor.getAttributes('link').href || '');
                                }
                            }
                        }}
                        isActive={editor?.isActive('link')}
                        title="Link (Ctrl+K)"
                    >
                        <LinkIcon size={16} />
                    </ToolbarButton>

                    {showLinkInput && (
                        <div className="absolute top-full right-0 mt-1 w-64 p-3 bg-white dark:bg-slate-900 rounded-md shadow-lg z-50 border border-slate-200 dark:border-slate-700">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Link URL</p>
                            <Input
                                type="url"
                                placeholder="https://example.com"
                                value={linkUrl}
                                onChange={(e) => setLinkUrl(e.target.value)}
                                className="mb-2"
                                onKeyDown={(e) => e.key === 'Enter' && handleSetLink()}
                            />
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={handleSetLink}
                                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                                >
                                    Apply
                                </button>
                                <button
                                    onClick={() => setShowLinkInput(false)}
                                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                            {editor?.isActive('link') && (
                                <button
                                    onClick={() => {
                                        editor?.chain().focus().unsetLink().run();
                                        setShowLinkInput(false);
                                    }}
                                    className="mt-2 text-red-600 text-sm hover:underline"
                                >
                                    Remove link
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="ml-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />

                {/* Callout Box dropdown */}
                <div className="relative">
                    <ToolbarButton
                        onClick={() => setShowCalloutOptions(!showCalloutOptions)}
                        title="Insert Callout Box"
                    >
                        <AlertCircle size={16} />
                    </ToolbarButton>

                    {showCalloutOptions && (
                        <div className="absolute top-full left-0 mt-1 w-44 bg-white dark:bg-slate-900 rounded-md shadow-lg z-50 border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <button
                                onClick={() => insertCallout('info')}
                                className="p-2 w-full text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                            >
                                <span className="w-3 h-3 rounded bg-blue-500"></span>
                                Info (Blue)
                            </button>
                            <button
                                onClick={() => insertCallout('warning')}
                                className="p-2 w-full text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                            >
                                <span className="w-3 h-3 rounded bg-amber-500"></span>
                                Warning (Amber)
                            </button>
                            <button
                                onClick={() => insertCallout('success')}
                                className="p-2 w-full text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                            >
                                <span className="w-3 h-3 rounded bg-green-500"></span>
                                Success (Green)
                            </button>
                            <button
                                onClick={() => insertCallout('slate')}
                                className="p-2 w-full text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                            >
                                <span className="w-3 h-3 rounded bg-slate-400"></span>
                                Info (Slate)
                            </button>
                        </div>
                    )}
                </div>

                {/* CTA Button */}
                <div className="relative">
                    <ToolbarButton
                        onClick={() => setShowButtonInput(!showButtonInput)}
                        title="Insert CTA Button"
                    >
                        <MousePointerClick size={16} />
                    </ToolbarButton>

                    {showButtonInput && (
                        <div className="absolute top-full right-0 mt-1 w-64 p-3 bg-white dark:bg-slate-900 rounded-md shadow-lg z-50 border border-slate-200 dark:border-slate-700">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Insert Button</p>
                            <Input
                                type="text"
                                placeholder="Button text"
                                value={buttonText}
                                onChange={(e) => setButtonText(e.target.value)}
                                className="mb-2"
                            />
                            <Input
                                type="url"
                                placeholder="https://example.com"
                                value={buttonUrl}
                                onChange={(e) => setButtonUrl(e.target.value)}
                                className="mb-2"
                                onKeyDown={(e) => e.key === 'Enter' && insertButton()}
                            />
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={insertButton}
                                    disabled={!buttonText.trim()}
                                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Insert
                                </button>
                                <button
                                    onClick={() => setShowButtonInput(false)}
                                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Badge/Label dropdown */}
                <div className="relative">
                    <ToolbarButton
                        onClick={() => {
                            if (!editor) return;
                            insertBadge('blue');
                        }}
                        title="Insert Badge (select text first for custom text)"
                    >
                        <Palette size={16} />
                    </ToolbarButton>
                </div>
            </div>

            {/* Editor Content */}
            <div
                className={cn(
                    'p-4 border border-t-0 border-slate-200 dark:border-slate-700 rounded-b-md bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200',
                    // Headings
                    '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3',
                    '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2',
                    '[&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2',
                    '[&_p]:mb-2',
                    // Lists
                    '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2',
                    '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2',
                    // Links
                    '[&_a]:text-blue-600 [&_a]:underline [&_a:hover]:text-blue-700',
                    // Blockquotes
                    '[&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-500',
                    // Horizontal rule
                    '[&_hr]:border-t [&_hr]:border-slate-300 [&_hr]:my-4',
                    // Callout boxes (editor preview styles)
                    '[&_.callout-info]:bg-blue-50 [&_.callout-info]:border [&_.callout-info]:border-blue-200 [&_.callout-info]:rounded-lg [&_.callout-info]:p-4 [&_.callout-info]:my-3',
                    '[&_.callout-warning]:bg-amber-50 [&_.callout-warning]:border [&_.callout-warning]:border-amber-200 [&_.callout-warning]:rounded-lg [&_.callout-warning]:p-4 [&_.callout-warning]:my-3',
                    '[&_.callout-success]:bg-green-50 [&_.callout-success]:border [&_.callout-success]:border-green-200 [&_.callout-success]:rounded-lg [&_.callout-success]:p-4 [&_.callout-success]:my-3',
                    '[&_.callout-slate]:bg-slate-100 [&_.callout-slate]:border [&_.callout-slate]:border-slate-300 [&_.callout-slate]:rounded-lg [&_.callout-slate]:p-4 [&_.callout-slate]:my-3',
                    // Buttons (editor preview styles)
                    '[&_.button-primary]:inline-block [&_.button-primary]:bg-blue-600 [&_.button-primary]:text-white [&_.button-primary]:px-6 [&_.button-primary]:py-3 [&_.button-primary]:rounded-lg [&_.button-primary]:font-semibold [&_.button-primary]:no-underline [&_.button-primary]:cursor-pointer [&_.button-primary]:hover:bg-blue-700 [&_.button-primary]:hover:text-white',
                    // Badges (editor preview styles)
                    '[&_.badge-blue]:inline [&_.badge-blue]:bg-blue-100 [&_.badge-blue]:text-blue-700 [&_.badge-blue]:text-xs [&_.badge-blue]:font-semibold [&_.badge-blue]:px-2 [&_.badge-blue]:py-1 [&_.badge-blue]:rounded [&_.badge-blue]:uppercase [&_.badge-blue]:tracking-wide',
                    '[&_.badge-amber]:inline [&_.badge-amber]:bg-amber-100 [&_.badge-amber]:text-amber-700 [&_.badge-amber]:text-xs [&_.badge-amber]:font-semibold [&_.badge-amber]:px-2 [&_.badge-amber]:py-1 [&_.badge-amber]:rounded [&_.badge-amber]:uppercase [&_.badge-amber]:tracking-wide',
                    '[&_.badge-red]:inline [&_.badge-red]:bg-red-100 [&_.badge-red]:text-red-700 [&_.badge-red]:text-xs [&_.badge-red]:font-semibold [&_.badge-red]:px-2 [&_.badge-red]:py-1 [&_.badge-red]:rounded [&_.badge-red]:uppercase [&_.badge-red]:tracking-wide',
                    '[&_.badge-slate]:inline [&_.badge-slate]:bg-slate-100 [&_.badge-slate]:text-slate-700 [&_.badge-slate]:text-xs [&_.badge-slate]:font-semibold [&_.badge-slate]:px-2 [&_.badge-slate]:py-1 [&_.badge-slate]:rounded [&_.badge-slate]:uppercase [&_.badge-slate]:tracking-wide',
                    '[&_.badge-green]:inline [&_.badge-green]:bg-green-100 [&_.badge-green]:text-green-700 [&_.badge-green]:text-xs [&_.badge-green]:font-semibold [&_.badge-green]:px-2 [&_.badge-green]:py-1 [&_.badge-green]:rounded [&_.badge-green]:uppercase [&_.badge-green]:tracking-wide',
                    // Placeholder
                    '[&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child]:before:text-slate-400 [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:pointer-events-none'
                )}
                style={{ minHeight }}
            >
                {/* @ts-ignore - TipTap EditorContent has React 18 type compatibility issues */}
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}

export default RichTextEditor;
