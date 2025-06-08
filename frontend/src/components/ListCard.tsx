
import React, { useState } from 'react';
import { MoreVertical, Trash2, Edit3, Plus, Check, X, GripVertical } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface ListItem {
  id: string;
  text: string;
  completed: boolean;
}

interface List {
  id: string;
  title: string;
  type: string;
  items: ListItem[];
  createdAt: Date;
  color: string;
}

interface ListCardProps {
  list: List;
  onUpdate: (list: List) => void;
  onDelete: (listId: string) => void;
}

const ListCard: React.FC<ListCardProps> = ({ list, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(list.title);
  const [newItemText, setNewItemText] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);
  const { toast } = useToast();

  const handleEditTitle = () => {
    if (editTitle.trim() && editTitle.trim() !== list.title) {
      onUpdate({
        ...list,
        title: editTitle.trim()
      });
      toast({
        title: "List updated",
        description: "Your list title has been changed.",
      });
    }
    setIsEditing(false);
  };

  const handleAddItem = () => {
    if (newItemText.trim()) {
      const newItem: ListItem = {
        id: Date.now().toString(),
        text: newItemText.trim(),
        completed: false
      };
      
      onUpdate({
        ...list,
        items: [...list.items, newItem]
      });
      
      setNewItemText('');
      setShowAddItem(false);
      
      toast({
        title: "Item added",
        description: `Added "${newItem.text}" to your list.`,
      });
    }
  };

  const toggleItemCompleted = (itemId: string) => {
    onUpdate({
      ...list,
      items: list.items.map(item =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      )
    });
  };

  const removeItem = (itemId: string) => {
    onUpdate({
      ...list,
      items: list.items.filter(item => item.id !== itemId)
    });
    
    toast({
      title: "Item removed",
      description: "The item has been deleted from your list.",
    });
  };

  const completedCount = list.items.filter(item => item.completed).length;
  const totalCount = list.items.length;

  return (
    <Card className="group hover:shadow-lg transition-all duration-200 border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {isEditing ? (
              <div className="flex items-center space-x-2">
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={handleEditTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEditTitle();
                    if (e.key === 'Escape') {
                      setEditTitle(list.title);
                      setIsEditing(false);
                    }
                  }}
                  className="text-lg font-semibold h-8"
                  autoFocus
                />
                <Button size="sm" variant="ghost" onClick={handleEditTitle}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <CardTitle className="text-lg leading-tight cursor-pointer" onClick={() => setIsEditing(true)}>
                  {list.title}
                </CardTitle>
                <button
                  onClick={() => setIsEditing(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-100 rounded"
                >
                  <Edit3 className="h-3 w-3 text-slate-400" />
                </button>
              </div>
            )}
            
            <div className="flex items-center justify-between mt-2">
              <Badge variant="secondary" className="text-xs">
                {list.type}
              </Badge>
              {totalCount > 0 && (
                <span className="text-xs text-slate-500">
                  {completedCount}/{totalCount} completed
                </span>
              )}
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white">
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Edit3 className="h-4 w-4 mr-2" />
                Edit Title
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onDelete(list.id)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete List
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="w-full bg-slate-200 rounded-full h-2 mb-4">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(completedCount / totalCount) * 100}%` }}
            />
          </div>
        )}

        {/* Items list */}
        <div className="space-y-2 mb-4">
          {list.items.map((item) => (
            <div key={item.id} className="flex items-center space-x-2 group/item">
              <button
                onClick={() => toggleItemCompleted(item.id)}
                className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                  item.completed 
                    ? 'bg-blue-600 border-blue-600 text-white' 
                    : 'border-slate-300 hover:border-blue-400'
                }`}
              >
                {item.completed && <Check className="h-3 w-3" />}
              </button>
              
              <span className={`flex-1 text-sm ${
                item.completed ? 'line-through text-slate-500' : 'text-slate-700'
              }`}>
                {item.text}
              </span>
              
              <button
                onClick={() => removeItem(item.id)}
                className="opacity-0 group-hover/item:opacity-100 transition-opacity p-1 hover:bg-red-100 rounded text-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Add new item */}
        {showAddItem ? (
          <div className="flex items-center space-x-2">
            <Input
              placeholder="Add new item..."
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddItem();
                if (e.key === 'Escape') {
                  setNewItemText('');
                  setShowAddItem(false);
                }
              }}
              className="text-sm"
              autoFocus
            />
            <Button size="sm" onClick={handleAddItem} disabled={!newItemText.trim()}>
              <Check className="h-4 w-4" />
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => {
                setNewItemText('');
                setShowAddItem(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAddItem(true)}
            className="w-full justify-start text-slate-500 hover:text-slate-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add item
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default ListCard;
