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

interface RichTextToolbarProps {
  editor: Editor | null;
  className?: string;
}

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

  return (
    <div className={cn(
      "flex items-center gap-1 p-2 border-b border-gray-200 bg-gray-50 overflow-x-auto",
      "md:gap-2", // Larger gaps on desktop
      className
    )}>
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
        <SelectTrigger className="w-20 md:w-24 h-8 text-xs">
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

      {/* Formatting Buttons */}
      <div className="flex gap-0 md:gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive('bold') && "bg-accent text-accent-foreground"
          )}
        >
          <Bold className="h-3 w-3 md:h-4 md:w-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive('italic') && "bg-accent text-accent-foreground"
          )}
        >
          <Italic className="h-3 w-3 md:h-4 md:w-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive('underline') && "bg-accent text-accent-foreground"
          )}
        >
          <Underline className="h-3 w-3 md:h-4 md:w-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive('strike') && "bg-accent text-accent-foreground"
          )}
        >
          <Strikethrough className="h-3 w-3 md:h-4 md:w-4" />
        </Button>
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-gray-300 mx-1" />

      {/* Alignment Controls */}
      <ToggleGroup 
        type="single" 
        value={getCurrentAlignment()}
        onValueChange={(value) => {
          if (value) {
            editor.chain().focus().setTextAlign(value).run();
          }
        }}
        className="gap-0 md:gap-1"
      >
        <ToggleGroupItem
          value="left"
          size="sm"
          className="h-8 w-8 p-0"
        >
          <AlignLeft className="h-3 w-3 md:h-4 md:w-4" />
        </ToggleGroupItem>
        
        <ToggleGroupItem
          value="center"
          size="sm"
          className="h-8 w-8 p-0"
        >
          <AlignCenter className="h-3 w-3 md:h-4 md:w-4" />
        </ToggleGroupItem>
        
        <ToggleGroupItem
          value="right"
          size="sm"
          className="h-8 w-8 p-0"
        >
          <AlignRight className="h-3 w-3 md:h-4 md:w-4" />
        </ToggleGroupItem>
      </ToggleGroup>

      {/* Divider */}
      <div className="h-6 w-px bg-gray-300 mx-1" />

      {/* List Controls */}
      <div className="flex gap-0 md:gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive('bulletList') && "bg-accent text-accent-foreground"
          )}
        >
          <List className="h-3 w-3 md:h-4 md:w-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive('orderedList') && "bg-accent text-accent-foreground"
          )}
        >
          <ListOrdered className="h-3 w-3 md:h-4 md:w-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive('blockquote') && "bg-accent text-accent-foreground"
          )}
        >
          <Quote className="h-3 w-3 md:h-4 md:w-4" />
        </Button>
      </div>
    </div>
  );
}; 