import React from 'react';
import { Editor } from '@tiptap/react';
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Type,
  Quote,
  AtSign
} from 'lucide-react';
import { cn } from "@/lib/utils";

interface RichTextToolbarProps {
  editor: Editor | null;
  className?: string;
}

/** One class set for every toolbar toggle: the app's primary blue when on, the accent hover when off. */
const toggleClass = (active: boolean) =>
  cn(
    'h-8 w-8 p-0 text-foreground',
    active
      ? 'bg-blue-600 interaction-button--primary text-white hover:bg-blue-600 hover:text-white data-[state=on]:bg-blue-600 data-[state=on]:text-white'
      : 'bg-transparent hover:bg-accent hover:text-accent-foreground',
  );

export const RichTextToolbar: React.FC<RichTextToolbarProps> = ({
  editor,
  className
}) => {
  if (!editor) return null;

  // Helper function to get current heading level
  const getCurrentHeading = () => {
    // Always check the current cursor position/block type
    if (editor.isActive('heading', { level: 1 })) return '1';
    if (editor.isActive('heading', { level: 2 })) return '2';
    if (editor.isActive('heading', { level: 3 })) return '3';
    return 'paragraph';
  };

  // Helper function to get current alignment
  const getCurrentAlignment = () => {
    if (editor.isActive({ textAlign: 'left' })) return 'left';
    if (editor.isActive({ textAlign: 'center' })) return 'center';
    if (editor.isActive({ textAlign: 'right' })) return 'right';
    return 'left'; // default
  };
  const alignment = getCurrentAlignment();

  return (
    <div
      className={cn(
        "flex items-center flex-wrap gap-2 p-2 border-b border-border bg-muted",
        "md:gap-3", // Larger gaps on desktop
        className
      )}
    >
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Heading Dropdown */}
        <Select
          value={getCurrentHeading()}
          onValueChange={(value) => {
            const { from, to } = editor.state.selection;
            const hasSelection = from !== to;

            if (hasSelection) {
              // APPLE-STYLE: Only affect selected text, leave everything else unchanged
              const selectedText = editor.state.doc.textBetween(from, to, ' ');

              if (value === 'paragraph') {
                editor.chain()
                  .focus()
                  .deleteSelection()
                  .insertContent(`<p>${selectedText}</p>`)
                  .run();
              } else {
                const level = parseInt(value) as 1 | 2 | 3;
                editor.chain()
                  .focus()
                  .deleteSelection()
                  .insertContent(`<h${level}>${selectedText}</h${level}>`)
                  .run();
              }
            } else {
              // NO SELECTION: Only affect NEW text input going forward
              // Don't change any existing text, just set the format for new typing

              if (value === 'paragraph') {
                // Set paragraph as the format for new text input
                editor.chain()
                  .focus()
                  .splitBlock() // Create new line
                  .setParagraph() // Set new line as paragraph
                  .run();
              } else {
                const level = parseInt(value) as 1 | 2 | 3;
                // Set heading as the format for new text input
                editor.chain()
                  .focus()
                  .splitBlock() // Create new line
                  .setHeading({ level }) // Set new line as heading
                  .run();
              }
            }
          }}
        >
          <SelectTrigger className="w-20 md:w-24 h-8 text-xs bg-background border-border text-foreground">
            <Type className="h-3 w-3 md:hidden" />
            <SelectValue className="hidden md:inline" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="paragraph">Normal</SelectItem>
            <SelectItem value="1">H1</SelectItem>
            <SelectItem value="2">H2</SelectItem>
            <SelectItem value="3">H3</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Text Style Controls */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label="Mention a client"
          title="Mention a client (@)"
          onClick={() => editor.chain().focus().insertContent('@').run()}
        >
          <AtSign className="h-3 w-3 md:h-4 md:w-4" />
        </Button>
        <ToggleGroup
          type="multiple"
          value={[
            editor.isActive('bold') ? 'bold' : '',
            editor.isActive('italic') ? 'italic' : '',
            editor.isActive('underline') ? 'underline' : '',
            editor.isActive('strike') ? 'strike' : '',
          ].filter(Boolean)}
          className="flex gap-0 md:gap-1"
        >
          <ToggleGroupItem
            value="bold"
            size="sm"
            aria-label="Bold"
            className={toggleClass(editor.isActive('bold'))}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-3 w-3 md:h-4 md:w-4" />
          </ToggleGroupItem>

          <ToggleGroupItem
            value="italic"
            size="sm"
            aria-label="Italic"
            className={toggleClass(editor.isActive('italic'))}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-3 w-3 md:h-4 md:w-4" />
          </ToggleGroupItem>

          <ToggleGroupItem
            value="underline"
            size="sm"
            aria-label="Underline"
            className={toggleClass(editor.isActive('underline'))}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline className="h-3 w-3 md:h-4 md:w-4" />
          </ToggleGroupItem>

          <ToggleGroupItem
            value="strike"
            size="sm"
            aria-label="Strikethrough"
            className={toggleClass(editor.isActive('strike'))}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="h-3 w-3 md:h-4 md:w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Alignment Controls */}
        <ToggleGroup
          type="single"
          value={alignment}
          onValueChange={(value) => {
            if (value) editor.chain().focus().setTextAlign(value).run();
          }}
          className="flex gap-0 md:gap-1"
        >
          <ToggleGroupItem value="left" size="sm" aria-label="Align left" className={toggleClass(alignment === 'left')}>
            <AlignLeft className="h-3 w-3 md:h-4 md:w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" size="sm" aria-label="Align center" className={toggleClass(alignment === 'center')}>
            <AlignCenter className="h-3 w-3 md:h-4 md:w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" size="sm" aria-label="Align right" className={toggleClass(alignment === 'right')}>
            <AlignRight className="h-3 w-3 md:h-4 md:w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {/* List Controls */}
        <div className="flex gap-0 md:gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Bulleted list"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={toggleClass(editor.isActive('bulletList'))}
          >
            <List className="h-3 w-3 md:h-4 md:w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Numbered list"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={toggleClass(editor.isActive('orderedList'))}
          >
            <ListOrdered className="h-3 w-3 md:h-4 md:w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Quote"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={toggleClass(editor.isActive('blockquote'))}
          >
            <Quote className="h-3 w-3 md:h-4 md:w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
