import React from 'react';
import { MoreVertical, Edit3, Trash2, X, Check, ChevronDown } from 'lucide-react';
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CollapsibleTrigger } from "@/components/ui/collapsible";
import { ColorPicker } from '@/components/ui/color-picker';
import { useToast } from '@/hooks/use-toast';
import { cn } from "@/lib/utils";

interface NoteCardHeaderProps {
  title: string;
  noteColor: string | null | undefined;
  isEditing: boolean;
  editTitle: string;
  isCollapsibleOpen: boolean;
  setEditTitle: (value: string) => void;
  setIsEditing: (value: boolean) => void;
  handleEditTitle: () => void;
  handleDeleteNote: () => void;
  titleEditRef: React.RefObject<HTMLInputElement>;
  onColorSave: (newColor: string) => Promise<void>;
  isSavingColor?: boolean;
}

export const NoteCardHeader: React.FC<NoteCardHeaderProps> = ({
  title,
  noteColor,
  isEditing,
  editTitle,
  isCollapsibleOpen,
  setEditTitle,
  setIsEditing,
  handleEditTitle,
  handleDeleteNote,
  titleEditRef,
  onColorSave,
  isSavingColor
}) => {
  const { toast } = useToast();
  const [currentColorPreview, setCurrentColorPreview] = React.useState(noteColor || '#FFFFE0');

  React.useEffect(() => {
    setCurrentColorPreview(noteColor || '#FFFFE0');
  }, [noteColor]);

  const effectiveColor = currentColorPreview;
  
  return (
    <CardHeader className="pb-2">
      <div className="flex justify-between items-center">
        {isEditing ? (
          <div className="flex gap-1 w-full">
            <Input
              ref={titleEditRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="h-8"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleEditTitle();
                }
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleEditTitle}
              className="h-8 w-8 p-0"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsEditing(false)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <ColorPicker
                color={effectiveColor}
                onChange={(newColor) => {
                  setCurrentColorPreview(newColor);
                }}
                onSave={async (finalColor) => { 
                  if (finalColor !== (noteColor || '#FFFFE0')) {
                    try {
                      await onColorSave(finalColor);
                    } catch (error) {
                      toast({
                        title: 'Error',
                        description: 'Could not save color. Reverting preview.',
                        variant: 'destructive',
                      });
                      setCurrentColorPreview(noteColor || '#FFFFE0');
                    }
                  }
                }}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 p-0 rounded-full flex items-center justify-center relative"
                  aria-label="Change note color"
                  disabled={isSavingColor}
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full border border-gray-400 transition-colors duration-150"
                    style={{ backgroundColor: effectiveColor }}
                  />
                  {isSavingColor && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-full">
                      <div className="h-2 w-2 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
                    </div>
                  )}
                </Button>
              </ColorPicker>
              <CardTitle
                className="text-lg font-medium cursor-pointer"
                onClick={() => setIsEditing(true)}
              >
                {title || 'Untitled Note'}
              </CardTitle>
            </div>
            <div className="flex">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <ChevronDown className={cn(
                    "h-4 w-4 transition-transform",
                    isCollapsibleOpen ? "" : "transform rotate-180"
                  )}/>
                </Button>
              </CollapsibleTrigger>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsEditing(true)}>
                    <Edit3 className="mr-2 h-4 w-4" />
                    Edit Title
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeleteNote} className="text-red-600">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Note
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </div>
    </CardHeader>
  );
}; 