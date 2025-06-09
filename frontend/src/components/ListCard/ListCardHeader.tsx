import React from 'react';
import { MoreVertical, Edit3, Trash2, X, Check, ChevronDown } from 'lucide-react';
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ListCardHeaderProps {
  title: string;
  color: string;
  isEditing: boolean;
  editTitle: string;
  isCollapsibleOpen: boolean;
  setEditTitle: (value: string) => void;
  setIsEditing: (value: boolean) => void;
  handleEditTitle: () => void;
  handleDeleteList: () => void;
  titleEditRef: React.RefObject<HTMLInputElement>;
}

export const ListCardHeader: React.FC<ListCardHeaderProps> = ({
  title,
  color,
  isEditing,
  editTitle,
  isCollapsibleOpen,
  setEditTitle,
  setIsEditing,
  handleEditTitle,
  handleDeleteList,
  titleEditRef
}) => {
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
            <div className="flex items-center">
              <CardTitle
                className="text-lg font-medium cursor-pointer"
                onClick={() => setIsEditing(true)}
              >
                <span className={`inline-block w-3 h-3 rounded-full mr-2 ${color} opacity-80`}></span>
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
                  <DropdownMenuItem onClick={() => setIsEditing(true)}>
                    <Edit3 className="mr-2 h-4 w-4" />
                    Edit Title
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeleteList} className="text-red-600">
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
