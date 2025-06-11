import React from 'react';
import { MoreVertical, Edit3, Trash2, X, Check, ChevronDown, Palette, CheckSquare } from 'lucide-react';
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ColorPicker } from '@/components/ui/color-picker';
import { useToast } from '@/hooks/use-toast';

interface ListCardHeaderProps {
  title: string;
  listColor: string | null | undefined; // Changed from 'color'
  isEditing: boolean;
  editTitle: string;
  isCollapsibleOpen: boolean;
  setEditTitle: (value: string) => void;
  setIsEditing: (value: boolean) => void;
  handleEditTitle: () => void;
  handleDeleteList: () => void;
  titleEditRef: React.RefObject<HTMLInputElement>;
  onColorSave: (newColor: string) => Promise<void>;
  isSavingColor?: boolean;
}

export const ListCardHeader: React.FC<ListCardHeaderProps> = ({
  title,
  listColor, // Changed from 'color'
  isEditing,
  editTitle,
  isCollapsibleOpen,
  setEditTitle,
  setIsEditing,
  handleEditTitle,
  handleDeleteList,
  titleEditRef,
  onColorSave,
  isSavingColor
}) => {
  const { toast } = useToast();
  const [currentColorPreview, setCurrentColorPreview] = React.useState(listColor || '#808080');

  React.useEffect(() => {
    setCurrentColorPreview(listColor || '#808080');
  }, [listColor]);

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
                  // Only save if color actually changed from original listColor
                  if (finalColor !== (listColor || '#808080')) {
                    try {
                      await onColorSave(finalColor);
                    } catch (error) {
                      toast({
                        title: 'Error',
                        description: 'Could not save color. Reverting preview.',
                        variant: 'destructive',
                      });
                      setCurrentColorPreview(listColor || '#808080'); // Revert preview on save error
                    }
                  }
                }}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 p-0 rounded-full flex items-center justify-center relative"
                  aria-label="Change list color"
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
              <CheckSquare className="h-4 w-4 text-slate-500" />
              <CardTitle
                className="text-lg font-medium cursor-pointer"
                style={{ fontFamily: '"Raleway", sans-serif' }}
                onClick={() => setIsEditing(true)}
              >
                {title}
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
                  <DropdownMenuItem onClick={() => setIsEditing(true)} style={{ fontFamily: '"Raleway", sans-serif' }}>
                    <Edit3 className="mr-2 h-4 w-4" />
                    Edit Title
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeleteList} className="text-red-600" style={{ fontFamily: '"Raleway", sans-serif' }}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete List
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
