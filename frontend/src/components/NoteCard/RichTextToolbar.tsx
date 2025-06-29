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
  Quote
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { useTheme } from 'next-themes';

interface RichTextToolbarProps {
  editor: Editor | null;
  className?: string;
}

export const RichTextToolbar: React.FC<RichTextToolbarProps> = ({
  editor,
  className
}) => {
  if (!editor) return null;

  // Get theme for styling
  const { theme } = useTheme();
  const isLight = theme === 'light';

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

  return (
    <div
      className={cn(
        "flex items-center flex-wrap gap-2 p-2 border-b",
        "md:gap-3", // Larger gaps on desktop
        className
      )}
      style={{
        backgroundColor: isLight ? '#f9fafb' : '#334155',
        borderBottomColor: isLight ? '#e5e7eb' : '#475569'
      }}
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
          <SelectTrigger
            className="w-20 md:w-24 h-8 text-xs"
            style={{
              backgroundColor: isLight ? 'white' : '#475569',
              borderColor: isLight ? '#d1d5db' : '#64748b',
              color: isLight ? '#374151' : '#e5e7eb'
            }}
          >
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
            className="h-8 w-8 p-0"
            onClick={() => editor.chain().focus().toggleBold().run()}
            style={{
              backgroundColor: editor.isActive('bold') ? '#2563eb' : 'transparent',
              color: editor.isActive('bold') ? 'white' : (isLight ? '#374151' : '#e5e7eb')
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('bold')) {
                e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#475569';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('bold')) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <Bold className="h-3 w-3 md:h-4 md:w-4" />
          </ToggleGroupItem>

          <ToggleGroupItem
            value="italic"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            style={{
              backgroundColor: editor.isActive('italic') ? '#2563eb' : 'transparent',
              color: editor.isActive('italic') ? 'white' : (isLight ? '#374151' : '#e5e7eb')
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('italic')) {
                e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#475569';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('italic')) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <Italic className="h-3 w-3 md:h-4 md:w-4" />
          </ToggleGroupItem>

          <ToggleGroupItem
            value="underline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            style={{
              backgroundColor: editor.isActive('underline') ? '#2563eb' : 'transparent',
              color: editor.isActive('underline') ? 'white' : (isLight ? '#374151' : '#e5e7eb')
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('underline')) {
                e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#475569';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('underline')) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <Underline className="h-3 w-3 md:h-4 md:w-4" />
          </ToggleGroupItem>

          <ToggleGroupItem
            value="strike"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            style={{
              backgroundColor: editor.isActive('strike') ? '#2563eb' : 'transparent',
              color: editor.isActive('strike') ? 'white' : (isLight ? '#374151' : '#e5e7eb')
            }}
            onMouseEnter={(e) => {
              if (!editor.isActive('strike')) {
                e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#475569';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('strike')) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <Strikethrough className="h-3 w-3 md:h-4 md:w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>



      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Alignment Controls */}
        <ToggleGroup 
          type="single"
          value={getCurrentAlignment()}
          onValueChange={(value) => {
            if (value) editor.chain().focus().setTextAlign(value).run();
          }}
          className="flex gap-0 md:gap-1"
        >
          <ToggleGroupItem
            value="left"
            size="sm"
            className="h-8 w-8 p-0"
            style={{
              backgroundColor: getCurrentAlignment() === 'left' ? '#2563eb' : 'transparent',
              color: getCurrentAlignment() === 'left' ? 'white' : (isLight ? '#374151' : '#e5e7eb')
            }}
            onMouseEnter={(e) => {
              if (getCurrentAlignment() !== 'left') {
                e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#475569';
              }
            }}
            onMouseLeave={(e) => {
              if (getCurrentAlignment() !== 'left') {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <AlignLeft className="h-3 w-3 md:h-4 md:w-4" />
          </ToggleGroupItem>
          
          <ToggleGroupItem
            value="center"
            size="sm"
            className="h-8 w-8 p-0"
            style={{
              backgroundColor: getCurrentAlignment() === 'center' ? '#2563eb' : 'transparent',
              color: getCurrentAlignment() === 'center' ? 'white' : (isLight ? '#374151' : '#e5e7eb')
            }}
            onMouseEnter={(e) => {
              if (getCurrentAlignment() !== 'center') {
                e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#475569';
              }
            }}
            onMouseLeave={(e) => {
              if (getCurrentAlignment() !== 'center') {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <AlignCenter className="h-3 w-3 md:h-4 md:w-4" />
          </ToggleGroupItem>
          
          <ToggleGroupItem
            value="right"
            size="sm"
            className="h-8 w-8 p-0"
            style={{
              backgroundColor: getCurrentAlignment() === 'right' ? '#2563eb' : 'transparent',
              color: getCurrentAlignment() === 'right' ? 'white' : (isLight ? '#374151' : '#e5e7eb')
            }}
            onMouseEnter={(e) => {
              if (getCurrentAlignment() !== 'right') {
                e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#475569';
              }
            }}
            onMouseLeave={(e) => {
              if (getCurrentAlignment() !== 'right') {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <AlignRight className="h-3 w-3 md:h-4 md:w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>



      <div className="flex items-center gap-1 flex-shrink-0">
        {/* List Controls */}
        <div className="flex gap-0 md:gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              "h-8 w-8 p-0",
              editor.isActive('bulletList') ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''
            )}
            style={!editor.isActive('bulletList') ? {
              backgroundColor: 'transparent',
              color: isLight ? '#374151' : '#e5e7eb'
            } : {}}
            onMouseEnter={(e) => {
              if (!editor.isActive('bulletList')) {
                e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#475569';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('bulletList')) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <List className="h-3 w-3 md:h-4 md:w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(
              "h-8 w-8 p-0",
              editor.isActive('orderedList') ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''
            )}
            style={!editor.isActive('orderedList') ? {
              backgroundColor: 'transparent',
              color: isLight ? '#374151' : '#e5e7eb'
            } : {}}
            onMouseEnter={(e) => {
              if (!editor.isActive('orderedList')) {
                e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#475569';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('orderedList')) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <ListOrdered className="h-3 w-3 md:h-4 md:w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={cn(
              "h-8 w-8 p-0",
              editor.isActive('blockquote') ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''
            )}
            style={!editor.isActive('blockquote') ? {
              backgroundColor: 'transparent',
              color: isLight ? '#374151' : '#e5e7eb'
            } : {}}
            onMouseEnter={(e) => {
              if (!editor.isActive('blockquote')) {
                e.currentTarget.style.backgroundColor = isLight ? '#f3f4f6' : '#475569';
              }
            }}
            onMouseLeave={(e) => {
              if (!editor.isActive('blockquote')) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <Quote className="h-3 w-3 md:h-4 md:w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};