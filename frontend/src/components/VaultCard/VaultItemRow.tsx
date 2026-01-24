import React from 'react';
import { Key, FileText, Eye, EyeOff, Copy, Pencil, Trash2, Check, X, GripVertical } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VaultItem } from '@/types';
import { cn } from '@/lib/utils';

interface VaultItemRowProps {
  item: VaultItem;
  isVisible: boolean;
  isEditing: boolean;
  editingLabel: string;
  editingValue: string;
  onToggleVisibility: () => void;
  onCopy: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onEditingLabelChange: (value: string) => void;
  onEditingValueChange: (value: string) => void;
  isDragging?: boolean;
  dragHandleProps?: any;
}

export const VaultItemRow: React.FC<VaultItemRowProps> = ({
  item,
  isVisible,
  isEditing,
  editingLabel,
  editingValue,
  onToggleVisibility,
  onCopy,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onEditingLabelChange,
  onEditingValueChange,
  isDragging,
  dragHandleProps
}) => {
  const isKeyValue = item.item_type === 'key_value';
  const maskedValue = '••••••••••••';
  
  if (isEditing) {
    return (
      <div className={cn(
        "flex flex-col gap-2 p-3 rounded-lg border bg-muted/30",
        isDragging && "opacity-50"
      )}>
        <div className="flex items-center gap-2">
          {isKeyValue ? (
            <Key className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
          <Input
            value={editingLabel}
            onChange={(e) => onEditingLabelChange(e.target.value)}
            placeholder={isKeyValue ? "KEY_NAME" : "Note title"}
            className="h-8 font-mono text-sm"
            autoFocus
          />
        </div>
        
        {isKeyValue ? (
          <Input
            value={editingValue}
            onChange={(e) => onEditingValueChange(e.target.value)}
            placeholder="Value"
            className="h-8 font-mono text-sm"
          />
        ) : (
          <Textarea
            value={editingValue}
            onChange={(e) => onEditingValueChange(e.target.value)}
            placeholder="Secure note content..."
            className="font-mono text-sm min-h-[80px]"
          />
        )}
        
        <div className="flex items-center gap-1 justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={onSaveEdit}
            className="h-7 px-2"
          >
            <Check className="h-4 w-4 mr-1" />
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancelEdit}
            className="h-7 px-2"
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "group flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors",
      isDragging && "opacity-50 bg-muted/50"
    )}>
      {/* Drag handle */}
      <div 
        {...dragHandleProps}
        className="cursor-grab active:cursor-grabbing p-1 opacity-0 group-hover:opacity-50 hover:opacity-100 transition-opacity"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      
      {/* Item type icon */}
      <div className="flex-shrink-0 pt-0.5">
        {isKeyValue ? (
          <Key className="h-4 w-4 text-muted-foreground" />
        ) : (
          <FileText className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium truncate">
            {item.label}
          </span>
          {isKeyValue && (
            <span className="text-muted-foreground">=</span>
          )}
        </div>
        
        <div className="mt-1">
          {isKeyValue ? (
            <code className={cn(
              "font-mono text-sm break-all",
              !isVisible && "text-muted-foreground"
            )}>
              {isVisible ? item.value : maskedValue}
            </code>
          ) : (
            <p className={cn(
              "text-sm whitespace-pre-wrap break-words",
              !isVisible && "text-muted-foreground"
            )}>
              {isVisible ? item.value : maskedValue}
            </p>
          )}
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="ghost"
          onClick={onToggleVisibility}
          className="h-7 w-7 p-0"
          title={isVisible ? "Hide value" : "Show value"}
        >
          {isVisible ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onCopy}
          className="h-7 w-7 p-0"
          title="Copy value"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onStartEdit}
          className="h-7 w-7 p-0"
          title="Edit item"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          title="Delete item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};
