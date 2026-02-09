import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Check, CheckSquare } from 'lucide-react';

const NEUTRAL_GRAY = '#808080';

interface SharedListItem {
  id: string;
  text: string;
  completed: boolean;
}

interface SharedListData {
  id: string;
  title: string;
  category: string;
  items: SharedListItem[];
  color_value?: string;
  created_at: string;
  updated_at: string;
  creator_name: string;
  type: 'list';
}

interface SharedListCardProps {
  listData: SharedListData;
  isLive?: boolean;
}

export const SharedListCard: React.FC<SharedListCardProps> = ({ listData, isLive = false }) => {
  const [animatingItems, setAnimatingItems] = useState<Set<string>>(new Set());
  const [previousItems, setPreviousItems] = useState(listData.items);
  const [titleChanged, setTitleChanged] = useState(false);

  const totalItems = listData.items.length;
  const completedItems = listData.items.filter(item => item.completed).length;
  const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  // Use the list's color or default to blue
  const listColor = listData.color_value || '#3B82F6';

  // Category display matching canvas logic
  const displayCategory = listData.category || 'General';
  const displayColor = displayCategory === 'General' ? NEUTRAL_GRAY : listColor;

  // Detect changes and animate them
  useEffect(() => {
    if (!isLive || !previousItems) return;

    const newAnimatingItems = new Set<string>();

    // Check for item changes (completion status or text)
    listData.items.forEach(item => {
      const previousItem = previousItems.find(prev => prev.id === item.id);
      if (!previousItem ||
          previousItem.completed !== item.completed ||
          previousItem.text !== item.text) {
        newAnimatingItems.add(item.id);
      }
    });

    // Check for new items
    listData.items.forEach(item => {
      if (!previousItems.find(prev => prev.id === item.id)) {
        newAnimatingItems.add(item.id);
      }
    });

    setAnimatingItems(newAnimatingItems);
    setPreviousItems(listData.items);

    // Clear animations after delay
    if (newAnimatingItems.size > 0) {
      setTimeout(() => setAnimatingItems(new Set()), 1500);
    }
  }, [listData.items, isLive, previousItems]);

  // Detect title changes
  useEffect(() => {
    if (isLive && previousItems.length > 0) {
      // We can't easily track title changes without previous title state
      // For now, we'll skip title change animations
    }
  }, [listData.title, isLive]);

  return (
    <div className="w-full max-w-md mx-auto">
      <Card
        className="w-full shadow-lg border transition-all duration-200"
        style={{
          '--list-color': listColor
        } as React.CSSProperties}
      >
        {/* Header */}
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              {/* Colored dot */}
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: listColor }}
              />
              <CheckSquare className="h-4 w-4 text-slate-500" />
            </div>
<div className="flex-1">
              <h3
                className="text-lg font-medium text-gray-900 dark:text-gray-100 truncate"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                {listData.title}
              </h3>
              <div
                className="inline-block px-2 py-1 rounded-full text-xs font-medium text-white mt-1 font-raleway border-none"
                style={{
                  backgroundColor: displayColor
                }}
              >
                {displayCategory}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Progress Bar */}
          {totalItems > 0 && (
            <div className="px-6 pb-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span 
                  className="text-gray-600 dark:text-gray-400 italic"
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  {completedItems} of {totalItems} completed
                </span>
                <span 
                  className="text-gray-600 dark:text-gray-400 italic"
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  {Math.round(progress)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-300 ease-in-out"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: listColor
                  }}
                />
              </div>
            </div>
          )}
          
{/* List Items */}
          <div className="px-6 py-2 space-y-0.5 overflow-hidden">
            {listData.items.map((item) => (
              <div
                key={item.id}
                className={`flex items-center py-2 px-2 rounded-md transition-all duration-300 min-w-0 ${
                  animatingItems.has(item.id)
                    ? 'bg-blue-50 dark:bg-blue-900/20 scale-[1.02] shadow-sm'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="flex-shrink-0 mr-2">
                  <div
                    style={item.completed ? { backgroundColor: listColor, borderColor: listColor } : {}}
                    className={`w-4 h-4 min-w-[16px] min-h-[16px] max-w-[16px] max-h-[16px] rounded-sm border flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                      item.completed ? '' : 'border-gray-300'
                    } ${animatingItems.has(item.id) ? 'scale-110' : ''}`}
                  >
                    {item.completed && <Check className="h-3 w-3 text-white" />}
                  </div>
                </div>
                <span
                  className={`flex-1 text-sm transition-all duration-200 truncate ${
                    item.completed
                      ? 'line-through text-gray-500 dark:text-gray-400'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                  title={item.text}
                >
                  {item.text}
                </span>
                {/* Change indicator */}
                {!animatingItems.has(item.id) && (
                  <div className="w-2 h-2 min-w-[8px]" />
                )}
                {animatingItems.has(item.id) && (
                  <div className="w-2 h-2 min-w-[8px] bg-blue-500 rounded-full animate-ping flex-shrink-0" />
                )}
              </div>
            ))}
            
            {listData.items.length === 0 && (
              <div 
                className="text-gray-400 dark:text-gray-300 text-sm py-4 italic text-center"
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                This list is empty.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Creator Attribution */}
      <div className="mt-4 text-center">
        <p 
          className="text-sm text-gray-500 dark:text-gray-400"
          style={{ fontFamily: '"Raleway", sans-serif' }}
        >
          Created by <span className="font-medium">{listData.creator_name}</span> on{' '}
          {new Date(listData.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};
